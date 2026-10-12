# Template Design and Programmatic Filling for an AI Auto-Fill Desktop App (Node 24 / Electron), as of October 2026

Scope note: versions and publish dates below come from the live npm and PyPI registries, queried on 2026-10-11. Third-party articles that list older versions (for example "docxtemplater 3.56.0" or "easy-template-x 6.2.0" on aggregator sites) are **outdated**. GitHub API access was not available in this session, so repository commit activity is inferred from npm publish dates and issue-tracker pages.

## 1. DOCX templating libraries in Node: features, licensing, maintenance

### Takeaway
**docxtemplater** is the most mature and actively released DOCX/PPTX templating engine for Node. Its MIT core handles tags, loops, conditions and table-row loops for free. Images, HTML/rich text, styling, advanced tables and error-location are paid modules: 500 EUR/yr for one module, 1,250 EUR/yr for four (PRO), and 3,000 EUR/yr for all of them (Enterprise).

**easy-template-x** (MIT) is the strongest fully free alternative. It includes images, links, charts, and loops over rows, columns and list items. **docx-templates** (MIT) is powerful, but its templates run arbitrary JavaScript. **Carbone** is not OSI open source (it uses the custom CCL license) and needs LibreOffice to produce PDF. **dolanmiu/docx** generates documents from code rather than filling templates.

### Cited Findings

