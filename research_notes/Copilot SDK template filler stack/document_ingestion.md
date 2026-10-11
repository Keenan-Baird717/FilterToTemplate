# Document Ingestion and Parsing for a Node 24 / Electron Template-Filler App (state as of Oct 2026)

Research date: 2026-10-11. Several pricing figures come from secondary aggregators because vendor pricing pages render prices client-side (Azure showed "$-" placeholders) or were not reachable. Each one is flagged. Benchmark numbers are often self-reported by the vendor and are flagged too.

## 1. Pure Node/JS libraries: quality, maintenance, licensing

### Takeaway
A pure-Node stack can handle born-digital PDFs, DOCX, XLSX/CSV, PPTX, email and plain text with permissive (MIT/Apache/BSD) licenses and positional data good enough for page-level citations. The main pieces are unpdf/pdf.js, mammoth, officeParser, SheetJS CE, postal-mime/msgreader and tesseract.js. The weak spots are scanned-document OCR quality (tesseract.js), table structure in PDFs, and one licensing trap: MuPDF/mupdf.js is AGPL-3.0 or paid commercial. Two newer options with native Rust cores and Node bindings are worth evaluating as an "all-in-one" layer: LlamaIndex LiteParse (Apache-2.0) and Kreuzberg (now Xberg).