**docxtemplater (open-xml-templating)**
- Latest release is v3.71.0, published 2026-09-21. The npm license field is MIT — [npm registry](https://registry.npmjs.org/docxtemplater)
- The pricing page lists five tiers:
  - **Open source:** free, community support on GitHub. The comparison table says "MIT or GPLv3" dual-licensed.
  - **One module:** 500 EUR/yr.
  - **PRO:** 1,250 EUR/yr for 4 modules of your choice.
  - **Enterprise:** 3,000 EUR/yr for all modules (18 or 19, the page is inconsistent), max 25 instances, custom terms possible. It includes a Docker image with an HTTP API.
  - **Premium:** 9,000 EUR/yr, adding priority support, a browser bundle and 4 days of dev or template work.
  - One-module and PRO plans list "5 instances max per license". All paid plans have a 2-week money-back guarantee. The page does not state the number of developers per license.
  - Source: [docxtemplater pricing](https://docxtemplater.com/pricing/)
- **Free core vs paid modules:**
  - The free core covers `{tag}` replacement, conditions, loops and changing delimiters.
  - Paid modules include Image, QR code, HTML (docx/pptx/xlsx), Xlsx, Odt, Table, Subsection, Paragraph-placeholder, Slides, Pptx-sub, Chart, Subtemplate, Styling, Word-run, Footnotes, Meta (readonly, watermark, margins) and Error-location (shows template errors as Word comments).
  - Source: [docxtemplater pricing](https://docxtemplater.com/pricing/)
- **Core tag types:**
  - `{name}` placeholders. Expressions like `{price * 1.2}` need the angular expressions parser.
  - `{#loop}…{/loop}` loops and sections: falsy or empty values hide the content, arrays repeat it, objects render it once.
  - `{^inverted}` sections, which act as an "else".
  - `{@rawXml}` for raw OOXML, paragraph-level only.
  - The `paragraphLoop` option removes extra blank lines around section tags.
  - Table rows loop in core: open the loop in the first cell and close it in the last cell of the row.
  - Source: [docxtemplater tag types](https://docxtemplater.com/docs/tag-types/)
- **Expression parser:** enabled via `parser: expressionParser` from `require("docxtemplater/expressions.js")`, together with the `paragraphLoop: true` and `linebreaks: true` options — [docxtemplater docs](https://docxtemplater.com/docs/api/). Its dependency `angular-expressions` is at v1.7.0 (2026-09-21, Unlicense) — [npm registry](https://registry.npmjs.org/angular-expressions)
- **InspectModule ships with the core package.**
  - Load it with `const InspectModule = require("docxtemplater/js/inspect-module.js")`.
  - Methods include `getAllTags()`, `getStructuredTags()` and `fullInspected`. It lists which tags and module types (loop, image, raw-xml and so on) a template uses.
  - The FAQ does not label it as paid, and its source is in the public repo.
  - Source: [docxtemplater FAQ](https://docxtemplater.com/docs/faq/)
- **Recent InspectModule changelog:**
  - v3.67.6 fixed corruption when calling `inspectModule.getAllStructuredTags()` and then `.render()` on the same instance. It can now be called before render with no side effects.
  - v3.67.5 throws an error if the inspect methods are called without attaching the module.
  - Source: [docxtemplater CHANGELOG](https://raw.githubusercontent.com/open-xml-templating/docxtemplater/HEAD/CHANGELOG.md)
- **HTML module (paid):**
  - `{~html}` is inline and `{~~html}` is block level. A block tag must be the only content in its paragraph.
  - It converts HTML to **native OOXML, not altChunk**, because altChunk is unsupported in LibreOffice, Google Docs and WPS.
  - It supports headings, lists, tables, links, checkboxes, sub/sup, pre, mark, hr and img (with the Image module), plus common CSS (colors, fonts, margins, borders, text-align, list-style-type, page breaks).
  - `styleTransformer` maps HTML tags to the document's Word styles (for example `h1 → Heading1`). `elementCustomizer` assigns `pStyle` by class or selector.
  - Source: [docxtemplater HTML module](https://docxtemplater.com/modules/html/)
- **DOCX to PDF, per docxtemplater's FAQ:** docxtemplater cannot convert. For a free option it suggests LibreOffice headless ("not perfect"). For better quality it names ConvertAPI, Apryse, Aspose and cmd2pdf, and states no partnership with any of them — [docxtemplater FAQ](https://docxtemplater.com/docs/faq/)
- `pizzip`, the zip dependency, is at v3.3.0 (2026-09-21), licensed (MIT OR GPL-3.0) — [npm registry](https://registry.npmjs.org/pizzip)
- The free community image module `docxtemplater-image-module-free` was last published in 2019 (v1.1.1), so it is **stale** — [npm registry](https://registry.npmjs.org/docxtemplater-image-module-free)

**easy-template-x (alonrbar)**
- Latest release is v8.0.0, published 2026-09-24, MIT — [npm registry](https://registry.npmjs.org/easy-template-x)
- **Features:**
  - Text tags keep the original styling.
  - Loops repeat text, table rows, table columns or list items. Conditions use the loop syntax and can nest.
  - Images can be inline tags, or **replace placeholder images identified by alt text**.
  - Also supports hyperlinks, charts (line, bar, pie and others) and raw XML (for example page breaks).
  - Loop behaviour is chosen by heuristics and can be overridden with `loopOver: row|column|paragraph|content`.
  - Custom delimiters, a `TemplatePlugin` base class for extensions, a `scopeDataResolver` option and an `easy-template-x-angular-expressions` add-on.
  - The community extension `easy-template-x-data-binding` updates custom XML parts.
  - Source: [easy-template-x GitHub](https://github.com/alonrbar/easy-template-x)
- The author pitches it as having "the most simple, non-programmer oriented template syntax" and "a free image insertion plugin" — [easy-template-x README via search](https://github.com/fulgore83/easy-template-x)

**docx-templates (guigrpa)**
- Latest release is v4.15.0, published 2025-12-03, MIT. That is about 10 months without a release — [npm registry](https://registry.npmjs.org/docx-templates)
- **Commands:**
  - `FOR`/`END-FOR` loops (including table rows and nested loops) and `IF`/`END-IF` conditions.
  - `IMAGE`, `LINK`, `INS` (or `=`), and `EXEC` (or `!`).
  - `HTML` uses **altChunk, which only works in Microsoft Word**, not LibreOffice or Google Docs.
  - `cmdDelimiter` sets custom delimiters, for example `{#` `#}`.
  - Source: [docx-templates GitHub](https://github.com/guigrpa/docx-templates)
- **Security:**
  - Templates contain arbitrary JavaScript.
  - The default Node `vm` sandbox "is not meant to be used as a security mechanism". A vm2 example is provided.
  - `noSandbox: true` speeds up rendering but is less safe. Letting users upload arbitrary templates is a "significant threat".
  - Repo stats: about 1.1k stars and 70 open issues.
  - Source: [docx-templates GitHub](https://github.com/guigrpa/docx-templates)

**Carbone**
- The npm `carbone` package is at v3.8.2 (2026-04-07). Its license field reads "SEE LICENSE IN LICENSE.md" — [npm registry](https://registry.npmjs.org/carbone)
- **Editions:**
  - The Community Edition is under the **CCL (Carbone Community License)**.
  - The open-source edition is "always one major version behind". v5+ ships as Docker or Enterprise.
  - PDF conversion needs LibreOffice. v5 also supports Chrome and OnlyOffice converters. Requires Node 14 or later.
  - Source: [carbone GitHub](https://github.com/carboneio/carbone)
- **CCL terms:**
  - It grants internal use, distribution inside "Value Added Products or Services" (with a CCL notice to customers), unmodified standalone redistribution, and derivative works.
  - It **prohibits document-generator-as-a-service** unless it is part of a Value Added Product.
  - A Value Added Product must not be primarily a document generator and must be marketed on its other value.
  - There is no clause converting the license to Apache.
  - Source: [Carbone LICENSE.md (v3.8.2)](https://unpkg.com/carbone@3.8.2/LICENSE.md)

**docx (dolanmiu) — generating documents from code, not filling templates**
- Latest release is v9.10.0, published 2026-10-10, MIT. It is very actively maintained — [npm registry](https://registry.npmjs.org/docx)

**python-docx-template (docxtpl), for comparison**
- Latest release is v0.20.2 (2025-11-13), licensed **LGPL-2.1-only** — [PyPI](https://pypi.org/pypi/docxtpl/json)
- It uses Jinja2 inside DOCX:
  - `{%p if %}` / `{%p for %}` for paragraphs, `{%tr %}` for table rows and `{%tc %}` for table columns.
  - Rich text via `{{p x|markdown}}` (paragraph level), `{{r x|inline_markdown}}` (run level) and `{{r x|RichText}}`.
  - It is the engine behind docassemble's DOCX output.
  - Source: [docassemble documents docs](https://docassemble.org/docs/documents.html)

**Adobe Document Generation (commercial API, a design precedent)**
- **Tags:**
  - `{{field}}` placeholders support defaults, optional markers and prefixes.
  - Arrays use `array.property` tags for repeating table rows and lists.
  - Images use alt text containing a JSON object with `location-path`.
  - Conditional sections and phrases use `expr()`.
  - HTML in JSON values renders tables and lists, with inline styles only.
  - JSONata functions are supported, and each tag is limited to 1,000 characters.
  - Source: [Adobe Document Generation template tags](https://developer.adobe.com/document-services/docs/overview/document-generation-api/templatetags/)

### Inferences
- **Feature matrix** (my synthesis of the cited docs):
  - **Loops and conditionals:** all five engines support them (docxtemplater core, easy-template-x, docx-templates, Carbone, docxtpl).
  - **Table-row loops:** docxtemplater core, easy-template-x, docx-templates and docxtpl `{%tr%}` all support them.
  - **Images free:** easy-template-x and docx-templates. With docxtemplater they cost the 500 EUR/yr Image module.
  - **Native rich text/HTML:** the docxtemplater HTML module (paid, native OOXML) is the most robust. docx-templates' altChunk only renders in Word, so PDF conversion through LibreOffice breaks it. docxtpl supports markdown filters.
  - **Preserving Word styling:** all of these engines edit the existing DOCX XML in place, so styles, headers, footers and themes survive. dolanmiu/docx does not use a template, so branding lives in code.
- For a commercial closed-source desktop app:
  - docxtemplater core and easy-template-x carry the lowest licensing risk (MIT).
  - docx-templates' JS evaluation is acceptable only because the team authors the templates. It should never run end-user-uploaded templates.
  - Carbone's CCL is a risk if the product is arguably "primarily a document generator". Get legal review or an Enterprise license.
- docxtemplater PRO (1,250 EUR/yr) for Image, HTML, Table and Styling, or Error-location, is likely the best "polish per euro" if the team chooses DOCX-first. The free path is docxtemplater core plus custom OOXML injection via `{@rawXml}`, or easy-template-x for free images.

### Gaps
- I did not confirm the exact number of developers, seats or apps covered per docxtemplater license, or whether "instance" means a server or an installed desktop copy. **Desktop distribution to many end users may need Enterprise or custom terms. Ask docxtemplater sales.**
- I could not check docx-templates' recent commit or issue-response activity (GitHub API unavailable). The last npm release was December 2025.
- I did not verify whether any of these engines natively fill Word **checkbox content controls** (`w14:checkbox`). The docxtemplater HTML module lists checkbox support, but only within HTML injection.

## 2. PDF generation options: AcroForm filling, pdfme, HTML/Chromium, React-PDF, Typst

### Takeaway
- For **pixel-perfect, branded, flowing documents**, HTML/CSS rendered by Chromium (Electron's built-in `webContents.printToPDF`) is the free, high-quality default. It also gives a truly WYSIWYG live preview, because the preview and the PDF use the same engine.
- **Typst** (typst.ts, Apache-2.0) is the best modern typesetting option for programmatic, print-grade PDFs. Typst markup is code, though, so non-developers will find it harder to edit.
- **pdfme** (MIT, very active) suits fixed-layout, form-like PDFs and includes a visual designer.
- **pdf-lib** has had no release since 2021. Use the maintained forks (`@cantoo/pdf-lib`, `@pdfme/pdf-lib`) for AcroForm filling.

### Cited Findings
- **pdf-lib:**
  - The last npm release is v1.17.1 (2021-11-06) — [npm registry](https://registry.npmjs.org/pdf-lib)
  - The tracker shows 277 open issues, many marked "needs-triage". Issue #1720 is titled "Please STOP posting issues here" (January 2025). Issue #1752, "pdf-lib depends on a broken version of tslib" (August 2025), has no visible maintainer reply.
  - Source: [pdf-lib issues](https://github.com/Hopding/pdf-lib/issues)
- **Maintained pdf-lib forks:** `@cantoo/pdf-lib` v2.11.1 (2026-09-15, MIT) — [npm registry](https://registry.npmjs.org/@cantoo%2Fpdf-lib); `@pdfme/pdf-lib` v6.2.4 (2026-10-06, MIT) — [npm registry](https://registry.npmjs.org/@pdfme%2Fpdf-lib)
- **pdfme:**
  - `@pdfme/generator` and `@pdfme/ui` are at v6.2.4 (2026-10-06), MIT — [npm registry](https://registry.npmjs.org/@pdfme%2Fgenerator)
  - A template is `basePdf` (an existing PDF, or a blank `{width,height,padding}`) plus `schemas`: an array of pages of fields, each with `name`, `type`, `position`, `width` and `height`.
  - Field types include text, multiVariableText, image, table, barcodes/QR and signature, and plugins can add custom types.
  - `@pdfme/ui` provides a Designer (WYSIWYG template editor), a Form and a Viewer.
  - Dynamic layout with page breaks works for text with `overflow: "expand"`, lists and tables, but only with the blank-page form of `basePdf`. Requires Node 16 or later.
  - Source: [pdfme getting started](https://pdfme.com/docs/getting-started)
- **Electron `webContents.printToPDF`:**
  - Options include `pageSize` (named sizes or custom inches), `margins`, `printBackground`, `scale`, `landscape` (ignored if CSS `@page` is used) and `pageRanges`.
  - `headerTemplate`/`footerTemplate` accept HTML with `pageNumber`, `totalPages` and `date` classes. `preferCSSPageSize` makes CSS `@page` sizing take precedence.
  - `generateTaggedPDF` (experimental; may not fully meet PDF/UA or WCAG) and `generateDocumentOutline` (experimental; outline built from headings).
  - Source: [Electron webContents docs](https://www.electronjs.org/docs/latest/api/web-contents)
- **@react-pdf/renderer:** v4.9.0 (2026-08-27), MIT — [npm registry](https://registry.npmjs.org/@react-pdf%2Frenderer)
- **Typst via typst.ts:** `@myriaddreamin/typst.ts` v0.7.0 (2026-06-01, Apache-2.0) — [npm registry](https://registry.npmjs.org/@myriaddreamin%2Ftypst.ts). `@myriaddreamin/typst-ts-node-compiler` v0.7.0 ("Compile or Render Typst documents in Node environment", Apache-2.0) — [npm registry](https://registry.npmjs.org/@myriaddreamin%2Ftypst-ts-node-compiler)
- **Typst's official guidance for automated generation:**
  - Pass JSON through `sys.inputs` and parse it in the template with `json(bytes(...))`.
  - Generating Typst markup from scripts is "strongly discouraged" because "our markup is not designed to be generated by machines".
  - Compiles commonly take milliseconds. Use `--ignore-system-fonts` with `--font-path` for reproducible output.
  - Supports PDF/A and PDF/UA-1, and Typst documents are "accessible out of the box".
  - Source: [Typst blog: automated generation (2025)](https://typst.app/blog/2025/automated-generation)
- **Oicana** is a third-party Typst-based templating project with Node.js support: "templates can now be compiled with inputs coming from C#, TS/JS in the browser, Node.js, and Rust" — [Typst forum](https://forum.typst.app/t/oicana-support-for-node-js-and-rust/6933)
- **docassemble's PDF path:** fills AcroForm fields by exact field name (pikepdf by default, pdftk optional). `editable: False` flattens the fields — [docassemble documents docs](https://docassemble.org/docs/documents.html)

### Inferences
- **Trade-offs for pixel-perfect branded output:**
  - **HTML/CSS + printToPDF:**
    - Free, with no extra binary, since Chromium already ships in Electron.
    - Full CSS, web fonts and SVG logos. The preview equals the output.
    - Weaknesses are paged-media control (running headers, widows and orphans, footnotes) and DOCX export, which is lossy.
  - **Typst:**
    - Best typography, small WASM or native binary, deterministic, PDF/A.
    - Templates are code-like, so non-developers can brand them only through a theme file (colors, fonts, logo paths) that the template reads.
  - **pdfme:** best when the deliverable is a fixed-position form (government or insurer forms). A poor fit for long narrative documents.
  - **React-PDF:** layout lives in developers' JSX, so it is a poor fit for non-developer-editable templates.
  - **AcroForm filling (@cantoo/pdf-lib):** only for third-party fillable PDFs the team does not control.
- **Checkboxes:** AcroForm checkboxes come free with pdf-lib forks. In HTML or DOCX templates, render a boolean as the ☒/☐ glyphs or a styled CSS box.

### Gaps
- I did not verify typst.ts 0.7.0's exact Node API for passing `sys.inputs` (the docs were not retrieved), or Typst's current upstream version.
- I did not research Playwright or Puppeteer separately. In Electron, `printToPDF` makes them unnecessary.
- No 2025–2026 benchmark comparing PDF output quality was found.

## 3. DOCX to PDF conversion in a desktop app

### Takeaway
There is no free, pure-JavaScript, high-fidelity DOCX-to-PDF converter. The free options are:
- **LibreOffice headless**, bundled or detected on the machine. Good but imperfect fidelity, and a large footprint.
- **Gotenberg** (MIT), which is a server.
- **Microsoft Graph** `?format=pdf`, which needs M365, cloud upload and a 2 MB file limit.

Commercial SDKs (Apryse, Aspose, Nutrient, Syncfusion) buy Word-level fidelity. They are worth it only if customers compare output to Word page by page.

### Cited Findings
- **docxtemplater's recommendation:** LibreOffice headless is the free option but "not perfect". For quality, use ConvertAPI, Apryse, Aspose or cmd2pdf — [docxtemplater FAQ](https://docxtemplater.com/docs/faq/)
- **Carbone and docassemble** both rely on LibreOffice for PDF. docassemble generates a PDF from DOCX via LibreOffice unless disabled — [carbone GitHub](https://github.com/carboneio/carbone); [docassemble documents docs](https://docassemble.org/docs/documents.html)
- The Node wrapper `libreoffice-convert` is at v1.8.2 (2026-07-04, MIT) — [npm registry](https://registry.npmjs.org/libreoffice-convert)
- **LibreOffice licensing:** distro package metadata lists a compound license led by MPL (MPLv1.1/MPLv2.0, LGPLv3+, and others) — [libreoffice-headless package listing](https://free.nchc.org.tw/scientific/6.8/x86_64/updates/security/repoview/libreoffice-headless.html)
- **Fonts:** stable pagination needs metric-compatible fonts (for example Liberation). One Docker project installs them for this reason — [ofthemachine/libreoffice Docker Hub](https://hub.docker.com/r/ofthemachine/libreoffice)
- **Gotenberg:**
  - MIT-licensed Docker API (`gotenberg/gotenberg:8`). It uses Chromium for HTML/URL/Markdown and LibreOffice for 100+ Office formats.
  - Source: [Gotenberg GitHub](https://github.com/gotenberg/gotenberg)
  - The TypeScript client `chromiumly` is at v6.0.0 (2026-08-01, MIT) — [npm registry](https://registry.npmjs.org/chromiumly)
- **Microsoft Graph:**
  - `GET /drive/items/{id}/content?format=pdf` converts docx, doc, dotx, rtf, odt, html, md and others to PDF.
  - The **maximum file size for conversion is 2 MB**. The file must sit in OneDrive or SharePoint, and the call returns a 302 to a short-lived download URL. Permissions: Files.Read (delegated) or Files.ReadWrite.All (application).
  - Source: [Microsoft Graph driveItem convert](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content-format)
- **Syncfusion:**
  - `@syncfusion/ej2-documenteditor` is at v35.1.39 (2026-10-07) under a commercial license — [npm registry](https://registry.npmjs.org/@syncfusion%2Fej2-documenteditor)
  - The free Community License requires under $1M annual revenue, 5 or fewer developers (the license text says "fewer than five"), 10 or fewer employees, and no more than $3M in outside capital. Government-funded organizations are ineligible.
  - Source: [Syncfusion community license](https://syncfusion.com/communitylicense)

### Inferences
- **Desktop-app options, ranked by cost and complexity:**
  - **(a) Detect a user-installed LibreOffice or offer it as an optional download.** Best for keeping the installer small.
  - **(b) Bundle a trimmed LibreOffice.** Simplest for users, but it adds hundreds of MB and MPL notice obligations.
  - **(c) Avoid DOCX-to-PDF entirely** by rendering PDF from an HTML or Typst twin of the template. This doubles template maintenance.
  - **(d) Optional M365 "export via Word Online"** for enterprise customers, within the 2 MB limit.
  - **(e) A commercial SDK** (Apryse, Aspose, Nutrient, Syncfusion) if Word-identical fidelity is a selling point.
- **Gotenberg** fits only if the app already has a backend. It is not a fit for an offline desktop app.

### Gaps
- I did not verify LibreOffice's current install or bundle size, or its MPL-2.0 redistribution obligations for an Electron bundle.
- I found no public pricing for Apryse, Nutrient or Aspose. These are typically quote-based (training knowledge, not verified this session).
- Not verified: Syncfusion's standalone pricing, and whether its DOCX-to-PDF conversion runs fully client-side in JS or needs its .NET or Java server libraries.

## 4. In-app preview and editing

### Takeaway
- **docx-preview** (Apache-2.0) is the lightweight, free way to show a filled DOCX as HTML in the renderer. Pagination is approximate.
- For **in-app DOCX editing**:
  - **SuperDoc** is the most agent-oriented engine, with a Document API for Node and MCP. It is **AGPL-3.0 or commercial**.
  - **eigenpal docx-editor** is a newer Apache-2.0 option, not yet evaluated.
  - **Syncfusion DocumentEditor** is commercial, or free under its Community License.
  - **Tiptap's DOCX conversion** is paid (from $49–59/mo), and full-fidelity import of headers, footers and pagination was still maturing.
- For an accurate preview of the final PDF, render the actual PDF in a PDF viewer. Chromium in Electron has one built in.

### Cited Findings
- **docx-preview:**
  - v0.4.1 (2026-09-21), Apache-2.0 — [npm registry](https://registry.npmjs.org/docx-preview)
  - Renders DOCX to semantic HTML in the browser, with styles, numbering, fonts, headers, footers, footnotes and endnotes. Tracked changes and comments are experimental.
  - **No real-time pagination.** Pages break only on explicit breaks, `lastRenderedPageBreak`, or section changes.
  - TOC fields are not supported. Only `renderAsync` is a stable API. About 2.1k stars and 61 open issues.
  - Source: [docxjs GitHub](https://github.com/VolodymyrBaydalka/docxjs)
- **SuperDoc:**
  - `superdoc` v2.22.0 (2026-10-09), **AGPL-3.0**. The older package name `@harbour-enterprises/superdoc` was last published at v1.46.3 (2026-08-26) — [npm registry](https://registry.npmjs.org/superdoc); [npm registry](https://registry.npmjs.org/@harbour-enterprises%2Fsuperdoc)
  - It is a browser DOCX editor that edits the DOCX XML directly, with comments, track changes and Yjs collaboration.
  - One Document API covers browser, Node.js, Python, CLI and MCP. The V2 engine runs headless without a DOM.
  - It is "built for AI agents" using document operations rather than raw XML. A commercial license is available, but no price is published.
  - Source: [SuperDoc GitHub](https://github.com/superdoc-dev/superdoc)
- **eigenpal docx-editor:**
  - `@eigenpal/docx-editor-react` and `@eigenpal/docx-editor-core` v1.9.0 (2026-06-21), Apache-2.0. The core is described as a "Framework-agnostic core for DOCX parsing, editing, and rendering".
  - The older name `@eigenpal/docx-js-editor` is deprecated.
  - Source: [npm registry](https://registry.npmjs.org/@eigenpal%2Fdocx-editor-core)
- **Tiptap:**
  - DOCX import/export (Conversion) is included in paid plans only: Start $59/mo monthly or $49/mo annual; Team $179/$149; Business $1,199/$999; Enterprise custom.
  - The free plan was removed in June 2025. Full-document DOCX import (headers, footers) was marked "coming soon" in the pricing table.
  - Source: [Tiptap pricing](https://tiptap.dev/pricing.md); [Tiptap conversion docs](https://tiptap.dev/docs/conversion/import-export/docx)
  - `@tiptap/core` (MIT) is at v3.31.4 — [npm registry](https://registry.npmjs.org/@tiptap%2Fcore)
- **OnlyOffice:** the React wrapper `@onlyoffice/document-editor-react` v2.2.0 (2026-05-19) is Apache-2.0 — [npm registry](https://registry.npmjs.org/@onlyoffice%2Fdocument-editor-react)
- **mammoth** (DOCX to clean HTML, for content extraction rather than faithful preview) is at v1.13.0 (2026-09-26), BSD-2-Clause — [npm registry](https://registry.npmjs.org/mammoth)
- **Electron's printToPDF** produces the PDF in the same Chromium that renders the preview — [Electron webContents docs](https://www.electronjs.org/docs/latest/api/web-contents)

### Inferences
- **Recommended preview UX:** a two-tier preview.
  - **Fast tier:** re-render the filled DOCX in a hidden or worker context and show it with docx-preview on every agent or user edit, debounced.
  - **Accurate tier:** a "Final PDF" tab rendered by LibreOffice (or by printToPDF for an HTML track), shown in Electron's PDF viewer.
- **Editing:** most apps like this do not need a full DOCX editor. Users edit **field values** in a schema-driven form (JSON Forms, RJSF or SurveyJS) next to the preview, and the document regenerates. Embed a DOCX editor only if users must hand-edit final prose. Then:
  - SuperDoc's commercial license, or the Apache-2.0 eigenpal editor (verify its maturity), avoids AGPL obligations.
  - OnlyOffice or Collabora need a document server.
- **Avoid AGPL** (SuperDoc's community license) in a closed-source commercial Electron app unless you buy the commercial license.

### Gaps
- I did not verify eigenpal docx-editor's feature set or fidelity (the npm page returned 403).
- Not verified: OnlyOffice Document Server and Collabora Online licensing (both are believed to be AGPL with commercial editions, from training knowledge) and their Electron embedding story.
- SuperDoc's commercial pricing is not public.
- I did not verify whether SuperDoc supports Word content controls or template fields.

## 5. Schema-first template design and industry precedents

### Takeaway
Every mature document-automation system separates a **human-authored layout** (Word or PDF) from a **machine-readable variable or interview definition**:
- docassemble: YAML `fields` plus a DOCX/Jinja template.
- Adobe Document Generation: sample JSON plus tagged Word.
- Microsoft: content controls bound to a custom XML part.

The app should do the same. Each template should have a layout file plus a JSON Schema with agent-oriented extension keywords. That schema can drive the agent's extraction prompts and tool schema, the follow-up question form, validation and the render step.

### Cited Findings
- **docassemble `fields`:**
  - Each item maps a label to a variable.
  - `datatype` options include text, date, time, email, integer, number, currency, range, file/files, yesno, noyes, yesnomaybe, checkboxes and multiselect. `input type` options include area, dropdown, radio, combobox and datalist.
  - Fields can also take `choices` (each choice with help, default or `show if`), `default`, `help`, `required: False`, `min`/`max`, `step`, `minlength`/`maxlength` and `accept`.
  - Source: [docassemble fields docs](https://docassemble.org/docs/fields.html)
- **docassemble DOCX practice:**
  - Templates use Jinja2 via python-docx-template, and field values are converted for display (lists become comma-and lists).
  - `raw field variables` or `raw()` pass real objects so loops work.
  - The Utilities page **extracts field names from a PDF or DOCX and generates starter YAML**.
  - `skip undefined: True` is a drafting aid, "not a way to hide logic errors".
  - `update references: True` is needed for a TOC.
  - Source: [docassemble documents docs](https://docassemble.org/docs/documents.html)
- **Adobe Document Generation:**
  - The tag paths mirror the JSON data structure (for example `address.street`).
  - Arrays of objects and simple arrays use different tag patterns.
  - Conditional sections use `expr()`, and HTML lists and tables are allowed in values.
  - Source: [Adobe Document Generation template tags](https://developer.adobe.com/document-services/docs/overview/document-generation-api/templatetags/)
- **Microsoft Word content controls:** content controls can be bound to elements in a custom XML part, and changes in the controls are saved back to that part — [Microsoft Learn: binding content controls to custom XML parts](https://learn.microsoft.com/en-us/previous-versions/visualstudio/visual-studio-2012/bb398244(v=vs.110))
- **Schema and form libraries available in Node** (all current):
  - `zod` v4.6.6 (MIT) — [npm](https://registry.npmjs.org/zod)
  - `ajv` v8.20.0 (MIT) — [npm](https://registry.npmjs.org/ajv)
  - `@jsonforms/core` v3.8.0 (MIT) — [npm](https://registry.npmjs.org/@jsonforms%2Fcore)
  - `@rjsf/core` v6.11.0 (Apache-2.0) — [npm](https://registry.npmjs.org/@rjsf%2Fcore)
  - `survey-core` v3.2.0 (MIT) — [npm](https://registry.npmjs.org/survey-core)
- **pdfme templates are themselves JSON** (`basePdf` plus `schemas` with name, type and position), so layout and field definitions coexist in one machine-readable file — [pdfme getting started](https://pdfme.com/docs/getting-started)

### Inferences
- **Lessons to apply:**
  1. Keep **one canonical schema** per template. Generate everything else from it: the agent's structured-output/tool JSON Schema, the review form via RJSF or JSON Forms, ajv validation, and the docs.
  2. **Mirror the data shape in the tags** (Adobe's lesson). Nested objects map to dotted paths, arrays map to loops.
  3. Distinguish **raw values from display values**. docassemble's `raw()` lesson: format in a dedicated formatting layer (filters or angular expressions), not in the extracted data.
  4. Treat "unknown or missing" explicitly. Avoid relying on `skip undefined`-style silent blanks. Use the docxtemplater `nullGetter` and fail visibly in drafts.
  5. Auto-generate a starter schema from the layout's tags (docassemble's Utilities lesson), then have humans enrich it with descriptions and validation.
- **Recommended JSON Schema extension design** (my synthesis; JSON Schema permits custom keywords). Use standard keywords (`type`, `format`, `enum`, `pattern`, `minimum`, `required`, `items`, `if/then`) plus `x-` keys:
  - `x-label`, plus `description` for both humans and the LLM.
  - `x-agent.instructions`: how to extract or derive the value.
  - `x-agent.sources`: hints such as `["invoice", "id document"]`.
  - `x-agent.askUserIfMissing` (boolean) and `x-agent.question` (the follow-up prompt).
  - `x-agent.confidenceThreshold`.
  - `x-render.format`: date format, currency or locale.
  - `x-render.kind`: `text | richtext | image | checkbox | table`.
  - `x-render.style`: the allowed Word paragraph and character styles for rich text.
  - `x-showIf`, for UI conditionality mirroring the template's conditional sections.
  - `x-tag`: an explicit mapping to the template tag when it differs from the property path.
  - `x-maxWords` for AI narrative fields.
- **Sample pattern** (illustrative, not from a source):

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "tpl://engagement-letter/2.1.0/schema",
  "title": "Engagement Letter",
  "type": "object",
  "required": ["client", "fee", "scopeSummary"],
  "properties": {
    "client": {
      "type": "object",
      "x-label": "Client",
      "properties": {
        "name":    { "type": "string", "description": "Legal name of the client entity", "x-agent": { "sources": ["contract", "id document"], "askUserIfMissing": true } },
        "address": { "type": "string", "x-render": { "kind": "text", "multiline": true } }
      },
      "required": ["name"]
    },
    "effectiveDate": { "type": "string", "format": "date", "x-render": { "format": "d MMMM yyyy" } },
    "fee": {
      "type": "object",
      "properties": {
        "type":   { "type": "string", "enum": ["fixed", "hourly"], "x-label": "Fee type" },
        "amount": { "type": "number", "minimum": 0, "x-render": { "format": "currency:USD" } }
      },
      "required": ["type", "amount"]
    },
    "hourlyRates": {
      "type": "array", "x-showIf": "fee.type == 'hourly'",
      "items": { "type": "object", "properties": { "role": {"type":"string"}, "rate": {"type":"number"} }, "required": ["role","rate"] }
    },
    "includesLitigation": { "type": "boolean", "x-render": { "kind": "checkbox" } },
    "scopeSummary": {
      "type": "string", "contentMediaType": "text/markdown",
      "description": "2–4 short paragraphs summarising scope, written in formal third person.",
      "x-agent": { "instructions": "Write from the uploaded RFP; no bullet nesting beyond 1 level; no headings." },
      "x-render": { "kind": "richtext", "allowedStyles": ["BodyText", "ListBullet"], "x-maxWords": 300 }
    },
    "logo": { "type": "string", "contentEncoding": "base64", "contentMediaType": "image/png", "x-render": { "kind": "image", "maxWidthCm": 4 } }
  }
}
```

  Matching DOCX tags, using docxtemplater with angular expressions and paragraphLoop:

  ```
  {client.name}
  {effectiveDate | date:'d MMMM yyyy'}
  {#fee.type == 'hourly'} … {/}
  {#hourlyRates}{role}  {rate | currency}{/hourlyRates}   (as a table-row loop)
  {includesLitigation ? '☒' : '☐'}
  {@scopeSummaryXml}   (or {~~scopeSummaryHtml} with the HTML module)
  {%logo}              (Image module)
  ```

  The `date` and `currency` filters are custom filters you register.

### Gaps
- I did not retrieve primary documentation for HotDocs, Gavel (formerly Documate), Clio Draft, Formstack Documents, DocuSign templates, SurveyJS or JSON Forms in this session. Lessons from those are not cited here.
- docassemble's `show if`/`hide if` for whole fields, and its list "gather" model for repeating groups, were in parts of the page I did not read.

## 6. Tag extraction, schema–template sync, versioning and testing

### Takeaway
Use docxtemplater's free **InspectModule**, or a regex/XML scan for easy-template-x, to extract every tag and loop structure from the DOCX. In CI and in the template-import UI, assert that the tag set matches the schema's property paths, both ways. Version templates as immutable bundles with semver. Test each template by rendering it with checked-in sample data and comparing snapshots.

### Cited Findings
- **InspectModule:** `getAllTags()` returns a nested tag tree that includes loop scopes. `getStructuredTags()` shows which module (loop, image, raw-xml, style) handles each tag — [docxtemplater FAQ](https://docxtemplater.com/docs/faq/)
- **`getAllStructuredTags()` changelog:** as of v3.67.6 it can be called before `render()` without side effects. Earlier versions could corrupt output when it was used with the table module — [docxtemplater CHANGELOG](https://raw.githubusercontent.com/open-xml-templating/docxtemplater/HEAD/CHANGELOG.md)
- **Template error reporting:** docxtemplater's constructor throws structured errors (for example unclosed tags) with properties describing the problem — [docxtemplater docs](https://docxtemplater.com/docs/api/). The paid Error-location module writes template errors as comments in the Word document — [docxtemplater pricing](https://docxtemplater.com/pricing/)
- **docassemble's equivalent tool:** extracts field names from DOCX or PDF to generate starter YAML. Its guidance is to give every PDF field a unique, concise name — [docassemble documents docs](https://docassemble.org/docs/documents.html)
- **Typst's operations advice:** "test templates with sample data", and monitor compile times and PDF sizes — [Typst blog](https://typst.app/blog/2025/automated-generation)

### Inferences
- **Sync-check algorithm:**
  1. Load the DOCX and attach InspectModule. Call `getAllTags()` and flatten it to dotted paths, where a loop scope becomes `array[]` plus the child keys.
  2. Flatten the JSON Schema the same way.
  3. Report three things:
     - tags missing from the schema (an error),
     - required schema fields not used in any tag (a warning),
     - type mismatches: a loop tag over a non-array, or an image tag over a non-image field.
  4. Run this on template upload in the app (so non-developer edits are validated immediately) and in CI.
- **Testing:** keep `samples/*.json`, covering minimal, full, edge cases, long narrative and empty arrays. Test in three layers:
  - Render, then assert there are no leftover `{` tags.
  - Check text snapshots, extracted with mammoth.
  - Visual regression: PDF to PNG, then pixel diff.
  - Also validate each sample against the schema with ajv.
- **Versioning:**
  - Treat a template as an immutable bundle `templateId@semver`.
  - Removing or renaming a field, or changing its type, is a major version. Adding an optional field is minor. Layout or styling only is a patch.
  - Store the template version and schema hash with every generated output for reproducibility.

### Gaps
- I did not retrieve the exact return shape of `getAllTags()` / `getAllStructuredTags()` from docs (the FAQ excerpt only named them).
- No dedicated open-source "docx template linter" was found.

## 7. Word content controls (SDTs) and custom XML binding

### Takeaway
Content controls bound to a custom XML part are Microsoft's native "structured template" mechanism. It is elegant: fields are typed, have titles and tags, and Word itself can show checkbox, date-picker and dropdown controls. However, **no mature Node library for filling them was found.** Mainstream Node engines use text tags instead. Treat SDTs as an advanced or optional path. You would write your own OOXML manipulation, or use easy-template-x's community data-binding extension.

### Cited Findings
- **The mechanism:** Word stores XML data in custom XML parts and binds content controls to its elements. Edits in the controls are written back to the part — [Microsoft Learn walkthrough](https://learn.microsoft.com/en-us/previous-versions/visualstudio/visual-studio-2012/bb398244(v=vs.110))
- **Mainstream tooling is .NET and Java** (for example Aspose.Words `CustomXmlPart` and docx4j XPath binding). docx4j users report having to set control content explicitly via `setNodeValueAtXPath` — [Aspose CustomXmlPart reference](https://reference.aspose.com/words/net/aspose.words.markup/customxmlpart); [docx4j forum](https://docx4java.org/forums/docx-java-f6/bind-full-xml-document-to-docx-t990.html)
- **easy-template-x** has a community extension, `easy-template-x-data-binding`, said to support updating custom XML parts — [easy-template-x GitHub](https://github.com/alonrbar/easy-template-x)
- A search for a Node.js library dedicated to content-control or custom-XML filling found none. Results were .NET, Java and Office add-in material — [search results summary; e.g., MESCIUS Documents for Word content controls](https://developer.mescius.com/documents-api-word/docs/online/contentcontrols.html)

### Inferences
- **A pragmatic hybrid:** authors put docxtemplater tags *inside* plain-text content controls, using the control's Title and Tag as a friendly label and help text. Word then shows a labelled, highlighted field box to non-developers while the engine still sees text tags.
  - Whether docxtemplater preserves or handles the SDT wrapper cleanly needs testing. That is not verified.
- **Pure SDT binding** needs custom code: write `customXml/itemN.xml` plus rels, and set the `w:dataBinding` XPath on each control. Repeating sections need Word's repeating-section content control (w15), which adds complexity. I would not choose this as the primary approach for v1.
- **Office.js Word add-ins** (or Microsoft's own template tooling) could later give authors a "field picker" sidebar that inserts tags from the schema. Adobe offers this pattern with its Word add-in.

### Gaps
- I did not verify whether docxtemplater, easy-template-x or docx-templates leave content controls intact when tags are placed inside them.
- I did not check the maturity or maintenance of easy-template-x-data-binding.
- I did not retrieve primary documentation for Adobe's Document Generation Word add-in (the tagger built from sample JSON).

## 8. AI-generated narrative and rich text inside templates

### Takeaway
Have the agent produce **constrained Markdown**: paragraphs, bold and italic, at most one level of bullet or numbered lists, and optionally simple tables. Convert it to OOXML in which **every element maps to a named Word style defined in the template**, so branding stays with the template rather than the AI. With docxtemplater, use the paid HTML module (`styleTransformer`, native OOXML) or the free route of converting Markdown to OOXML yourself and injecting it via `{@raw}`. Avoid altChunk approaches.

### Cited Findings
- **docxtemplater HTML module:** maps HTML elements to the template's own Word styles via `styleTransformer` (for example `h1 → Heading1`) and `elementCustomizer` (`pStyle` by class). It emits native OOXML rather than altChunk, so the output survives LibreOffice and Google Docs — [docxtemplater HTML module](https://docxtemplater.com/modules/html/)
- **docxtemplater core `{@rawXml}`** injects raw OOXML at paragraph level only — [docxtemplater tag types](https://docxtemplater.com/docs/tag-types/)
- **docx-templates `HTML`** uses altChunk, which works only in Microsoft Word, not LibreOffice or Google Docs — [docx-templates GitHub](https://github.com/guigrpa/docx-templates)
- **docxtpl/docassemble precedent:** separate paragraph-level (`{{p x|markdown}}`) and run-level (`{{r x|inline_markdown}}`) insertion. The wrong prefix can make content disappear or corrupt the file — [docassemble documents docs](https://docassemble.org/docs/documents.html)
- **Adobe Document Generation:** accepts HTML `<ul>`, `<ol>` and `<table>` in values, which must sit in their own paragraph, with inline styles only — [Adobe Document Generation template tags](https://developer.adobe.com/document-services/docs/overview/document-generation-api/templatetags/)
- **Current Markdown/HTML-to-DOCX converters (MIT):**
  - `@mohtasham/md-to-docx` v4.0.1 (2026-09-10) — [npm](https://registry.npmjs.org/@mohtasham%2Fmd-to-docx)
  - `remark-docx` v0.3.29 (2026-06-16) — [npm](https://registry.npmjs.org/remark-docx)
  - `@turbodocx/html-to-docx` v1.23.1 (2026-09-11) — [npm](https://registry.npmjs.org/@turbodocx%2Fhtml-to-docx)
  - The original `html-to-docx` was last published in 2023 (v1.8.0) and is **stale** — [npm](https://registry.npmjs.org/html-to-docx)
  - `marked` v18.1.0 (MIT) parses Markdown — [npm](https://registry.npmjs.org/marked)
  - `docx` v9.10.0 (MIT) can build paragraph and run XML programmatically — [npm](https://registry.npmjs.org/docx)
- **Typst:** discourages machine-generating its markup. Pass data, including text, as JSON and let the template lay it out — [Typst blog](https://typst.app/blog/2025/automated-generation)

### Inferences
- **A free, deterministic pipeline:**
  1. The agent returns Markdown, validated against an allow-list.
  2. Parse it to an mdast tree with `marked`'s lexer or `remark`.
  3. Map node types to the template's style IDs (`BodyText`, `ListBullet`, `ListNumber`, `Strong`). Read the allowed style IDs from the template's `styles.xml` at load time.
  4. Emit `<w:p><w:pPr><w:pStyle w:val="BodyText"/></w:pPr>…` strings.
  5. Inject them via docxtemplater `{@narrative}`.
  - Numbered lists need `numId` references that already exist in the template's `numbering.xml`. Pre-define a bullet and a numbered list style in the template.
- **For the HTML-first track,** render the same Markdown to sanitized HTML with CSS classes from the template theme.
- **Keep the AI out of formatting decisions.** The prompt should forbid headings unless the schema allows them. Enforce `x-maxWords`, and run a post-validation that strips disallowed nodes.

### Gaps
- I did not test whether `@mohtasham/md-to-docx` or `remark-docx` can emit OOXML fragments that use an existing template's styles, as opposed to whole new documents. Most generate standalone documents.

## 9. Recommendation and what to store per template

### Takeaway
For a commercial Electron app that wants polished output, templates non-developers can maintain, and minimal license cost, I recommend:

- **Word-first (DOCX layout):**
  - Engine: **docxtemplater** (MIT core, with angular-expressions and InspectModule). Budget **PRO at 1,250 EUR/yr** for Image, HTML, Styling and Table/Error-location. If images are the only paid need, **easy-template-x** is a fully free alternative.
  - Schema: a **JSON Schema with `x-agent` and `x-render` extensions** as the single source of truth.
  - Preview: **docx-preview** for fast feedback, plus a **PDF tab**.
  - PDF: **LibreOffice headless**, user-installed or bundled. Escalate to a commercial converter only if fidelity complaints arise.
- **HTML/CSS-first (only if PDF is the sole deliverable):**
  - Layout: HTML templates with a brand theme JSON.
  - PDF via `webContents.printToPDF`. This is free and pixel-perfect, and the preview is identical to the output.
  - Typst is the premium-typography variant of this track.
- Add **pdfme** or **@cantoo/pdf-lib** only for fixed government or third-party forms.

### Cited Findings
- Licensing and cost facts are cited in sections 1–4: docxtemplater pricing [docxtemplater pricing](https://docxtemplater.com/pricing/), easy-template-x MIT [npm](https://registry.npmjs.org/easy-template-x), SuperDoc AGPL [npm](https://registry.npmjs.org/superdoc), Carbone CCL restrictions [Carbone LICENSE.md](https://unpkg.com/carbone@3.8.2/LICENSE.md), Tiptap paid conversion [Tiptap pricing](https://tiptap.dev/pricing.md), and Syncfusion community eligibility [Syncfusion](https://syncfusion.com/communitylicense).
- **Free PDF engine inside Electron:** `printToPDF` supports CSS page size, header/footer templates and experimental tagged PDF — [Electron webContents docs](https://www.electronjs.org/docs/latest/api/web-contents)
- **LibreOffice is the de facto free DOCX-to-PDF path** used by docassemble, Carbone and Gotenberg — [docassemble](https://docassemble.org/docs/documents.html); [carbone](https://github.com/carboneio/carbone); [Gotenberg](https://github.com/gotenberg/gotenberg)

### Inferences
- **Decision rule:**
  - If end users or their clients need an **editable Word file**, the layout must be DOCX. Choose Word-first.
  - If the deliverable is a **PDF report or letter** and brand polish matters most, HTML-first gives the best quality for zero license cost and the simplest preview. Editing is through a theme (colors, fonts, logo) plus HTML partials, or a TipTap-based block editor if non-developers must change copy.
  - Supporting both from one layout is possible: DOCX as the master, with LibreOffice for PDF. HTML-to-DOCX in the reverse direction is lossy.
- **Licenses to avoid or flag in a closed-source commercial app:** SuperDoc community (AGPL), OnlyOffice/Collabora servers (AGPL; not verified this session), Carbone CCL (if the product is "primarily a document generator"), and docxtpl (LGPL; Python, less relevant). The safe set is docxtemplater core (MIT), easy-template-x, docx, docx-templates, pdfme, @cantoo/pdf-lib, @react-pdf/renderer and marked (all MIT), docx-preview (Apache-2.0) and typst.ts (Apache-2.0).
- **Suggested per-template bundle** (a folder or zip, immutable per version):

```
templates/engagement-letter/2.1.0/
  manifest.json        # id, name, version (semver), description, locale(s), category, engine ("docxtemplater@3.71"),
                       # outputs ["docx","pdf"], layout file path, schema path, schemaHash, layoutHash,
                       # requiredModules ["image","html"], fonts [...], createdBy, changelog, status (draft|published),
                       # agentPrompt (template-level instructions: purpose, tone, jurisdiction), followUpPolicy
  layout.docx          # Word file with tags; brand via Word styles/theme; (or layout.html + theme.css / layout.typ)
  schema.json          # JSON Schema 2020-12 with x-agent / x-render / x-showIf extensions
  ui.json (optional)   # JSON Forms / RJSF uiSchema: grouping, order, widgets for the review form
  samples/minimal.json, samples/full.json, samples/edge-*.json
  expected/full.pdf    # golden output for visual regression (optional)
  preview.png          # thumbnail rendered from samples/full.json (page 1)
  assets/logo.png      # default images referenced by the template
```

- **Runtime flow:**
  1. Load the manifest and schema.
  2. Give the agent the schema (or a derived Zod or JSON Schema tool definition) plus `x-agent` instructions.
  3. The agent extracts values with per-field confidence and provenance (source document and page).
  4. Run ajv validation and compute missing or low-confidence fields. The agent asks the follow-up questions defined by `x-agent.question`.
  5. The user reviews values in a schema-driven form beside the live preview.
  6. Render the DOCX with docxtemplater, convert to PDF, and store the output with `templateId@version`, the data JSON and the provenance.

### Gaps
- I did not verify the total installer-size impact of bundling LibreOffice with Electron, or its MPL compliance details.
- I did not determine whether docxtemplater's "instance" limit permits distribution inside a desktop app installed by many customers. This is critical for budgeting; confirm with the vendor.
- I did not evaluate how the GitHub Copilot SDK's structured-output or tool-calling handles large JSON Schemas with custom `x-` keywords. Stripping or transforming them before sending may be necessary. This is out of scope here.