### Cited Findings
**PDF (born-digital)**
- unpdf (MIT, by Johann Schopplich / UnJS) bundles a serverless build of PDF.js v5.6.205 and runs on Node, Deno, Bun, browsers and Workers. `extractText` returns per-page strings (with `mergePages:false`). `extractTextItems` returns per-page items with `x, y, width, height, fontSize, fontFamily, dir, hasEOL` in a bottom-left-origin coordinate system. `renderPageAsImage` renders pages to PNG, but only in Node/browser, and in Node it needs `@napi-rs/canvas`. Other APIs: `extractImages`, `extractLinks`, `getMeta` — [unpdf GitHub](https://github.com/unjs/unpdf)
- unpdf's security notes: for untrusted PDFs `maxImageSize` is unlimited by default, extraction functions process every page, and serverless parsing runs on the event loop without a worker, so add timeouts. Raw `getDocument` from `unpdf/pdfjs` applies none of these safeguards. PDF.js v5 uses `Promise.withResolvers` (Node < 22 needs a polyfill; not an issue on Node 24) — [unpdf GitHub](https://github.com/unjs/unpdf)
- pdf-parse v2 (mehmet-kozan/pdf-parse, Apache-2.0) is a rewrite. It adds `getText()` with per-page `partial` selection, `getTable()` (table detection), `getImage()`, `getScreenshot()` (render page to PNG), `getInfo()` (per-page info) and a CLI. It supports Node 20.16+, 22.3+, 23 and 24.0+. The CDN examples pin 2.4.5 — [pdf-parse GitHub](https://github.com/mehmet-kozan/pdf-parse)
- mupdf.js (Artifex) is dual-licensed under AGPL v3 or a commercial license. A commercial license is "required for proprietary applications ... where AGPL compliance isn't possible," and the license covers both the JS wrapper and the WASM binary. Technically it is strong: `toStructuredText()` gives blocks, lines and spans with bboxes and fonts, and it renders at any DPI, ships WASM with no native deps, is ESM-only, and runs on Node 18+ — [mupdf.js GitHub](https://github.com/ArtifexSoftware/mupdf.js)

**Office formats**
- mammoth.js (BSD-2-Clause) converts DOCX to semantic HTML. Headings are mapped via a style map, and lists, tables (borders ignored), images and footnotes/endnotes are preserved. It deliberately ignores visual styling. **Its Markdown output is deprecated**: the README recommends generating HTML and converting it with a separate library (e.g., turndown) — [mammoth.js GitHub](https://github.com/mwilliamson/mammoth.js)
- officeParser v8 (MIT) parses docx, pptx, xlsx, odt/odp/ods/odg, pdf, rtf, csv, md, html, epub and LaTeX into a format-agnostic AST (`OfficeParserAST`). Tables have row/cell structure with rowSpan/colSpan. PDF nodes carry `bounds` geometry, and tagged PDFs yield headings, tables and lists. RAG chunks include `pageNumber` (PDF) and `slideNumber` (PPTX). OCR is available via Tesseract (`ocr: true` plus `extractAttachments: true`). It requires Node >= 22.13. Signals: about 517 commits, 4 open issues — [officeParser GitHub](https://github.com/harshankur/officeParser)

**Spreadsheets**
- SheetJS Community Edition is Apache-2.0, and "commercial use in proprietary applications and distribution as part of products is permitted." All rights not explicitly granted are reserved by SheetJS LLC — [SheetJS license docs](https://docs.sheetjs.com/docs/miscellany/license)
- **SheetJS distribution trap:** the npm registry `xlsx` package is stale at 0.18.5, which SheetJS calls "a known registry bug." The authoritative source is the SheetJS CDN tarball (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, version 0.20.3). Snyk flags a prototype-pollution issue in older versions, resolved in 0.19.3 per Snyk — [SheetJS Node install docs](https://docs.sheetjs.com/docs/getting-started/installation/nodejs)
- ExcelJS: Snyk Advisor rated upstream `exceljs` (v4.4.0) inactive, with no npm release in 12 months, 592 open issues and 116 open PRs. That snapshot is undated, and I found no evidence of a 2026 release — [Snyk Advisor exceljs](https://snyk.io/advisor/npm-package/exceljs)

**Email**
- nodemailer/mailparser (MIT) is now **in maintenance mode**: it gets security and critical fixes only, with no new features. The README recommends **PostalMime** for new projects (works in Node and browsers). mailparser is stream-based and suited to 100 MB+ messages. `simpleParser` inlines `cid:` images as data URLs up to `maxInlinedImagesSize` (default 20 MB) — [mailparser GitHub](https://github.com/nodemailer/mailparser)
- `@kenjiuno/msgreader` (HiraokaHyperTools/msgreader) reads Outlook .msg files: `getFileData()` returns attachments, recipients, sender and body. It also has a CLI for extracting RTF and attachments — [msgreader GitHub](https://github.com/HiraokaHyperTools/msgreader). An alternative is `msg-parser` (read-only; attachments, embedded MSG, recipients) — [msg-parser npm](https://www.npmjs.com/package/msg-parser)

**OCR in JS**
- tesseract.js v7.0.0 reports 15–35% faster runtimes than v6 and requires Node 16+. v6 fixed a memory leak and turned non-text outputs off by default (re-enable with e.g. `hocr: true`). The README says it does **not** support PDF files directly, so pages must be rendered to images first — [newreleases tesseract.js 7.0.0](https://newreleases.io/project/npm/tesseract.js/release/7.0.0); [tesseract.js 6.0.1 README](https://unpkg.com/tesseract.js@6.0.1/README.md)

**All-in-one native options with Node bindings (new in 2026)**
- **LlamaIndex LiteParse** (Apache-2.0) is a local, "fast and light" parser with no cloud dependency. Its current core is **Rust**, with Node/TS bindings via napi-rs (`@llamaindex/liteparse`), a WASM build (`@llamaindex/liteparse-wasm`), Python bindings and a `lit` CLI. It parses PDF natively via PDFium. Word, PowerPoint and spreadsheet formats (.doc/.docx/.pptx/.xlsx/.odt/.key/.numbers, etc.) are **converted to PDF via LibreOffice, which must be installed separately**. Images are handled natively. It bundles Tesseract (tesseract-rs) for OCR or can call an external HTTP OCR server (`POST /ocr` returning text, bbox and confidence, with example wrappers for EasyOCR/PaddleOCR). Output is text, JSON with bounding boxes (optionally layout blocks) or Markdown, plus PNG page screenshots (default 150 DPI). The benchmark section cites v2.14.4 (2026-09-09) — [LiteParse GitHub](https://github.com/run-llama/liteparse)
- **Outdated-information flag:** March 2026 launch coverage described LiteParse as TypeScript-native, using PDF.js and Tesseract.js — [MarkTechPost, 2026-03-19](https://www.marktechpost.com/2026/03/19/llamaindex-releases-liteparse-a-cli-and-typescript-native-library-for-spatial-pdf-parsing-in-ai-agent-workflows/). The current repo describes a Rust core, so the early articles are stale.
- **Kreuzberg** has a Rust core with native bindings for Node/TS (`@kreuzberg/node`; `extractFile`/`extractFileSync` return content, metadata and tables). v4.3.0 added DocumentStructure support across bindings (`include_document_structure`), a PaddleOCR feature flag in the Node binding, and musl Linux binaries. **The v4 line is now LTS (critical/security fixes best-effort until end of 2026), and active development moved to "Xberg" (a fresh v1 line)** — [newreleases Xberg v4.3.0](https://newreleases.io/project/github/xberg-io/xberg/release/v4.3.0); [pkg.go.dev xberg](https://pkg.go.dev/github.com/xberg-io/xberg@v1.0.5)

### Inferences
- For a commercial closed-source desktop app, avoid mupdf.js/PyMuPDF unless you buy an Artifex license. PDF.js (via unpdf or pdf-parse v2) or PDFium (via LiteParse) cover extraction and rendering under permissive licenses.
- Install SheetJS from the CDN tarball, not `npm i xlsx`, or you get the stale 0.18.5 with its known advisories. For read-only ingestion, SheetJS CE is the better-maintained choice over ExcelJS.
- For new email work, use PostalMime for .eml and @kenjiuno/msgreader for .msg. Treat mailparser as legacy-but-safe.
- DOCX: mammoth (HTML) plus an HTML-to-Markdown converter keeps headings and tables. DOCX has no fixed pagination, so "page" citations for DOCX should be section- or heading-based. Rendering to PDF (e.g., via LibreOffice, as LiteParse does) is the only way to get true page numbers.
- LiteParse is the closest thing to a turnkey local Node parser with bboxes and screenshots. Its dependency on a separately installed LibreOffice for Office formats is a real packaging burden for a desktop app. A practical hybrid is LiteParse (or unpdf) for PDFs and images, with mammoth, officeParser and SheetJS for Office files.
- Kreuzberg's rename and LTS status make it a moving target. Evaluate Xberg's Node package before committing.

### Gaps
- Not verified this session: licenses and current versions of turndown, sharp, PostalMime, `@napi-rs/canvas` and Kreuzberg/Xberg. From prior knowledge, turndown is MIT, sharp is Apache-2.0 (bundling libvips, LGPL), PostalMime is MIT-0 and pdf.js is Apache-2.0. Confirm before shipping.
- The npm page for `pdf-parse` returned 403, so I could not confirm the latest version or that the npm package name now maps to the mehmet-kozan v2 rewrite (the original 1.1.1 package was long unmaintained, per prior knowledge).
- No independent quality benchmark of pure-JS PDF table extraction (pdf-parse `getTable`, officeParser) was found.
- Xberg's Node package name and license were not confirmed.

## 2. Document-to-Markdown converters (MarkItDown, Docling, Marker/Surya, MinerU, Unstructured, Tika) and how a Node app would use them

### Takeaway
Docling (MIT) is the best-licensed, most structurally rich open-source converter. Its DoclingDocument JSON carries page numbers and bboxes. It is Python plus PyTorch, so a Node desktop app would run it as a sidecar (docling-serve over HTTP, using the community `docling-sdk` TS client) or skip it. MarkItDown (MIT) is lightweight but low-fidelity and gives no page provenance from its built-in converters. Marker's code is Apache-2.0, but **its model weights are restricted for commercial use above $5M in revenue or funding**. MinerU uses a custom Apache-based license with additional terms. Tika is Java (a JRE sidecar). No full JS port of Docling, Marker or MinerU exists.

### Cited Findings
**IBM Docling**
- License: MIT for the code. Model licenses are separate. It parses PDF, DOCX, PPTX, XLSX, HTML, EPUB, LaTeX, Markdown, Apple Pages/Numbers/Keynote, ODF, **EML and MSG**, images, audio/video (via ASR) and more. Outputs: Markdown, HTML, DocTags/DocLang and lossless JSON (DoclingDocument). It has a VLM pipeline (`--pipeline vlm --vlm-model granite_docling`), docling-serve (API server) and an MCP server. It requires Python 3.10+ (3.9 support dropped in 2.70.0), runs on macOS, Linux and Windows on x86_64 and arm64, and works air-gapped — [Docling GitHub](https://github.com/docling-project/docling)
- DoclingDocument model: content items `texts`, `tables`, `pictures` and `key_value_items`. Trees: `body` (reading order), `furniture` (headers and footers) and `groups`. Items link by JSON pointer, and bounding boxes and provenance are included where available — [Docling concepts](https://docling-project.github.io/docling/concepts/docling_document/). Field names: `ProvenanceItem{page_no, bbox, charspan}`, `BoundingBox{l, t, r, b, coord_origin}` and `PageItem{page_no, size, image}` — [Docling reference](https://docling-project.github.io/docling/reference/docling_document/)
- Chunkers: `HierarchicalChunker` (one chunk per element, attaches headers and captions) and `HybridChunker` (tokenizer-aware split and merge, `repeat_table_header=True`, `merge_peers`). `contextualize()` returns a metadata-enriched serialization — [Docling chunking](https://docling-project.github.io/docling/concepts/chunking/)
- **JS/TS access:** `docling-sdk` (npm, BSD-3-Clause, community-maintained at btwld/docling-sdk, v2.0.6). It provides an API client for docling-serve (async tasks with progress, chunking, WebSocket progress, VLM pipeline), a CLI wrapper around Python Docling, and a browser "Web OCR" client using WebGPU/WASM (peer deps `@huggingface/transformers` and `onnxruntime-web`). Node 18+ — [docling-sdk README](https://cdn.jsdelivr.net/npm/docling-sdk@2.0.6/README.md). `@docling/docling-core` on npm provides TS type definitions mirroring docling-core but does not convert documents — [@docling/docling-core](https://classic.yarnpkg.com/en/package/@docling/docling-core). A community "docling-ts" pattern consumes pre-converted Docling JSON in TS, with live conversion via docling-serve — [DEV Community](https://dev.to/aairom/building-a-full-stack-document-intelligence-with-the-docling-typescript-ecosystem-32pk)
- On olmOCR-bench, Datalab's (Marker vendor's) table reports **docling 50.3 overall / 64.0 born-digital**, against Marker balanced 76.0 / 83.5 and MinerU pipeline 72.7 / 83.3. The source is a competitor, so treat the numbers as self-reported — [Marker README](https://github.com/datalab-to/marker)

**Microsoft MarkItDown**
- MIT, Python 3.10–3.14. It handles PDF, PPTX, DOCX, XLSX/XLS, images (EXIF plus OCR), audio, HTML, CSV/JSON/XML, ZIP, EPUB and Outlook (`[outlook]` extra). LLM image descriptions apply only to pptx and image files. The `markitdown-ocr` plugin adds LLM-vision OCR for PDF, DOCX, PPTX and XLSX, but **if no `llm_client` is provided, OCR is "silently skipped."** Optional Azure Document Intelligence (`-d`) and Azure Content Understanding (`--use-cu`, which emits `<!-- page 1 -->` markers plus YAML front matter) backends are billable. The README warns its output "may not be the best option for high-fidelity document conversions," and it runs I/O with process privileges, so inputs need sanitizing. A `markitdown-mcp` package exists — [MarkItDown GitHub](https://github.com/microsoft/markitdown)

**Marker / Surya / Chandra (Datalab)**
- Code is Apache-2.0. **Model weights use a modified AI Pubs Open RAIL-M license: free for research, personal use and startups under $5M in funding or revenue. Other commercial use requires a paid plan.** Inputs: PDF, images, PPTX, DOCX, XLSX, HTML, EPUB. Outputs: Markdown, HTML, JSON (page tree of blocks with polygon bbox, section hierarchy) and RAG chunks. Optional `--use_llm` mode (default gemini-3.5-flash; also Claude, OpenAI-compatible, Ollama). "Balanced" mode needs a vLLM server (Docker plus NVIDIA). "Fast" mode uses llama.cpp on CPU/Apple Silicon. `--disable_ocr` does pure text-layer extraction (43.6 olmOCR-bench at about 23.7 pages/s on CPU) — [Marker GitHub](https://github.com/datalab-to/marker)
- Chandra OCR 2 is under a modified OpenRAIL-M license that restricts broader commercial use — [Roboflow, Aug 2026](https://roboflow.com/blog/best-open-source-ocr-models)

**MinerU (OpenDataLab)**
- License: "MinerU Open Source License, based on Apache 2.0 with additional conditions" — [MinerU GitHub](https://github.com/opendatalab/MinerU). Roboflow describes the additional terms as licensing requirements at certain usage or revenue thresholds — [Roboflow](https://roboflow.com/blog/best-open-source-ocr-models)
- MinerU 4.0 (`mineru>=4.0,<5`) has tiers flash/basic/standard/advanced. **Basic runs on CPU via ONNX at about 2 GB RAM. Standard and advanced run on CPU via ONNX plus llama.cpp at 8 GB RAM (Vulkan recommended).** The PyTorch engines need a GPU or MPS with 8 GB+ VRAM, and Intel Macs are limited to basic. Inputs include PDF, images, doc/docx/ppt/pptx/xls/xlsx, rtf, ODF, epub, html, mhtml and csv. It offers a local server (`mineru server start`), a V1 API, a Python SDK and a WebUI. Outputs include Markdown, HTML, Structured Content and Content List V1/V2 with bboxes and 1-based page and block locators — [MinerU GitHub](https://github.com/opendatalab/MinerU)

**Unstructured**
- The open-source library is Apache-2.0 (self-hosting carries no license fee) — [aicoolies](https://aicoolies.com/pricing/unstructured). (Hosted API pricing is in section 3.)

**Apache Tika**
- The latest 3.x is 3.3.2 (July 16, 2026). tika-server now requires `enableUnsecureFeatures=true` for the /pipes, /async and /status endpoints — [Tika 3.3.2 CHANGES](https://apache.cs.utah.edu/tika/3.3.2/CHANGES-3.3.2.txt). Official Docker images come as a minimal JRE server or a `-full` variant with OCR, GDAL, ImageMagick and fonts. The docs warn to bind the port to localhost — [Tika Docker docs (4.0.x)](https://tika.apache.org/docs/4.0.x/using-tika/docker.html)

**Packaging Python in Electron**
- A minimal app importing only `torch` produced about a 4 GB PyInstaller dist, almost all of it `torch\lib` — [PyTorch forum](https://discuss.pytorch.org/t/pyinstaller-pytorch/185917). Datasette Desktop bundled python-build-standalone via electron-builder `extraResources` (100+ MB) — [Simon Willison TIL](https://til.simonwillison.net/electron/python-inside-electron). Baseline frozen Python apps run about 30–120 MB, and basic Electron apps about 50–120 MB — [pythonguis](https://www.pythonguis.com/faq/packaged-installer-file-sizes/)

### Inferences
- Integration options for a Node app, ranked:
  1. **Avoid Python in the default install.** Use the JS and Rust-binding stack from section 1.
  2. **Optional downloadable "high-fidelity engine."** On first use, download a python-build-standalone runtime plus `uv` and Docling or MinerU (CPU wheels), run docling-serve or `mineru server` on localhost, and call it via `docling-sdk` or HTTP from a utilityProcess. This keeps the base installer small.
  3. **PyInstaller-frozen sidecar.** Workable, but torch makes it multi-GB per platform. MinerU's ONNX/llama.cpp CPU tiers may avoid torch entirely, making them more bundle-friendly than Docling (an inference to verify).
- Licensing ranking for commercial use: Docling (MIT), MarkItDown (MIT) and Unstructured OSS (Apache-2.0) are clean. MinerU (Apache plus additional terms; read LICENSE.md) needs legal review. Marker weights and Chandra (OpenRAIL-M variants) need a paid license above $5M.
- MarkItDown is fine as a "quick text" fallback but not as the primary citation-grade parser. It lacks page and bbox provenance in its built-in converters, and its OCR silently no-ops without an LLM client.
- Tika is robust for breadth (1000+ formats) but adds a JRE, offers weak layout and table structure for LLM use, and gives no bboxes. Use it only if exotic formats matter.

### Gaps
- No official Docling JS/TS converter was found. `docling-sdk` is community-maintained (who maintains it is unclear), and `@docling/docling-core` is types only.
- Docling's current release version and CPU throughput (pages/sec on a laptop) were not retrieved.
- MinerU's exact "additional conditions" text (LICENSE.md) was not read.
- No WASM build of Docling, Marker or MinerU was found. LiteParse-wasm and the docling-sdk browser OCR client are the only WASM-ish options seen.
- Unstructured OSS's current hi_res and table capabilities were not reviewed.

## 3. Cloud parsing APIs: pricing per page, accuracy, latency, privacy

### Takeaway
As of Oct 2026, the cheapest high-quality cloud OCR-to-Markdown is **Mistral OCR 4.1** at about $4/1k pages ($2/1k batch). It returns paragraph-level bboxes and confidence scores. Basic cloud OCR (Azure Read, Textract DetectDocumentText, Google Enterprise OCR) runs about $1.50/1k pages but is weak on structure. Layout and table products run about $10–15/1k (Azure Layout, Google Layout Parser, Textract Tables). LlamaParse spans $1.25–$56/1k pages by tier, and Reducto and Unstructured sit around $15–20/1k. Pricing changed repeatedly in 2026, so verify everything on vendor pages.

### Cited Findings
**Mistral OCR**
- Version history from the official changelog: OCR 1 `mistral-ocr-2503` (Mar 2025) → OCR 2 `2505` with annotations (May 2025) → **OCR 3 `mistral-ocr-2512`** (Dec 18, 2025; `table_format` markdown/html, header/footer extraction, hyperlinks) → document annotations 8-page limit removed (Jan 27, 2026) → **OCR 4 `mistral-ocr-4-0`** (Jun 23, 2026; `include_blocks` returns paragraph-level bboxes and structural labels; `pages` accepts ranges like "0-5") → **OCR 4.1 `mistral-ocr-4-1`** (Jul 16, 2026; block-level confidence scores; `mistral-ocr-latest` and `mistral-ocr-4` point to it). **OCR 4.1 went GA Aug 31, 2026. OCR 4.0 was deprecated Sep 29, 2026 and retired Sep 30, 2026**, with OCR 4.1 "at the same price" — [Mistral changelog](https://docs.mistral.ai/getting-started/changelog/)
- Pricing (secondary, consistent across several outlets): OCR 4/4.1 is **$4 per 1,000 pages standard, $2 per 1,000 via Batch API**, and Document AI (annotations) is $5 per 1,000 — [implicator.ai](https://www.implicator.ai/mistral-ocr-4-ships-bounding-boxes-for-170-language-document-ai/); [productbuilder OCR 4.1](https://productbuilder.net/models/mistral-ocr-4-1); [pasqualepillitteri.it](https://pasqualepillitteri.it/en/news/11041/mistral-ocr-4-1-bounding-boxes-marked-up-pages). Mistral's own pricing page says only that OCR is priced per 1,000 pages and that batch is 50% off, with no dollar figure visible — [mistral.ai/pricing](https://mistral.ai/pricing)
- **Conflicts and outdated figures:** OCR 3 was $2/1k ($1/1k batch) with annotations at $3/1k — [aiproductivity Mistral pricing](https://aiproductivity.ai/pricing/mistral-ocr/); [InfoQ Jan 2026](https://www.infoq.com/news/2026/01/mistral-ocr3). A French article says the price grid currently lists $2/1k, and another report cites €3.50/1k on the OCR 4.1 page — [solutions-numeriques](https://www.solutions-numeriques.com/chez-mistral-ai-locr-gagne-en-puissance-mais-pose-deja-la-question-des-couts/). Treat $4/1k as the best estimate, unconfirmed by Mistral's own page.
- OCR 4 supports 170 languages. Mistral self-reports 85.20 on olmOCR-bench and 93.07 on OmniDocBench, notes that competitor scores were internal reproductions, and recommends testing on your own documents — [IDM](https://idm.net.au/node/15652); [implicator.ai](https://www.implicator.ai/mistral-ocr-4-ships-bounding-boxes-for-170-language-document-ai/)

**LlamaParse (LlamaCloud)**
- **$1.25 per 1,000 credits.** Parse tiers (credits/page): **Fast 1, Cost-effective 3, Agentic 10, Agentic Plus 45**. Add-ons: layout extraction +3/page, enriched forms +10/page, spreadsheets 1 credit/sheet. Extraction (parse plus extract): Cost-effective 8, Agentic 25, Agentic Plus 60, Turbo 35. **Re-parsing the same file within 48 hours is free (cache).** Ephemeral files incur no storage charges, and retained files cost 100 credits/GB/day — [LlamaParse pricing](https://developers.llamaindex.ai/llamaparse/general/pricing/)
- Per-page equivalents: Fast ≈ $0.00125, Cost-effective ≈ $0.00375, Agentic ≈ $0.0125, Agentic Plus ≈ $0.056 (computed from the above).
- **Conflict:** an older Python-docs pricing page shows $1.00/1k credits (NA) and Agentic Plus at 90 credits — [LlamaIndex Python pricing](https://developers.llamaindex.ai/python/cloud/general/pricing). A tracker reports the price went from $1.00 to $1.25 in Feb 2026 — [usagepricing LlamaIndex](https://usagepricing.com/blueprint/llamaindex)

**Azure AI Document Intelligence / Content Understanding**
- The official pricing page rendered "$-" placeholders. It confirms a free tier of 500 pages/month, Read/Prebuilt/Custom/Add-on (high-res, font, formula)/Query Fields meters, batch variants, commitment tiers and **disconnected containers** (e.g., Read at 24M or 96M pages/year) — [Azure DI pricing](https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/)
- Secondary figures: **Read about $1.50/1k pages; Layout about $10/1k; prebuilt (invoice, receipt, ID, contract) about $10/1k; custom extraction about $30/1k** — [ERP Research](https://erpresearch.com/erp-add-ons/ocr/azure-document-intelligence/pricing); [KI-Syndikat](https://www.ki-syndikat.de/tools/azure-document-intelligence/); [LiteLLM docs](https://docs.litellm.ai/docs/providers/azure_document_intelligence); [Microsoft Q&A](https://learn.microsoft.com/en-us/answers/a/12439288)
- Content Understanding is billed per 1,000 pages at Minimal, Basic and Standard document tiers. Non-paginated docs are split into 3K-character pages, field extraction adds Azure OpenAI token charges, and contextualization is 1 page = 1,000 tokens. GA API version 2025-11-01, with preview features in 2026-06-01-preview — [Content Understanding pricing explainer](https://learn.microsoft.com/en-us/azure/ai-services/content-understanding/pricing-explainer)

**Google Document AI and AWS Textract (secondary sources; verify)**
- Google: **Layout Parser about $10/1k pages.** Enterprise Document OCR about $1.50/1k (first 1–5M/month), then $0.60/1k. Form Parser and Custom Extractor about $30/1k, then $20/1k above 1M — [ud.hk Aug 2026](https://ud.hk/en/blogs/insight/article/ai-document-processing-costs-2026-08-11); [aiproductivity comparison](https://aiproductivity.ai/blog/document-ai-cost-comparison/)
- AWS Textract: **DetectDocumentText $1.50/1k** (first 1M), then $0.60/1k. **AnalyzeDocument Forms $50/1k, Tables +$15/1k, Queries $15/1k.** AnalyzeExpense about $8–10/1k — [ud.hk](https://ud.hk/en/blogs/insight/article/ai-document-processing-costs-2026-08-11); [Extend](https://www.extend.ai/resources/aws-textract-when-to-use-alternative); [imagetotable](https://imagetotable.ai/blog/google-vs-aws-vs-azure-ocr-2026)

**Reducto**
- **New pricing effective Sept 1, 2026:** Extract and Split moved to an all-in per-page rate. Example: Extract went from $0.03/page plus $0.015/page parse to **$0.02/page all-in**. New customers still get 15,000 free credits — [Reducto pricing migration](https://docs.reducto.ai/reference/pricing-migration). PAYG credits are $0.015/credit after the 15k free — [Reducto pricing](https://reducto.ai/pricing.md)
- Reducto's own evaluation reports LlamaParse Premium at 90.2% vs. 80.9–82.7% for Textract and Azure and 64.6% for Google Document AI. Reducto is a competitor, so these numbers are self-reported — [Reducto guide](https://reducto.ai/guides/evaluating-llamaparse-for-pdf-parsing)

**Unstructured API**
- PAYG cut from $0.03 to **$0.015/page on Aug 28, 2026**. The recurring 15k free pages were replaced by a one-time 10k-page allowance. The Business tier is custom-priced with in-VPC and dedicated options — [usagepricing Aug 2026](https://usagepricing.com/blueprint/activity/unstructured-2026-08-28-price-change); [usagepricing Jul 2026](https://usagepricing.com/blueprint/activity/unstructured-2026-07-14-packaging). An aggregator says about $0.01/page (conflict) — [aicoolies](https://aicoolies.com/pricing/unstructured)

**Jina Reader / jina-ocr-v1**
- Reader bills by output tokens from a shared token balance: $50 per 1B tokens on Standard, plus 10M free tokens per new key (non-commercial) — [usagepricing Jina](https://usagepricing.com/blueprint/jina-ai). **jina-ocr-v1** (released 2026-09-14) is a page-to-Markdown model that accepts PDFs, but **it is CC-BY-NC-4.0** (non-commercial for self-hosting) — [jina-ocr-v1](https://jina.ai/models/jina-ocr-v1)

**Benchmarks touching cloud APIs**
- ParseBench (LlamaIndex, Apr 2026; about 2,000 human-verified enterprise pages; five dimensions: tables, charts, content faithfulness, semantic formatting, visual grounding). LlamaParse Agentic scored 84.9% overall, and "no method is consistently strong across all five dimensions" — [LlamaIndex ParseBench blog](https://www.llamaindex.ai/blog/parsebench); [arXiv 2604.08538 summary](https://www.emergentmind.com/papers/2604.08538). Third-party leaderboard (self-reported): LlamaParse Cost Effective 71.9, Gemini 3 Flash 71, Reducto 67.8 — [Codesota ParseBench](https://www.codesota.com/benchmark/parsebench). ParseBench was created by LlamaIndex, a vendor.

### Inferences
- Approximate per-1,000-page cost ladder for planning: Azure Read / Textract OCR / Google OCR about $1.50 → LlamaParse Fast about $1.25 → Mistral OCR 4.1 batch about $2 → LlamaParse Cost-effective about $3.75 → Mistral OCR 4.1 about $4 → Azure Layout / Google Layout Parser about $10 → LlamaParse Agentic about $12.50 → Unstructured about $15 → Reducto Extract about $20 → LlamaParse Agentic Plus about $56.
- For an "enterprise cloud toggle," **Mistral OCR 4.1** gives the best value plus provenance: bboxes, confidence scores, Markdown/HTML tables, and self-hosting available on request. **Azure Document Intelligence Layout** is the natural pick for Microsoft-centric enterprises: data residency, a disconnected-container option, and MarkItDown integration. LlamaParse is the strongest on ParseBench but costs more at its high tiers.
- Privacy: pick providers with zero-retention or ephemeral modes (LlamaParse ephemeral files, Datalab "zero data retention by default" per the Marker README). Make cloud parsing opt-in per workspace, because user uploads may contain PII.
- Latency: no comparable latency figures were found. Batch APIs (Mistral 50% off) suit background bulk ingestion where minutes of latency are acceptable.

### Gaps
- Official per-page prices for Azure DI, Google Document AI and AWS Textract were not directly confirmed (the vendor pages were not retrieved or rendered placeholders). The figures above come from third parties.
- Mistral's official OCR 4.1 price was not visible on mistral.ai/pricing. There is a $4 vs. $2 vs. €3.50 conflict.
- Reducto's post-Sept-2026 per-page Parse rate (vs. Extract) was not confirmed.
- No independent latency benchmarks across cloud APIs were found.
- Vendor data-retention and training terms (Mistral, LlamaCloud, Reducto, Unstructured) were not individually reviewed.

## 4. Vision-LLM-based parsing (sending page images to multimodal models), Copilot SDK image support, and ColPali-style retrieval

### Takeaway
The GitHub Copilot SDK accepts **image** attachments (file path or base64 blob) for vision-capable models, but its docs do not mention PDF or document attachments. The app must therefore render PDF pages to PNG or JPEG itself (unpdf/pdf.js, pdf-parse `getScreenshot`, or LiteParse screenshots) and attach them. Vision LLMs beat classic OCR on tables, complex layouts and handwriting but cost more, are slower and non-deterministic, and give no bboxes. Use them selectively, for scanned or complex pages and for verifying extracted facts against the page image, not as the default text extractor.

### Cited Findings
- **Copilot SDK image input:** two attachment types. `{type:"file", path:"/absolute/path.png"}` has the runtime read and base64-encode the file. `{type:"blob", data:<base64>, mimeType:"image/png", displayName}` skips disk I/O. The model must have `capabilities.supports.vision = true`. Accepted MIME types are listed per model in `capabilities.limits.vision.supported_media_types`, with `max_prompt_image_size` (bytes) and `max_prompt_images` per prompt. PNG and JPEG are recommended, SVG is unsupported, and **oversized images are auto-resized or quality-reduced; images that still don't fit are skipped silently.** Tool results can also return `image` content blocks. TS usage: `session.send({prompt, attachments:[...]})`. **The page does not mention PDFs or other document attachments.** Examples use model `gpt-5.4` — [GitHub Docs: Copilot SDK image input](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/image-input)
- The Copilot SDK is in public preview and may change in breaking ways. The permission-handler return shape differs between doc versions — [GitHub Docs (search summary of SDK docs)](https://docs.github.com/en/copilot/how-tos/copilot-sdk/use-copilot-sdk/image-input)
- Gemini processes PDFs natively with vision: **each page = 258 tokens**, up to 1,000 pages or 50 MB. **Embedded PDF text is extracted and provided to the model at no token charge.** Pages are scaled to between 768² and 3072² pixels, and higher resolution does not improve performance. The docs say "document vision only meaningfully understands PDFs" (TXT/HTML/MD are read as plain text) — [Gemini document processing](https://ai.google.dev/gemini-api/docs/document-processing)
- Cost and accuracy trade-off (first-party receipt benchmark): traditional OCR (docTR) and a document VLM (Surya2) were statistically tied on character error rate for single-page English receipts. docTR ran at 109 ms p50 and $0.048/1k pages, against Surya2's 2,668 ms p50 and $1.061/1k (about 22x the cost) — [imagetotable](https://imagetotable.ai/references/traditional-ocr-vs-document-parsing-vlm)
- LLM extraction outperforms OCR on complex layouts, tables and handwriting but costs 2–5x more per page at scale (secondary claim attributed to Mindee) — [parsli](https://parsli.co/blog/llm-ocr-vs-traditional-ocr). VLM cost scales with image resolution and visual density, and latency and non-determinism are concerns — [LlamaIndex blog](https://www.llamaindex.ai/blog/llm-ocr). Older data: Gemini Flash 2.0 at about $1.67 per 10k pages vs. $50–100 for GPT-4 Vision — [Vellum](https://www.vellum.ai/md/blog/document-data-extraction-llms-vs-ocrs)
- On olmOCR-bench, general-purpose models used raw score lower than specialized OCR VLMs: gpt-4o-anchored 69.9 and gemini-flash-2 63.8, vs. chandra-2 85.9 — [Codesota olmOCR-Bench](https://www.codesota.com/ocr/benchmark/olmocr-bench). Datalab lists Gemini Flash 3.5 (API) at 76.4 overall — [Marker README](https://github.com/datalab-to/marker). On OmniDocBench v1.6, Qwen3-VL-235B (89.78) trails 0.9–1.2B specialized models (95–96) — [Roboflow](https://roboflow.com/blog/best-open-source-ocr-models)
- **ColPali-style visual retrieval:** ColPali embeds page images directly and reports outperforming OCR-based retrieval pipelines on ViDoRe — [ColPali paper](https://arxiv.org/html/2407.01449v5). A 2025 study found vision-based RAG does well on in-distribution documents, but **OCR-based RAG generalizes better to unseen documents of varying quality**. It also notes that earlier ColPali comparisons used weak Tesseract baselines — [Lost in OCR Translation? (arXiv 2505.05666)](https://arxiv.org/html/2505.05666v1). Vendor claim: ColQwen2 scores 87.3 nDCG@5 on ViDoRe v1 vs. ColPali 81.3 (self-reported) — [Mixpeek](https://mixpeek.com/visual-document-retrieval)

### Inferences
- In this app, the agent fills a template from facts, so precise text plus page numbers matter more than visual retrieval. ColPali-style indexing adds a GPU-heavy embedding model and gives no text spans to cite. It is not recommended for v1; reconsider only for chart-heavy corpora.
- Best use of Copilot SDK vision:
  - **Fallback OCR** for pages where text-layer extraction fails (scanned, low text density) or where tables are complex. Render the page at about 150–200 DPI as PNG or JPEG, send it as a `blob` attachment, and ask for Markdown with tables.
  - **Verification.** Attach the cited page image when the agent proposes a field value, to confirm it.
  - Because the SDK silently skips oversized images, pre-size images under the model's `max_prompt_image_size` and check `supported_media_types` at runtime.
- A vision LLM gives no bboxes. For UI highlight, map the LLM's quoted text back to positions using the text layer (or local OCR word boxes) through fuzzy string matching.
- Copilot SDK model consumption counts against the user's Copilot quota or premium requests, so page-image OCR for hundreds of pages may be expensive in quota terms. Prefer local OCR or Mistral batch for bulk scanned content.

### Gaps
- The list of Copilot models with `supports.vision=true` and their specific image size and count limits was not documented on the page.
- I could not confirm whether the Copilot SDK supports PDF or document attachments natively (it does not appear in the docs).
- Copilot premium-request or quota cost per image-bearing request was not researched.
- No 2026 head-to-head benchmark of GPT-5.x, Claude and Gemini 3 as page parsers on the same dataset was found. Current Gemini 3 Flash per-token prices were not retrieved, so the per-page cost (258 tokens × price) was not computed.
- ViDoRe v3 results were not found.

## 5. Benchmarks (OmniDocBench, olmOCR-bench, ParseBench) and which models are practical locally on a laptop

### Takeaway
By late 2026, small specialized document VLMs (0.9–5B) top the open benchmarks. On OmniDocBench v1.6: PaddleOCR-VL-1.6 96.3, MinerU2.5-Pro 95.8, GLM-OCR 95.2. On olmOCR-bench: Infinity-Parser2-Pro 87.6, Chandra 2 85.9, dots.mocr 83.9, LightOnOCR-2-1B 83.2, olmOCR 2 82.4. The most commercially safe and laptop-friendly picks are PaddleOCR-VL (Apache-2.0, 0.9B) and GLM-OCR (MIT, 0.9B), with MinerU's CPU tiers (subject to its license terms) and classic PP-OCR or Tesseract for CPU-only.

### Cited Findings
- **OmniDocBench v1.6:** PaddleOCR-VL-1.6 is first at 96.33% (model card), released May 28, 2026 — [PaddleOCR-VL-1.6 README](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6/blob/main/README.md). Roboflow (Aug 3, 2026) lists PaddleOCR-VL-1.6 at 96.34% (0.9B, Apache-2.0), MinerU2.5-Pro at 95.75% (1.2B, Apache plus extra terms) and GLM-OCR at 95.22% (0.9B, MIT; about 1.86 PDF pages/s single replica on unspecified hardware). Qwen3-VL-235B scored 89.78% — [Roboflow](https://roboflow.com/blog/best-open-source-ocr-models). The model card notes some competitor scores were run independently rather than taken from the official leaderboard.
- Original PaddleOCR-VL paper (0.9B) — [arXiv 2510.14528](https://arxiv.org/pdf/2510.14528)
- **olmOCR-bench** (1,402–1,403 PDFs, about 7,010 unit tests): Codesota leaderboard (updated 2026-05-21; mix of self-reported and mapped scores). infinity-parser2-pro 87.6; chandra-2 85.9 (5B); dots.mocr 83.9 (3B; header/footer cells deleted, so not directly comparable); LightOnOCR-2-1B 83.2; olmOCR-2-7B 82.4; falcon-ocr 80.3; paddleocr-vl 80.0; Qwen3-VL-4B 79.2; PaddleOCR-VL-1.5 79.1; dots-ocr-3b 79.1; mistral-ocr-3 78.0; mineru-2.5 77.5/75.2 (duplicate entries); marker-1.10 76.5; deepseek-ocr-2 76.3; deepseek-ocr 75.7; GLM-OCR 75.2 (excludes headers and footers); nanonets-ocr2-3b 69.5; gpt-4o-anchored 69.9; gemini-flash-2 63.8 — [Codesota olmOCR-Bench](https://www.codesota.com/ocr/benchmark/olmocr-bench)
- olmOCR 2 reports a +14.2-point overall improvement over the initial release using unit-test rewards — [olmOCR 2 paper](https://arxiv.org/pdf/2510.19817). Some articles cite olmOCR 2 at 78.5 rather than 82.4 (conflict) — [emelia.io](https://emelia.io/es/hub/chandra-ocr-tables-handwriting)
- Mistral OCR 4 self-reports 85.20 olmOCR-bench and 93.07 OmniDocBench — [IDM](https://idm.net.au/node/15652)
- **Licenses of top local models:** PaddleOCR-VL Apache-2.0; GLM-OCR MIT; MinerU Apache plus thresholds; **dots.mocr MIT plus additional terms**; **Chandra OCR 2 modified OpenRAIL-M (restricts commercial use)**; PP-OCRv6 Apache-2.0 (1.5M–34.5M params; Tiny suited to edge devices); EasyOCR Apache-2.0 (CPU-capable, 80+ languages); Florence-2 MIT; SmolVLM2 Apache-2.0 (256M–2.2B) — [Roboflow](https://roboflow.com/blog/best-open-source-ocr-models). jina-ocr-v1 is CC-BY-NC-4.0 — [Jina](https://jina.ai/models/jina-ocr-v1)
- **Laptop practicality:** MinerU basic tier runs on CPU ONNX at about 2 GB RAM, and standard/advanced on CPU ONNX plus llama.cpp at 8 GB RAM. PyTorch engines need 8 GB+ VRAM — [MinerU GitHub](https://github.com/opendatalab/MinerU). Marker fast mode uses llama.cpp on CPU and Apple Silicon. Balanced mode needs vLLM plus NVIDIA, at about 2.9 pages/s on one B200 — [Marker README](https://github.com/datalab-to/marker). Roboflow gives no explicit VRAM figures but says the 0.9B models run on consumer GPUs. Only EasyOCR and PP-OCRv6-Tiny are described as CPU/edge-suitable — [Roboflow](https://roboflow.com/blog/best-open-source-ocr-models). Kreuzberg v4.3 exposes PaddleOCR in its Node binding — [Xberg v4.3.0 notes](https://newreleases.io/project/github/xberg-io/xberg/release/v4.3.0)
- ParseBench (enterprise pages; tables, charts, faithfulness, formatting, visual grounding): LlamaParse Agentic 84.9% overall; no method is consistently strong on all dimensions — [LlamaIndex ParseBench](https://www.llamaindex.ai/blog/parsebench)

### Inferences
- The benchmarks measure full-page conversion quality. For fact extraction with citations, born-digital PDFs read via the text layer are already near-perfect for text. Benchmark differences matter mostly for scanned pages, tables and formulas.
- A practical local-OCR ladder for a laptop:
  1. Tesseract (bundled in LiteParse, or tesseract.js) for quick CPU OCR.
  2. PP-OCR (via Kreuzberg's PaddleOCR feature, or a LiteParse external OCR server) for better CPU OCR.
  3. Optional GPU or Apple-Silicon tier: PaddleOCR-VL-1.5/1.6 or GLM-OCR via llama.cpp/Ollama-style runtimes.
- Avoid Chandra, Marker weights and jina-ocr-v1 in a commercial product without a license. dots.mocr and MinerU need license review.
- DeepSeek-OCR and Nanonets-OCR2 score mid-pack on olmOCR-bench (about 70–76) and offer no advantage over PaddleOCR-VL or GLM-OCR for this use case.

### Gaps
- No laptop CPU throughput numbers (pages/min) were found for PaddleOCR-VL, GLM-OCR or MinerU tiers. GLM-OCR's 1.86 pages/s is on unspecified hardware.
- Whether PaddleOCR-VL or GLM-OCR has official GGUF/llama.cpp or ONNX builds usable from Node was not verified.
- The official OmniDocBench GitHub leaderboard was not fetched directly; scores come from the model card and Roboflow.
- Licenses for Infinity-Parser2-Pro, LightOnOCR-2 and Falcon-OCR were not checked.

## 6. Preserving provenance (page numbers, bboxes, headings) for citations and UI highlighting

### Takeaway
Use a normalized internal element model: doc id → page → block (type, text, bbox, heading path). Fill it from whatever parser ran, since almost every serious parser now emits page and bbox data. Give the LLM page-marked Markdown with stable block IDs (e.g., `<!-- page 4 -->` plus `[b:12]` anchors) so it can cite "doc X, p.4, block 12." The UI then maps the block ID back to bboxes to highlight the source.

### Cited Findings
- **Docling:** `ProvenanceItem{page_no, bbox, charspan}`; `BoundingBox{l, t, r, b, coord_origin}`; `PageItem{page_no, size, image}` — [Docling reference](https://docling-project.github.io/docling/reference/docling_document/). The `body` tree gives reading order, `furniture` separates headers and footers, and chunkers attach headings and captions — [Docling concepts](https://docling-project.github.io/docling/concepts/docling_document/); [Docling chunking](https://docling-project.github.io/docling/concepts/chunking/)
- **Marker JSON:** a page tree of blocks, each with id, block type, HTML, a four-corner polygon, children and section hierarchy, plus per-page stats and a table of contents — [Marker README](https://github.com/datalab-to/marker)
- **MinerU:** outputs carry bboxes and 1-based page and block locators (Content List V1/V2) — [MinerU GitHub](https://github.com/opendatalab/MinerU)
- **LiteParse:** JSON with text bounding boxes, optional layout blocks, and page screenshots (PNG) — [LiteParse GitHub](https://github.com/run-llama/liteparse)
- **unpdf/pdf.js:** `extractTextItems` gives per-page `x, y, width, height` (bottom-left origin) — [unpdf GitHub](https://github.com/unjs/unpdf)
- **officeParser:** PDF nodes have `bounds`. Chunk metadata includes `pageNumber` (PDF) and `slideNumber` (PPTX) — [officeParser GitHub](https://github.com/harshankur/officeParser)
- **Mistral OCR 4/4.1:** `include_blocks` returns paragraph-level bboxes and structural labels, with page, block or word confidence scores — [Mistral changelog](https://docs.mistral.ai/getting-started/changelog/)
- **MarkItDown + Azure Content Understanding:** emits `<!-- page 1 -->` page markers. Built-in converters do not document page provenance — [MarkItDown GitHub](https://github.com/microsoft/markitdown)
- **LlamaParse:** layout extraction is an add-on (+3 credits/page) — [LlamaParse pricing](https://developers.llamaindex.ai/llamaparse/general/pricing/)
- **ParseBench** explicitly scores "visual grounding" as one of five dimensions, i.e., whether parsers tie content back to page locations — [LlamaIndex ParseBench](https://www.llamaindex.ai/blog/parsebench)

### Inferences
- Suggested canonical schema (per document): `{docId, sha256, mime, pages:[{n, width, height, rotation, source:"text-layer"|"ocr"|"vlm"|"cloud", imagePath?}], blocks:[{id, page, type:"heading"|"paragraph"|"table"|"list"|"figure"|"kv"|"email-header", text, md?, bbox:[x0,y0,x1,y1] (normalized 0–1, top-left origin), headingPath:[...], confidence?}]}`. Normalize coordinates: pdf.js is bottom-left origin, while Docling carries `coord_origin`.
- LLM-facing serialization: Markdown with `<!-- doc:abc page:4 -->` separators and short block anchors. Have the agent return citations as `{docId, page, blockId, quote}`, then verify by fuzzy-matching `quote` against the block text before accepting a filled field.
- Non-paginated formats:
  - DOCX/HTML/MD: cite by heading path plus paragraph index.
  - XLSX/CSV: cite by sheet plus cell range (e.g., `Sheet1!B4:D9`).
  - Email: cite by message plus header/body/attachment name.
  - PPTX: cite by slide number.
- For UI highlighting, render page images (pdf.js in the renderer) and overlay block bboxes. For DOCX, render mammoth HTML and scroll to the anchored element.

### Gaps
- Docling's `export_to_markdown` page-break placeholder parameter name could not be confirmed from the fetched reference page.
- No standard cross-tool "provenance JSON" format was found. Each tool has its own schema.

## 7. Handling scale (hundreds of documents, large PDFs) in an Electron/Node 24 app

### Takeaway
Run parsing off the main and renderer threads in Electron `utilityProcess` workers, possibly with `worker_threads` pools inside them. Cache results by content hash, process incrementally per page, and stream progress events to the UI. Enforce per-document timeouts and resource limits, because untrusted PDFs can hang or balloon memory.

### Cited Findings
- Electron `utilityProcess.fork(modulePath, args, options)` creates a Node-enabled child process launched via Chromium's Services API, modeled on `child_process.fork`. It supports MessagePorts (`process.parentPort`), stdout and stderr piping (stdin must be `ignore`) and a `serviceName` that appears in `app.getAppMetrics()` and `child-process-gone` events. It can only be called after app `ready` — [Electron utilityProcess docs](https://www.electronjs.org/docs/latest/api/utility-process)
- unpdf warns that serverless parsing runs on the event loop without a worker, extraction processes every page, and `maxImageSize` is unlimited by default. Add timeouts for untrusted PDFs — [unpdf GitHub](https://github.com/unjs/unpdf)
- mailparser is stream-based for 100 MB+ messages, with an inline-image cap (`maxInlinedImagesSize`, default 20 MB) — [mailparser GitHub](https://github.com/nodemailer/mailparser)
- Cloud services already use content-hash caching. LlamaParse re-parses of the same file within 48 h are free — [LlamaParse pricing](https://developers.llamaindex.ai/llamaparse/general/pricing/). Mistral batch is 50% cheaper for bulk jobs — [mistral.ai/pricing](https://mistral.ai/pricing)
- Tika's docs warn that published Docker ports can bypass host firewalls, so bind to localhost. Sidecar services should listen on 127.0.0.1 only — [Tika Docker docs](https://tika.apache.org/docs/4.0.x/using-tika/docker.html). MarkItDown performs I/O with the process's privileges, so inputs need sanitizing — [MarkItDown GitHub](https://github.com/microsoft/markitdown)
- Gemini's Files API keeps uploads for 48 h, which is useful for reuse across requests — [Gemini docs](https://ai.google.dev/gemini-api/docs/document-processing)

### Inferences
- Architecture:
  - **Main process:** a job queue in SQLite (job per file, then per page), keyed by `sha256(file bytes) + parserVersion + options`.
  - **Workers:** N `utilityProcess` workers (N ≈ cores − 1, lower for OCR), each with a timeout and memory watchdog. A crash affects only that worker, which you can observe via `child-process-gone`.
  - **Renderer:** receives progress over a MessagePort (per file: queued, extracting, OCR, done/failed, pages done/total).
- Two-phase processing:
  1. A fast pass (text-layer extraction for all pages; seconds per document) makes docs searchable and usable by the agent immediately.
  2. A slow pass (OCR/VLM only on pages flagged as low-text or image-only) upgrades pages in place. The agent can be told which pages are pending.
- Cache parsed JSON plus page PNG thumbnails on disk under the app data dir, keyed by hash. Re-uploads and duplicates cost nothing, and bumping `parserVersion` invalidates the cache selectively.
- For large PDFs (500+ pages), parse page-by-page with a reused document proxy. Avoid `mergePages`, and stream blocks into SQLite FTS for retrieval so the agent fetches relevant pages rather than all text.
- Security: parse untrusted files in sandboxed utility processes, cap rendered image size, and disable network in parsing workers unless cloud mode is on.

### Gaps
- No published benchmarks of pdf.js/unpdf throughput in Electron utilityProcess vs. worker_threads were found.
- Sandboxing options for utilityProcess (e.g., OS-level sandbox flags) were not researched.

## 8. Recommended layered pipeline for a Node-centric desktop app

### Takeaway
Default to a local, permissively licensed, pure-Node or Rust-binding pipeline:
- **Router:** sniff the MIME type.
- **Format-specific extractors:** unpdf/pdf.js (or LiteParse) for PDFs, mammoth plus an HTML-to-Markdown converter for DOCX, SheetJS CE (CDN build) for XLSX/CSV, officeParser for PPTX, PostalMime and msgreader for email.
- **Per-page quality check:** routes scanned or low-text pages to local OCR (Tesseract or PaddleOCR), then optionally to a Copilot-SDK vision model with rendered page images.
- **Optional enterprise cloud parser toggle:** Mistral OCR 4.1 or Azure DI Layout.
- **Optional downloadable Python "high-fidelity" engine:** Docling (MIT) via docling-serve.

All outputs normalize into a page, block and bbox schema with page-marked Markdown for the agent.

### Cited Findings
- Hybrid is the consensus. OCR handles simple high-volume text, and VLMs handle tables, diagrams and complex layouts — [parsli](https://parsli.co/blog/llm-ocr-vs-traditional-ocr); [imagetotable](https://imagetotable.ai/references/traditional-ocr-vs-document-parsing-vlm)
- LiteParse is designed as the local tier, and LlamaParse as the hosted tier for harder documents. LiteParse includes a complexity detector that flags documents it cannot handle well — [MarkTechPost](https://www.marktechpost.com/2026/03/19/llamaindex-releases-liteparse-a-cli-and-typescript-native-library-for-spatial-pdf-parsing-in-ai-agent-workflows/); its external OCR server hook enables pluggable PaddleOCR or EasyOCR — [LiteParse GitHub](https://github.com/run-llama/liteparse)
- Marker's `--disable_ocr` text-layer-only mode scores 55.8 on born-digital pages vs. 83.5 with models, showing that text-layer extraction alone loses structure (tables, reading order) even on digital PDFs — [Marker README](https://github.com/datalab-to/marker)
- Copilot SDK vision accepts PNG/JPEG blobs, so page rendering must happen app-side — [GitHub Docs](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/image-input). unpdf `renderPageAsImage` needs `@napi-rs/canvas` in Node — [unpdf GitHub](https://github.com/unjs/unpdf). pdf-parse v2 `getScreenshot()` also renders PNGs — [pdf-parse GitHub](https://github.com/mehmet-kozan/pdf-parse)
- Mistral OCR 4.1 returns bboxes and confidence scores, at about $4/1k pages ($2 batch) — [Mistral changelog](https://docs.mistral.ai/getting-started/changelog/); [implicator.ai](https://www.implicator.ai/mistral-ocr-4-ships-bounding-boxes-for-170-language-document-ai/). Azure DI offers disconnected containers for air-gapped enterprises — [Azure DI pricing](https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/)
- Docling MIT, with docling-serve and a TS client (`docling-sdk`) — [Docling GitHub](https://github.com/docling-project/docling); [docling-sdk](https://cdn.jsdelivr.net/npm/docling-sdk@2.0.6/README.md)

### Inferences
**Proposed pipeline (each stage writes to the normalized schema):**
1. **Ingest and dedupe:** hash the file, check the cache, sniff the type (magic bytes plus extension), and enqueue a job in a utilityProcess pool.
2. **Format extractors (local, permissive):**
   - **PDF:** unpdf `extractTextItems` per page → reading-order and heading heuristics (font size and weight) → blocks with bboxes. Alternatives: LiteParse JSON (PDFium plus bboxes plus screenshots), or pdf-parse v2 `getTable()` for simple tables.
   - **DOCX:** mammoth → HTML → turndown Markdown, with headings, tables and footnotes as blocks citing heading path and paragraph index. officeParser AST is an alternative.
   - **PPTX:** officeParser (slideNumber), including notes.
   - **XLSX/CSV:** SheetJS CE 0.20.3 from the CDN. Emit per-sheet Markdown tables, with large sheets kept as structured JSON plus a tool for the agent to query ranges. Citations use sheet and cell range.
   - **Email:** PostalMime (.eml) or @kenjiuno/msgreader (.msg). Headers become a key-value block, the body goes through the HTML-to-Markdown converter, and attachments are recursively fed back into step 1 with parent linkage.
   - **HTML/MD/TXT:** an HTML-to-Markdown converter, or pass-through.
   - **Images:** straight to step 3.
3. **Per-page quality gate:** if a page's text-layer chars per area fall below a threshold, the page is mostly an image, the text is garbled (high replacement-char ratio), or there are table-like layouts with low confidence, then render the page to PNG at about 150–200 DPI and run local OCR. Options are tesseract.js v7 in a worker, LiteParse's bundled Tesseract, or PaddleOCR via Kreuzberg or a local OCR server. Keep word boxes.
4. **Vision escalation (optional, per page):** for pages that are still low-confidence or table-heavy, attach the page image to a vision-capable Copilot SDK model (`blob` attachment) and ask for Markdown and tables. Map the output back to bboxes via fuzzy match to OCR words. Cap the pages per job to control quota use.
5. **Enterprise cloud toggle (opt-in, per workspace):** Mistral OCR 4.1 (batch for bulk) or Azure DI Layout replaces steps 3–4. Their bboxes and confidence scores map directly into the schema.
6. **High-fidelity local engine (optional download):** Docling via docling-serve on 127.0.0.1, run in a downloaded python-build-standalone plus uv environment. It handles complex PDFs (tables, reading order) with DoclingDocument provenance mapped into the schema.
7. **Agent interface:** store blocks in SQLite plus FTS5 (optionally with embeddings). Expose tools such as `search_docs(query)`, `get_page(docId, page)`, `get_block(blockId)`, `get_sheet_range(docId, sheet, range)` and `get_page_image(docId, page)` (returns an image block for vision verification). Require citations as `{docId, page|sheet|slide, blockId, quote}`, validated before a template field is accepted.

**Licensing summary for the recommended default stack:**
- Permissive (verified this session): unpdf MIT, pdf-parse v2 Apache-2.0, mammoth BSD-2, officeParser MIT, SheetJS CE Apache-2.0, mailparser MIT, LiteParse Apache-2.0, Docling MIT, docling-sdk BSD-3.
- Avoid without a commercial license: mupdf.js (AGPL), Marker and Chandra weights, jina-ocr-v1 (non-commercial). Review MinerU and dots.mocr terms.

### Gaps
- No end-to-end reference implementation of this exact Node pipeline was found. The pipeline is a synthesis.
- Thresholds for the "needs OCR" quality gate are heuristic; no published guidance was found.
- Not verified: turndown, PostalMime and tesseract.js license details and current versions (prior knowledge: MIT, MIT-0 and Apache-2.0 respectively).
