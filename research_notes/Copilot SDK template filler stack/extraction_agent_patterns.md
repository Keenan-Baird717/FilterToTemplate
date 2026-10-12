# Agent Architecture and Retrieval Patterns for Document-to-Template Extraction (Node/TypeScript, GitHub Copilot SDK)

Scope: research current as of 2026-10-11. Covers long-context vs RAG vs agentic search; local retrieval in Node; structured extraction; provenance; confidence and clarifying questions; agent loop design on the Copilot SDK; narrative vs atomic fields; evaluation; cost and latency. Every claim in "Cited Findings" has an inline source. "Inferences" holds recommendations derived from those findings. Treat vendor-reported numbers as vendor claims.

---

## 1. Long context vs RAG vs agentic search (2026)

### Takeaway
No approach wins everywhere. Vendors (Anthropic, Cursor, LlamaIndex) have converged on a hybrid: a small amount of high-signal context loaded up front, plus agentic tools (list, grep/BM25, read section) that pull in more just in time. Embeddings help as an additional tool when the corpus is large or queries are conceptual. With hundreds of documents, "stuff everything" is not viable; long context is best used to read one or a few relevant documents or sections in full once they have been located.

### Cited Findings
- Anthropic (Sep 29, 2025) frames context as a finite "attention budget". The goal is "the smallest set of high-signal tokens that maximize the likelihood of your desired outcome". Recall degrades gradually as context grows ("context rot"). — [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Anthropic describes "just-in-time" agents that keep lightweight identifiers (file paths, stored queries, links) and load data at runtime with tools. Claude Code uses "primitives like glob and grep". The trade-off is that "runtime exploration is slower than retrieving pre-computed data." The article recommends a **hybrid** (some data up front, the rest explored on demand) and says hybrids may suit less dynamic domains such as legal or finance. Its simplest advice: "do the simplest thing that works." — [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- The same article recommends sub-agents that work in clean context windows and return condensed summaries of roughly 1,000–2,000 tokens to a lead agent. It also recommends structured note-taking to persistent memory outside the context window (e.g., NOTES.md, to-do lists), and compaction or tool-result clearing for long sessions. — [Anthropic: Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Chroma's "Context Rot" report (July 14, 2025) tested 18 models (Claude Opus 4/Sonnet 4, GPT-4.1, o3, Gemini 2.5, Qwen3 and others). Performance became less reliable as input length grew, even on simple tasks. Topically related "distractor" passages compounded errors. On LongMemEval, focused ~300-token prompts scored significantly higher than the full ~113k-token prompts. — [Chroma: Context Rot](https://www.trychroma.com/research/context-rot)
- NoLiMa (ICML 2025) is a needle test with minimal lexical overlap between question and needle. Of 13 models claiming 128K+ context, 11 fell below 50% of their short-context baseline at 32K tokens. GPT-4o dropped from 99.3% to 69.7%. — [NoLiMa, arXiv 2502.05167](https://arxiv.org/abs/2502.05167)
- OpenAI's GPT-4.1 guide reports strong needle-in-a-haystack results up to 1M tokens. It warns that "long context performance can degrade as more items are required to be retrieved", and on tasks that need awareness of the whole context. Instructions placed at both the start and end of long context performed best. XML or pipe-delimited document formats worked well; JSON "performed particularly poorly". — [OpenAI GPT-4.1 Prompting Guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)
- LaRA (ICML 2025): 2,326 test cases, 11 LLMs. Whether RAG or long context wins "depends on a complex interplay of factors": model size, long-text capability, context length, task type, and the characteristics of retrieved chunks. The authors call earlier comparisons inconclusive because of benchmark-design limitations. — [LaRA, arXiv 2502.09977](https://arxiv.org/abs/2502.09977); [PMLR](https://proceedings.mlr.press/v267/li25dv.html)
- Anthropic's 2024 Contextual Retrieval post said that if a knowledge base is under ~200,000 tokens (~500 pages), "you can just include the entire knowledge base in the prompt." — [Anthropic: Contextual Retrieval (Sep 2024)](https://www.anthropic.com/news/contextual-retrieval). *Flag: this predates the context-rot and NoLiMa findings, and Anthropic's own 2025 guidance stresses minimal high-signal context. Treat it as an upper bound, not a default.*
- Cursor (Nov 6, 2025) added semantic search alongside grep in its agent. Answer accuracy rose 12.5% on average (6.5%–23.5% depending on model). Code retention rose 2.6% on codebases with 1,000+ files. Cursor concluded "the combination of these two leads to the best outcomes." — [Cursor: Improving agent with semantic search](https://cursor.com/blog/semsearch)
- Claude Code reportedly started with RAG over a local vector DB and moved to agentic search (grep/glob/read), which Boris Cherny said worked better in internal use. That claim is relayed through secondary sources, and the primary statement was not found. — [SmartScope summary](https://smartscope.blog/en/ai-development/practices/rag-debate-agentic-search-code-exploration/)
- LlamaIndex (Jan 13, 2026) compared a filesystem agent (read/grep/glob/parse tools, Gemini 3 Flash) with hybrid RAG on 5 arXiv papers:
  - Agent: correctness 8.4 vs 6.4, relevance 9.6 vs 8.0. RAG was faster (7.36s vs 11.17s).
  - At 100–1,000 abstracts, RAG was "substantially faster and slightly more correct."
  - Conclusions: filesystem search slows as the corpus grows and suits async or background work; RAG suits latency-sensitive, large-scale use.
  - The sample is small (5 questions). — [LlamaIndex: Did filesystem tools kill vector search?](https://www.llamaindex.ai/blog/did-filesystem-tools-kill-vector-search)
- A 2026 preprint (ChunkRank) found full-context and chunked pipelines statistically indistinguishable on single-hop QA when the document fits. Full context won on multi-hop (HotpotQA subset 55.1 vs 34.6 EM), because splitting separates evidence that must be combined. The authors call this a narrow probe. — [ChunkRank, arXiv 2609.29828](https://arxiv.org/pdf/2609.29828)
- Unstract's practitioner guidance: if a document fits the context, not chunking gives the best extraction results, but cost rises with many extraction prompts per document. — [Unstract: intelligent chunking](https://unstract.com/blog/how-intelligent-chunking-strategies-makes-llms-better-at-extracting-long-documents/)
- Anthropic's multi-agent research system (June 13, 2025): a multi-agent setup (Opus 4 lead, Sonnet 4 sub-agents) beat single-agent Opus 4 by 90.2% on an internal research eval. Token usage alone explained 80% of BrowseComp performance variance. — [Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)

### Inferences
- **Recommended default for "hundreds of documents":** agentic retrieval with a hybrid front-load.
  - Up front: the template section's field definitions and a compact **document catalog** (title, type, date, page count, a 1–2 line summary, key entities) generated at ingest.
  - Then the agent calls `search_documents` (BM25 or hybrid) and `read_document_section` to pull pages just in time. This mirrors Claude Code (front-loaded CLAUDE.md plus grep) and Cursor (grep plus semantic).
- **Use long context deliberately:** once the relevant 1–5 documents for a section are identified, reading them in full (or whole sections) beats chunk retrieval for multi-hop fields such as "effective date given an amendment". This is the ChunkRank multi-hop finding, and the "tables/clauses split across chunks" problem.
- **Avoid concatenating the whole corpus**, even when it fits. Distractors (similar documents such as several versions of a contract) are exactly the condition that context-rot and NoLiMa show degrades accuracy.
- **Format documents in prompts as XML-tagged blocks** with doc IDs and page numbers (`<doc id="D12" title="..." page="4">…</doc>`), not JSON, per OpenAI's long-context guidance. Put task instructions both before and after large inserted content.
- Treat "<200K tokens → stuff it" (Anthropic 2024) as outdated for accuracy-critical extraction. It is still defensible for a single small document set where cost and latency dominate.

### Gaps
- No published benchmark found that compares long-context, RAG and agentic search on **multi-document form filling** specifically. Teams need their own eval (see §8).
- Context-window sizes and effective-context behaviour of the specific models exposed through the Copilot SDK (and whether BYOK models differ) were not researched here.

---

## 2. Local retrieval stack options in Node (desktop app, hundreds of documents)

### Takeaway
At hundreds of documents (roughly 10^4–10^5 chunks), a single embedded SQLite file can hold lexical search (FTS5/BM25) and vectors (sqlite-vec, brute-force KNN), fused with Reciprocal Rank Fusion. This is the simplest, most portable desktop option. LanceDB (Node) is the stronger choice if built-in hybrid search and on-disk ANN indexes are wanted. Orama is an in-memory, pure-JS alternative. Local embeddings via Transformers.js/ONNX (e.g., EmbeddingGemma-300m) are viable. Rerankers in Node are mostly do-it-yourself.

### Cited Findings
- **FTS5 + sqlite-vec hybrid with RRF:** Alex Garcia's sqlite-vec work, relayed by Simon Willison, found Reciprocal Rank Fusion the most promising way to combine FTS5 keyword results with sqlite-vec KNN results. It runs in one SQL query: a CTE per leg, a join, and a `1/(k+rank)` score. — [Simon Willison: Hybrid FTS + vector search with SQLite](https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/)
- **sqlite-vec characteristics:**
  - Benchmarks use brute-force linear scans, not ANN. The project describes itself as pre-v1 and warns of breaking changes.
  - Node install is `npm install sqlite-vec`. A PhotoStructure fork publishes prebuilt binaries for Linux (x64/ARM64/musl), macOS (x64/ARM64) and Windows (x64/ARM64).
  - Sources: [sqlite-vec GitHub](https://github.com/asg017/sqlite-vec); [@photostructure/sqlite-vec README](https://cdn.jsdelivr.net/npm/@photostructure/sqlite-vec@1.2.0/README.md)
- A 2026 arXiv paper ("SQLite is Enough", scrydb) evaluates lexical, semantic and hybrid search with rank fusion inside SQLite on IR benchmarks. It is Python-only and useful for method. — [scrydb, arXiv 2608.24060](https://arxiv.org/pdf/2608.24060)
- **LanceDB (TypeScript):**
  - Supports hybrid (vector plus full-text) search, with reranking via a built-in `RRFReranker` (`await RRFReranker.create(k)`) or a custom reranker interface.
  - Model-based rerankers (Cohere, cross-encoder, ColBERT) are Python-only, so TypeScript users must implement their own.
  - The linear-combination reranker is deprecated in favour of RRF.
  - Sources: [LanceDB reranking docs](https://docs.lancedb.com/reranking); [LanceDB hybrid search](https://docs.lancedb.com/search/hybrid-search.md)
- **Orama:**
  - `mode: 'hybrid'` runs BM25 full-text plus vector search and merges them, with default `hybridWeights` of 0.5/0.5. — [Orama docs: hybrid search](https://docs.orama.com/open-source/usage/search/hybrid-search)
  - The official embeddings plugin uses TensorFlow.js plus Universal Sentence Encoder (512-dim) and needs `@tensorflow/tfjs-node` on Node. — [Orama embeddings plugin (docs mirror)](https://www.mintlify.com/oramasearch/orama/plugins/embeddings)
  - A third-party design note calls that path heavy (~150MB+) with native compilation, and prefers `@huggingface/transformers` (~23MB model). Not verified. — [backlog-mcp ADR](https://glama.ai/mcp/servers/@gkoreli/backlog-mcp/blob/c5cbde3f0edc875b6728e19d77e87ce8fb1beaf5/docs/adr/0042-hybrid-search-local-embeddings.md)
- **Local embeddings:**
  - `onnx-community/embeddinggemma-300m-ONNX` (300M parameters, Gemma 3–based) is packaged for Transformers.js (`npm i @huggingface/transformers`). It requires fp32, q8 or q4 (no fp16) and uses query/document prefixes. — [EmbeddingGemma ONNX model card](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX)
  - Transformers.js v3.6 release notes show a `feature-extraction` pipeline for Qwen3-Embedding (0.6B and larger). — [Transformers.js release notes (secondary)](https://releases.sh/release/rel_u52_l6aPDGg5jtwj1Qwy3)
- **Contextual Retrieval (Anthropic):** prepending ~50–100 tokens of LLM-generated document context to each chunk before embedding and BM25 indexing cut top-20 retrieval failure rates:
  - 35% with contextual embeddings alone (5.7%→3.7%)
  - 49% adding contextual BM25 (→2.9%)
  - 67% adding reranking (→1.9%)
  - Retrieving 20 chunks beat 5 or 10.
  - One-time cost was ~$1.02 per million document tokens with prompt caching.
  - Source: [Anthropic: Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- Cursor trained a custom embedding model on agent traces (what should have been retrieved) and found that grep plus semantic beat either alone. — [Cursor: semantic search](https://cursor.com/blog/semsearch)

### Inferences
- **Recommended desktop stack:** `better-sqlite3` (or Node 24's built-in `node:sqlite`, to be verified by the stack researcher) with FTS5 for BM25, plus `sqlite-vec` for vectors, in **one DB file per project**. It also holds parsed pages, the chunk→page/char-offset map, and the fill state. One file is easy to back up, export and delete for privacy.
  - Brute-force KNN over ~10^5 vectors of 384–768 dims is fast enough on a desktop. This is an inference; the benchmark should be run on target hardware.
- **Lexical first:** template fields are often keyword-anchored ("Policy Number", "Effective Date", party names, IDs), and BM25 handles these well. Add embeddings as a second tool or leg for conceptual queries ("any mention of prior claims"), fused with RRF.
- **Contextual chunk headers are cheap with local data:** prepend "doc title / section heading / page" to each chunk before FTS indexing at no LLM cost. Optionally add LLM-generated context (Anthropic's method) for the vector leg.
- **Reranking in Node:** options are a small cross-encoder via Transformers.js or ONNX Runtime, or an LLM rerank step. The agent's own judgment after reading results may suffice in an agentic loop. LanceDB does not provide a TypeScript cross-encoder.
- **Embedding choice:** local (privacy, offline, zero marginal cost; EmbeddingGemma-300m q8 or a bge-small-class model) vs API (higher quality, but sends document text off-device). For a desktop app handling sensitive intake documents, local is the safer default. Keep the vector leg optional so lexical-only still works.

### Gaps
- No 2026 Node-specific latency benchmarks found for sqlite-vec, LanceDB or Orama at 10^4–10^5 chunks.
- Instructor-js maintenance status and Node cross-encoder reranker packages were not verified.

---

## 3. Structured extraction (schemas, Zod, per-section extraction, repeating groups, normalization, tools)

### Takeaway
Do not emit one giant JSON document for a template with hundreds of fields. ExtractBench (2026) shows frontier models produce valid JSON only about half the time on realistic schemas, and 0% on a 369-field schema. Decompose by template section and repeating group. Capture values through **small, Zod-validated tool calls** (`set_field` / `add_row`), not one-shot structured output, and validate and normalize deterministically in code.

### Cited Findings
- **ExtractBench** (Contextual AI, Feb 2026, KDD 2026). 35 PDFs, 2,076 pages, 12,867 fields, 5 domains.
  - Prompt mode, 6 frontier models: 51% valid JSON and a 4.6% field pass rate (strict per-field metrics).
  - SEC 10-K/Q (369 keys): "0% valid output … across all tested models."
  - Schema breadth was the dominant failure predictor; depth was a weak predictor.
  - Long arrays (citation lists) cut validity to 39%.
  - Structured-output mode *reduced* validity to 37%, and some schemas were rejected by providers.
  - Recommendations: split large schemas, track validity separately from accuracy, declare metrics per field.
  - Source: [ExtractBench, arXiv 2602.12247](https://arxiv.org/html/2602.12247)
- **OpenAI Structured Outputs limits:**
  - Up to 5,000 object properties and 10 nesting levels; up to 1,000 enum values; 120,000 total characters of names and enums.
  - All fields must be `required` (use `["string","null"]` for optional) and `additionalProperties: false`.
  - The root must be an object, not `anyOf` (so a Zod discriminated-union root fails). `allOf`, `not`, `if/then/else` are unsupported.
  - The JS SDK uses `zodTextFormat`. Check for `refusal` and `incomplete` (`max_output_tokens`) results.
  - Source: [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- **Anthropic:** Citations cannot be combined with structured outputs. Enabling citations on any document and also setting `output_config.format` returns HTTP 400. — [Claude Citations docs](https://platform.claude.com/docs/en/build-with-claude/citations)
- **Zod 4** converts natively with `z.toJSONSchema()` (default Draft 2020-12; draft-07 and openapi-3.0 targets). Descriptions are attached via `.meta()`. Types such as `z.date()` and `z.transform()` are unrepresentable and throw by default. — [Zod: JSON Schema](https://zod.dev/json-schema)
- **Copilot SDK custom tools:** `defineTool(name, { description, parameters, handler })` accepts a Zod schema (converted to JSON Schema) or raw JSON Schema. Handlers can return JSON, a string or a `ToolResultObject`. — [Copilot SDK Node README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- **Anthropic tool-design guidance:**
  - Consolidate tools, namespace them, return meaningful identifiers (names, not UUIDs), and offer concise vs detailed response formats (concise used ~1/3 of the tokens).
  - Paginate and truncate (Claude Code caps tool output at 25,000 tokens).
  - Return actionable error messages. — [Anthropic: Writing tools for agents (Sep 2025)](https://www.anthropic.com/engineering/writing-tools-for-agents)
  - "Poka-yoke" the arguments so mistakes are hard to make. — [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- **LangExtract (Google, Apache-2.0, Python):** instruction plus few-shot extraction with source grounding (each extraction mapped to a `char_interval`; unlocatable ones get `None`), chunking with parallel workers, multiple `extraction_passes` for recall, and an interactive HTML review visualizer. Models: Gemini, OpenAI, Ollama, plus plugins. "Not an officially supported Google product." — [google/langextract](https://github.com/google/langextract)
  - An unofficial TypeScript port exists on npm (`langextract@1.1.0`). Maintenance was not verified. — [langextract TS README](https://unpkg.com/langextract@1.1.0/README.md)
- **LlamaExtract (LlamaCloud, hosted):**
  - Per-leaf-field citations (page plus verbatim text; bounding boxes in v1 docs) in MULTIMODAL/PREMIUM modes. — [LlamaExtract extensions](https://developers.llamaindex.ai/python/cloud/llamaextract/features/extensions)
  - Beta confidence scores (parsing, extraction, combined) that are *not calibrated*. — [LlamaExtract extensions](https://developers.llamaindex.ai/python/cloud/llamaextract/features/extensions)
  - A TypeScript client is documented. — [TS docs](https://developers.llamaindex.ai/typescript/cloud/llamaextract/features/extensions/)
  - The agentic tier reportedly supports schemas up to 3,200 fields (Extract v2.5, Oct 1, 2026). — [LlamaParse changelog 2026-07](https://developers.llamaindex.ai/llamaparse/changelog/2026-07/index.md); [Unite.AI](https://www.unite.ai/?p=477747)
- **BAML:** a schema DSL that generates TypeScript/Python clients. "Schema-aligned parsing" (a Rust parser) repairs malformed LLM output. Vendor-reported BFCL results claim SAP beats native function calling (e.g., 93% with GPT-4o). These are vendor numbers from Aug 2024 and are not independently verified. — [BoundaryML: SOTA function calling](https://boundaryml.com/blog/sota-function-calling); [Why BAML](https://docs.boundaryml.com/guide/introduction/why-baml)
- **Unstract** (open source, self-hostable; AGPL per a third-party profile, not verified): its "LLMChallenge" runs an extractor and a challenger model in parallel and returns a value only if both agree, else NULL. The vendor suggests pairing different providers and says it adds ~2–5 seconds. — [Unstract LLMChallenge](https://unstract.com/llmchallenge/)

### Inferences
- **Template definition as source of truth:** define the template in TypeScript/Zod (or JSON Schema) with per-field metadata:
  - `id`, `label`, `description` (written like a docstring for a new hire), `type`, `normalizer`
  - `required`, `evidenceHint` (where it is usually found), `askIfMissing`, `allowedSources`
  - `evalMetric` (ExtractBench-style per-field metric declaration)
  - Use `z.toJSONSchema()` to derive tool parameter schemas.
- **Capture via tools, not one-shot output.** Under the Copilot SDK there is no direct "response_format". The structured channel is tool calls. Use narrow tools such as:
  - `set_field({ fieldId, value, sources:[{docId, page, quote}], confidence, note })`
  - `add_row({ groupId, rowKey, values, sources })` and `update_row(...)` for repeating groups and tables
  - `mark_missing({ fieldId, searched:[queries], reason })`
  - `flag_conflict({ fieldId, candidates:[{value, sources}] })`

  Each call is small (avoiding the ExtractBench breadth/volume failure), idempotent, and validated server-side with Zod. Schema errors come back as actionable messages ("`effective_date` must be ISO date YYYY-MM-DD; you sent 'March 3rd'"). This supplies the retry loop for free.
- **Normalize in code, not the prompt.** Ask the model for the *verbatim* source string plus a normalized value. Re-normalize in the handler (dates to ISO 8601, currency to minor units plus ISO 4217, names, IDs) and reject or flag mismatches. Keep both the `raw` and `normalized` values in fill state for audit.
- **Repeating groups and tables:** extract per group with a stable `rowKey` (e.g., vehicle VIN, claimant name plus DOB) so rows can be merged across documents and re-runs, and duplicates detected. Large arrays are the failure mode, so add rows incrementally, never as one huge array.
- **Section decomposition:** one extraction pass or sub-agent per template section (10–40 fields) keeps schemas small, enables parallelism and scopes retrieval.
- **Portability:** LangExtract's ideas (few-shot examples, char-interval grounding, multi-pass for recall, HTML review) port easily to Node; the core is quote→offset alignment. LlamaExtract is a hosted, no-tool-loop alternative for teams willing to send documents to LlamaCloud, but it does not fit the agent-asks-user loop or local-first privacy. BAML is usable in TypeScript but adds a DSL and code-gen step, which offers little benefit when values arrive via validated tool calls.

### Gaps
- Whether the Copilot SDK runtime enforces tool-parameter schemas strictly (constrained decoding) or only best-effort, per model provider, was not found in the docs. Handler-side Zod validation is required either way.
- Instructor-js current status was not checked.

---

## 4. Provenance and citations (field-level grounding)

### Takeaway
Field-level provenance should be **owned by the app**. Each value stores `{docId, page, quote, charStart, charEnd}`, and the `set_field` handler verifies the quote exists in the parsed source (normalized or fuzzy match) before accepting it. Provider citation features (Anthropic Citations; the Copilot SDK's experimental citations) are useful for narrative chat answers. They attach citations to response *text*, not to structured fields, and Anthropic's is incompatible with structured outputs.

### Cited Findings
- **Anthropic Citations API:**
  - Supports plain text (auto-chunked into sentences; `char_location`), PDF (`page_location`; scanned PDFs without a text layer are not citable) and custom content documents (`content_block_location`, with block indices, so you control granularity, e.g., pre-chunked RAG passages).
  - `cited_text` does not count toward output tokens, nor toward input tokens when passed back.
  - Citations are "guaranteed to contain valid pointers to the provided documents", and in Anthropic's evaluations are "significantly more likely to cite the most relevant quotes" than prompt-based citing.
  - Incompatible with structured outputs (HTTP 400). Source documents can be prompt-cached.
  - Source: [Claude Citations docs](https://platform.claude.com/docs/en/build-with-claude/citations)
- **Copilot SDK citations (experimental):**
  - Enabled with `enableCitations: true` on create *and* resume.
  - Tools can return an experimental `citableSources` array (`id`, `content`, optional `title`/`url`/`path`) that persists with the tool result across resume.
  - Citations arrive only on the final `assistant.message` event (not deltas) as `{ sources, spans }`. Spans are UTF-16 offsets into the *response text*; each reference has `sourceId`, optional `citedText`, and optional `location` of type `char` | `page` | `block`.
  - Coverage depends on provider; models may return none.
  - Source: [Copilot SDK: Citations](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/citations)
- LangExtract grounds every extraction to a character interval in the source and sets `char_interval=None` when it cannot be located, so such extractions can be filtered out. It produces an HTML visualizer to review extractions in context. — [google/langextract](https://github.com/google/langextract)
- LlamaExtract returns page number plus verbatim text per leaf field, and bounding-box coordinates in v1 docs. — [LlamaExtract extensions](https://developers.llamaindex.ai/python/cloud/llamaextract/features/extensions); [v1 extensions](https://developers.llamaindex.ai/llamaparse/extract/v1/features/extensions/)
- Extend returns per-field `ocrConfidence` keyed by field path (e.g., `line_items[0].description`) when citations are enabled. — [Extend confidence scores](https://docs.extend.ai/product/extraction/confidence-scores)
- "Attribute First, then Generate" (ACL 2024): select source segments first, then generate conditioned on them, so the segments double as fine-grained attributions. Citations become more concise, quality is comparable, and human fact-verification time drops (~50% per a summary). — [arXiv 2403.17104](https://arxiv.org/abs/2403.17104)

### Inferences
- **Verify every quote in the `set_field` handler.**
  1. Normalize both quote and page text (Unicode NFKC, collapse whitespace, de-hyphenate line breaks, unify quotes and dashes, case-fold).
  2. Find an exact substring; if none, fall back to a fuzzy window match (e.g., Levenshtein ratio ≥ 0.9 over a sliding window).
  3. Store the resolved `charStart/charEnd` against the *original* page text.
  4. On failure, return an actionable error ("quote not found on D12 p.4; re-read the page and copy the exact text") rather than silently accepting. This is LangExtract's `char_interval=None` filter, enforced as poka-yoke.
- **Also check that the value is supported by the quote:** for typed fields, assert the normalized value can be derived from the quote (the date in the quote parses to the same ISO date; the amount matches). For semantic fields, defer to the verifier pass (§5).
- **Store provenance per page with stable offsets** from the ingest step: `doc → pages[] → text + optional word bounding boxes` from the PDF parser. The UI can then highlight the exact span on a rendered page (PDF.js text layer) when a field is clicked. The bounding box is optional; char offsets plus page are enough for text-layer highlighting.
- **Source types:** `document` (docId/page/span), `user` (answered in chat, with the question ID and timestamp), `derived` (computed from other fields, with the formula), `default` (template default). Users then see why each value is there, and the final document can include an appendix or footnotes of provenance.
- **Use Copilot SDK `citableSources` in `read_document_section` and `search_documents` tool results** so narrative chat answers ("why did you pick this date?") get provider citations for free. Do not rely on them for field provenance: they are experimental, response-text-anchored, final-message-only and provider-dependent.

### Gaps
- Whether `citableSources` from Copilot SDK tools yield `char` locations into the tool-supplied `content` (versus only block-level) for each provider was not documented.
- No benchmark found on the rate at which LLM-supplied verbatim quotes fail exact-match against source in extraction settings.

---

## 5. Confidence, gap detection and clarifying questions

### Takeaway
Raw model confidence (logprobs or verbalized scores) is a weak field-level signal. Decide when to ask from **observable, rule-based states**: required field missing after documented search; conflicting values across documents; quote not verifiable; normalization failed; verifier or second-model disagreement. Batch questions into **typed forms** (the Copilot SDK supports both a simple `ask_user` and MCP-style form elicitation), write answers back as `user`-sourced values, and resume.

### Cited Findings
- **"Beyond Logprobs"** (arXiv 2606.24420, June 2026):
  - Token logprobs, verbalized confidence and multi-sample self-consistency "collapse toward all-positive behavior at practical thresholds" and give "no reliable separation" on document field extraction.
  - A fused signal (cross-call disagreement between a field-guided "Hunter" call and a document-guided "Mapper" call, plus LLM uncertainty, OCR, image quality and layout) reached 0.928 ROC AUC on DocILE invoices and 99.1% accuracy at 80% coverage.
  - The DocILE failure rate was 26% across 55-field invoices. Single-author preprint.
  - Source: [arXiv 2606.24420](https://arxiv.org/abs/2606.24420)
- Extend is phasing out `logprobsConfidence` (null from extraction_performance 4.6.0). It recommends `ocrConfidence` plus its Review Agent, and routing on `minConfidence`/`avgConfidence` thresholds tuned on your own documents (example thresholds 0.9/0.95/0.98). It notes that ambiguous field names lower confidence and that clear field descriptions are "the main lever". — [Extend confidence scores](https://docs.extend.ai/product/extraction/confidence-scores)
- LlamaExtract confidence scores "are not calibrated", so a 0.6 does not mean 60% accurate; use them for comparison, not hard thresholds. — [LlamaExtract extensions](https://developers.llamaindex.ai/python/cloud/llamaextract/features/extensions)
- Unstract LLMChallenge (dual-model agreement, NULL on disagreement) is a vendor pattern for flagging uncertain fields. — [Unstract LLMChallenge](https://unstract.com/llmchallenge/)
- Anthropic recommends an evaluator-optimizer loop when evaluation criteria are clear, and parallelization by "voting" when multiple attempts raise confidence. — [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- **Clarification research:**
  - QuestBench (NeurIPS 2025 D&B): models reached only ~40–50% at identifying the single missing piece of information on logic and planning tasks. Solving the fully specified problem does not imply asking the right question. — [QuestBench, arXiv 2503.22674](https://arxiv.org/abs/2503.22674)
  - AskBench (2026) adds multi-turn clarification checkpoints and rubric-guided RL. — [arXiv 2602.11199](https://arxiv.org/pdf/2602.11199)
  - "Ask or Assume?" (2026) separates underspecification *detection* from execution in coding agents. — [SOTAVerified listing](https://sotaverified.org/papers/260326233)
- **Copilot SDK user input:**
  - `onUserInputRequest(request, invocation)` enables the model-facing `ask_user` tool. The request has `question`, optional `choices` and `allowFreeform` (default true); the response is `{ answer, wasFreeform }`.
  - `askUserVariant: "legacy" | "elicitation"` selects the tool shape.
  - `onElicitationRequest(context)` receives `message`, `requestedSchema` and `mode` (`form` | `url`), and returns `{ action: accept|decline|cancel, content }`.
  - Check `session.capabilities.ui?.elicitation`. `session.ui` exposes `confirm`, `select`, `input` and `elicitation` helpers.
  - Source: [Copilot SDK Node README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); also [.NET package docs](https://feed.nuget.org/packages/GitHub.Copilot.Sdk/)
- **MCP form elicitation schema** (spec 2025-11-25), which the SDK's `requestedSchema` appears to follow:
  - Limited to **flat objects with primitive properties**: string (with `format` email/uri/date/date-time, min/max length, pattern), number/integer (min/max), boolean, and single- or multi-select enums (optionally titled via `oneOf`/`anyOf` const+title).
  - Defaults are supported. No nested objects or arrays of objects.
  - Clients must let users review and modify responses before sending. Responses are accept/decline/cancel.
  - Form mode must not be used for secrets.
  - Source: [MCP spec: Elicitation](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)

### Inferences
- **Field status machine (in fill state):** `empty → candidate → verified | conflict | missing | needs_user → user_answered | approved | rejected`. Asking is triggered by state, not by a model-reported number:
  - **Missing:** a required field with no candidate after the extractor logged ≥N searches (`mark_missing` requires the queries tried; this prevents lazy "not found").
  - **Conflict:** ≥2 verified candidates with different normalized values from different docs. Auto-resolve by template rules where possible (latest-dated document wins; amendment beats original), else ask with the candidates as choices and their sources shown.
  - **Unverifiable:** quote not found, or the value is not derivable from the quote.
  - **Low agreement:** for high-stakes fields only, a second independent extraction (different prompt angle, field-guided vs document-guided as in "Beyond Logprobs", or a different model as in LLMChallenge) disagrees.
  - **Rule failures:** cross-field validation (end date before start date; totals not summing).
- **Keep self-reported confidence as a tiebreaker or sort key only.** Calibrate any threshold on the golden set (§8).
- **Batch questions.** Accumulate the question queue during extraction, then ask once per section (or at end of pass) via a single elicitation form with typed inputs:
  - conflict → titled single-select enum with "Other" free text
  - date → `format: date`
  - yes/no → boolean
  - amount → number
  - free text → string

  This fits the MCP flat-primitive limit. Repeating-group questions ("add the missing 3rd vehicle") need either a multi-step flow or a custom app UI outside elicitation.
- **When to use `ask_user` instead:** for a single blocking question that changes the plan (e.g., "Which of these two policies is this submission for?"), ask immediately before extracting further.
- **Ask in the app UI, not only in chat.** Because the app owns the UI, `onElicitationRequest` can render a native form panel next to the fill-state table, with each question linked to its field and its candidate sources. A user who declines or cancels sets status `needs_user` (deferred), not a failure, and the agent continues with other sections.
- **Resume:** answers are written via the same `set_field` path with `source: {type:'user', questionId}` and status `user_answered`. Since state lives outside the conversation, a resumed or compacted session (`resumeSession`) re-reads fill state through `get_fill_state` and continues.

### Gaps
- Whether the Copilot SDK's `requestedSchema` is enforced to exactly the MCP subset, and how elicitation renders in hosts other than your own UI, is not documented beyond the README.
- No study found comparing batched-form vs one-at-a-time clarification for user burden or accuracy in form-filling.

---

## 6. Agent loop design on the Copilot SDK (planner → section extractors → verifier → question-asker → renderer)

### Takeaway
Use a **workflow-shaped agent**: deterministic code orchestrates phases (ingest, plan, extract per section, verify, ask, render), and LLM agents work *within* phases using a small set of tools against an external **fill-state store**. The Copilot SDK provides the primitives: custom tools, custom sub-agents with scoped tools and per-agent model, fleet mode for parallel sub-agents, hooks, streaming events, session resume, and compaction.

### Cited Findings
- Anthropic separates *workflows* (predefined code paths) from *agents* (LLM-directed). Relevant patterns: prompt chaining, routing, parallelization (sectioning/voting), orchestrator-workers, evaluator-optimizer. It advises starting simple and understanding framework internals. — [Anthropic: Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)
- **Multi-agent guidance from Anthropic:**
  - Sub-agents should write outputs to external storage and pass lightweight references back, avoiding a "game of telephone" and token overhead.
  - Parallel sub-agents (3–5) plus parallel tool calls cut research time by up to 90%.
  - Multi-agent systems use ~15× the tokens of chat (agents ~4×).
  - Poor fits are tasks needing shared context or with many inter-agent dependencies.
  - Source: [Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- **Copilot SDK custom agents:**
  - Fields: `name`, `prompt`, `description`, `tools` (omit = all tools), `mcpServers`, `infer` (auto-selection, default true), `skills`, **`model`** and `reasoningEffort` per agent.
  - The parent can pre-select with `agent` or `session.rpc.agent.select()`.
  - Events: `subagent.selected/started/completed/failed/deselected` with `agentId` on the envelope.
  - Skills are not inherited, and omitting `tools` grants everything.
  - The SDK is in **public preview**.
  - Source: [Copilot SDK: Custom agents](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents)
- **Copilot SDK fleet mode** (experimental):
  - `session.rpc.fleet.start({prompt})` dispatches parallel sub-agents via the `task` tool, coordinated through SQL `todos`/`todo_deps` tables (pending → in_progress → done/blocked).
  - Guidance: batch several workers, avoid overlapping scopes, keep parent verification.
  - Sub-agents are stateless across calls, so each worker prompt needs full context.
  - Source: [Copilot SDK: Fleet mode](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/fleet-mode)
- **Copilot SDK runtime features:**
  - Streaming events: `assistant.message_delta`, `tool.execution_start/complete`, `session.idle`.
  - Sessions: `createSession`, `resumeSession`, `listSessions`.
  - Infinite sessions with background compaction (thresholds e.g. 0.8/0.95) and a workspace with `plan.md`, `checkpoints/`, `files/`.
  - Hooks: `onPreToolUse` (allow/deny/ask, `modifiedArgs`), `onPostToolUse`, `onAgentStop` (can `block` with reason), `onSubagentStart/Stop`, `onErrorOccurred` (retry/skip/abort).
  - `systemMessage` modes `append`/`customize`/`replace` by section. `ToolInvocation` carries `traceparent`.
  - BYOK `ProviderConfig` for openai/azure/anthropic.
  - Source: [Copilot SDK Node README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- The SDK feature list also includes context clearing, steering and queueing, session limits (soft AI-credit budget), and usage/billing metrics (tokens, context usage, credit cost). — [Copilot SDK: Features](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features)
- Hebbia's Matrix (a legal/finance document tool) uses a grid: rows are documents, columns are questions, each cell a cited answer, with tasks decomposed into single steps handled by agents. This comes from secondary or marketing sources only. — [V7 Labs overview (secondary)](https://www.v7labs.com/blog/hebbia-alternatives)

### Inferences
- **Recommended architecture:** an orchestrator in code plus LLM workers per phase.
  1. **Ingest (no LLM, or a cheap LLM):** parse each file to page-level text with offsets (and optional word boxes). Hash files and cache parse results. Build the FTS5 (+vec) index. Generate a document catalog entry (type, date, parties, 1–2 line summary) with a small model.
  2. **Plan / route (one LLM call per section, or one for all):** map template sections to candidate documents using the catalog. Persist the plan to fill state (`section.candidateDocs`).
  3. **Extract (parallel per section):** one Copilot SDK custom agent per section type (`extractor`) with `tools: [search_documents, read_document_section, get_fill_state, set_field, add_row, mark_missing, flag_conflict]`, its own `model` (cheaper/faster), and a prompt carrying the section's field specs.
     - Run sections in parallel via fleet mode or several sessions.
     - Workers write to fill state directly (the artifact pattern) and return only a short summary.
  4. **Verify:** deterministic checks first (Zod, quote verification, cross-field rules, conflict detection). Then a `verifier` agent (a different prompt or model) on fields flagged high-stakes, conflicting or unverifiable, re-reading the cited spans and confirming or refuting them.
  5. **Ask:** code collects all `needs_user` fields into one elicitation form per section (or a single global form). Answers are written back, and only dependent sections are re-run.
  6. **Narrative:** after atomic fields stabilize, a `writer` agent drafts narrative sections from verified fields plus selected quotes (§7).
  7. **Render:** fill the template (DOCX/HTML) from fill state, with provenance footnotes or an appendix and a sidecar JSON.
- **Fill-state JSON** is the single source of truth, shared by tools and UI, persisted in SQLite. Example:
  ```json
  {
    "templateId": "intake-v3",
    "fields": {
      "insured.name": {
        "value": "Acme Corp", "raw": "ACME CORPORATION",
        "status": "verified",
        "sources": [{"type":"document","docId":"D12","page":1,"quote":"ACME CORPORATION","charStart":120,"charEnd":136}],
        "confidence": {"selfReported":0.9,"agreement":true,"quoteVerified":true},
        "history": [{"by":"agent:extractor","at":"…","op":"set"}]
      }
    },
    "groups": {"vehicles": {"rows": {"VIN:1HG…": {"fields": {…}}}}},
    "questions": [{"id":"q7","fieldId":"policy.effective_date","type":"date","status":"open"}],
    "plan": {"sections": {"insured": {"candidateDocs":["D12","D3"],"status":"done"}}}
  }
  ```
  - `set_field` is **idempotent**: same value plus source is a no-op; a different value creates a conflict candidate rather than overwriting a `verified` or `user_answered` value.
  - User edits lock fields (`approved`/`user_answered`), and the agent cannot overwrite them. Enforce this in the tool handler, and/or with `onPreToolUse` returning `deny`.
- **Hooks as guardrails:**
  - `onAgentStop` can `block` with a reason if required fields remain `empty` without `mark_missing` (forces search diligence).
  - `onPreToolUse` can enforce locks.
  - `onPostToolUse` can stream fill-state diffs to the UI.
- **Use `systemMessage: {mode:'customize'}`** to replace the coding-oriented identity and guideline sections with extraction instructions while keeping safety sections. Avoid `replace`, which drops SDK guardrails.
- **Disable built-in coding tools the agent does not need** (shell, file edit) via `excludedTools` or per-agent `tools` lists, for least privilege. Explicit `tools` lists are needed because omission grants all.
- **Human-in-the-loop UX:**
  - A field table grouped by section, with status chips (verified / conflict / missing / needs user / approved).
  - Click a field to open the source page with the span highlighted.
  - Inline edit, which sets source to `user`.
  - "Approve section" bulk action.
  - A diff view per re-run (old → new value plus new source).
  - A question panel bound to elicitation.

  This is derived from the provenance and status design above plus vendor review patterns ([Extend thresholds](https://docs.extend.ai/product/extraction/confidence-scores); [LangExtract HTML review](https://github.com/google/langextract)).
- **Where multi-agent is not worth it:** small templates (<30 fields) or few documents. A single session with section-by-section prompting is cheaper (multi-agent ≈ 15× chat tokens).

### Gaps
- Fleet mode's concurrency limits and cost behaviour are undocumented.
- Whether fleet workers can be restricted to a specific custom agent type from the SDK (vs plugin-registered `task(agent_type=…)`) is unclear.
- Whether Copilot SDK sessions expose prompt-caching controls or cache-hit metrics was not found.

---

## 7. Narrative sections vs atomic fields

### Takeaway
Treat narrative paragraphs (summaries, descriptions of loss, risk narratives) as a **separate, later generation step**. Ground them on verified atomic fields plus selected evidence quotes, using an "attribute first, then generate" or plan-then-write approach with sentence-level citations, and route them through user review as a block rather than per-field confidence.

### Cited Findings
- "Attribute First, then Generate" decomposes generation into content selection, sentence planning and sequential sentence generation. Selected spans serve as per-sentence attributions; citations are more concise, quality is comparable, and verification time is reduced. — [arXiv 2403.17104](https://arxiv.org/abs/2403.17104)
- The Anthropic Citations API returns sentence-level `char_location`/`page_location` citations for prose answers, cheaply (`cited_text` free of output tokens), but cannot be combined with structured outputs. — [Claude Citations docs](https://platform.claude.com/docs/en/build-with-claude/citations)
- The Copilot SDK exposes provider citations for the final assistant message, with spans into response text and source locations. — [Copilot SDK: Citations](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/citations)
- ExtractBench uses LLM-judged semantic equivalence for free-text fields, rather than exact match. — [ExtractBench](https://arxiv.org/html/2602.12247)

### Inferences
- **Pipeline for each narrative field:**
  1. Run `collect_evidence(narrativeFieldId)`: the agent selects 5–20 quotes or field refs into fill state (content selection).
  2. Produce an outline (sentence plan).
  3. Generate text in which each sentence carries `[[F:insured.name]]` field refs or `[[Q:D12:p4:120-180]]` quote refs.
  4. Check every ref exists and every number or date in the text matches a referenced field (deterministic regex comparison).
  5. Show the user a rendered paragraph with hover-to-source.
- **Generate narratives from fill state, not raw documents,** so later user corrections to atomic fields can trigger regeneration and keep the narrative consistent. Mark narrative status `stale` when a referenced field changes.
- **Alternative inside the Copilot SDK:** have the writer agent produce the narrative as its final assistant message with `enableCitations: true` and `citableSources` from evidence tools, then map provider citations to stored provenance. This depends on provider support; keep the explicit-ref method as the fallback.

### Gaps
- No benchmark specific to grounded narrative generation within form filling was found.

---

## 8. Evaluation (golden datasets, field-level metrics, regression testing, tracing in Node)

### Takeaway
Build a golden set of document bundles mapped to expected filled templates, each with per-field metric declarations. Score validity, field accuracy, provenance accuracy and question quality separately. Run it as a regression suite in CI (promptfoo, or Langfuse datasets and experiments) and trace production runs with OpenTelemetry. Start small (~20 cases) and grow.

### Cited Findings
- **ExtractBench methodology:**
  - Each schema field declares its metric: exact, case-insensitive, Levenshtein (0.8 threshold), numeric tolerance, boolean, or LLM-judged semantic (0.7 pass).
  - Arrays of objects are aligned semantically and scored with precision/recall/F1.
  - present / null / missing are kept distinct so omissions are separable from hallucinations.
  - Validity is tracked separately from accuracy (90% valid but 12.5% pass on one domain).
  - Source: [ExtractBench](https://arxiv.org/html/2602.12247)
- Anthropic began agent evals with ~20 queries from real usage, because early prompt changes have large effects. A single LLM-judge call with a rubric (factual accuracy, citation accuracy, completeness, source quality, tool efficiency) giving 0.0–1.0 plus pass/fail aligned best with humans. — [Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- Anthropic recommends evaluation-driven tool development: realistic multi-step tasks with verifiable outcomes, agents analyzing transcripts, and held-out test sets. — [Anthropic: Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- **promptfoo:**
  - `javascript` assertions receive output plus context (test vars, provider metadata, and OpenTelemetry trace data when tracing is enabled).
  - The Node API exposes programmatic assertions. — [promptfoo JS assertions](https://promptfoo.dev/docs/configuration/expected-outputs/javascript)
  - promptfoo acts as an OTLP receiver and passes W3C `traceparent` to custom providers. — [promptfoo tracing](https://promptfoo.dev/docs/tracing/)
  - **OpenAI announced its acquisition of Promptfoo on Mar 9, 2026.** The founders said it stays open source and multi-provider. — [OpenAI announcement](https://openai.com/blog/openai-to-acquire-promptfoo); [SDxCentral](https://www.sdxcentral.com/news/openai-acquires-ai-testing-firm-to-beef-up-agentic-security/)
- **Langfuse:**
  - Supports OpenTelemetry in Node via `@opentelemetry/sdk-node` plus `LangfuseSpanProcessor` from `@langfuse/otel`.
  - Offers a promptfoo migration path: tests become dataset items, assertions become code evaluators, CI gates become experiment scripts. — [Langfuse: migrate from promptfoo](https://langfuse.com/resources/engineering/migrate-from-promptfoo.md)
  - **ClickHouse acquired Langfuse (announced Jan 16, 2026)** and plans to keep it open source. — [ClickHouse blog](https://clickhouse.com/blog/clickhouse-acquires-langfuse-open-source-llm-observability)
- Copilot SDK tool handlers receive a `ToolInvocation` with `traceparent`/`tracestate` for distributed tracing. The SDK docs include an Observability section. — [Copilot SDK Node README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [Copilot SDK docs index](https://docs.github.com/en/copilot/how-tos/copilot-sdk)

### Inferences
- **Golden dataset design:**
  - 20–50 realistic bundles (anonymized), each with: documents; the expected fill (values plus acceptable alternates); expected source doc/page per field; the list of fields that *should* trigger a question (truly missing or conflicting); and scripted user answers for simulated runs.
  - Include adversarial bundles: conflicting versions, scanned pages, values only in tables, near-duplicate documents (distractors).
- **Metrics:**
  1. Field accuracy by metric type (exact / normalized / numeric tolerance / semantic judge), with present/null/missing kept distinct.
  2. Row-level P/R/F1 for repeating groups (align by `rowKey`).
  3. Provenance accuracy: the quote verifies, *and* the cited doc/page matches the gold source or a judge confirms support.
  4. Question precision/recall: asked about truly missing or conflicting fields vs unnecessary questions.
  5. Hallucination rate: a value set where gold is null.
  6. Cost, latency and tool calls per bundle.
- **Harness:** run the real agent loop headless, with a simulated user answering elicitation from the scripted answers, and score the final fill state. Use promptfoo with a custom JS provider wrapping the Copilot SDK session (or Vitest plus a custom scorer). Gate CI on per-section accuracy regressions.
- **Tracing:** export OTel spans per session, sub-agent and tool call (`traceparent` from `ToolInvocation`) to a local or self-hosted Langfuse for debugging. In a desktop app, make telemetry opt-in and redact document text.

### Gaps
- Braintrust's current Node/OTel support was not researched.
- No public golden dataset for multi-document intake form filling was found. DocILE/CORD are single-document invoice/receipt datasets; ExtractBench is single-document.

---

## 9. Cost and latency management

### Takeaway
The biggest levers:
- parse once and cache by content hash
- retrieve narrowly instead of stuffing
- small per-section contexts that run in parallel
- cheaper models for routing, cataloging and per-section extraction; stronger models for verification, conflict resolution and narratives
- prompt caching of stable prefixes (template spec, document catalog)
- strict tool-output size limits

Multi-agent parallelism buys latency at a token cost.

### Cited Findings
- With prompt caching, contextualizing chunks cost ~$1.02 per million document tokens. Prompt caching can cut costs by up to 90% and latency by more than 2×. — [Anthropic: Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)
- Anthropic Citations: `cited_text` does not count toward output tokens, and source documents can be cached with `cache_control`. — [Claude Citations docs](https://platform.claude.com/docs/en/build-with-claude/citations)
- Multi-agent ≈ 15× chat tokens; parallel sub-agents and tools cut time by up to 90% on complex queries. — [Anthropic: multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)
- Concise tool response formats used ~1/3 of the tokens of detailed ones. Claude Code caps tool responses at 25k tokens. — [Anthropic: Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)
- Copilot SDK custom agents accept a per-agent `model` and `reasoningEffort`. — [Copilot SDK: Custom agents](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents)
- The SDK offers session limits (a soft AI-credit budget) and usage metrics (tokens, context usage, credit cost, quota). — [Copilot SDK: Features](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features)
- Tools can be lazily loaded (`defer: "auto"`) via tool search. Infinite sessions compact in the background. — [Copilot SDK Node README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- LlamaIndex: agentic file search averaged ~11.2s vs ~7.4s for RAG per question on its small test. RAG scaled better in latency as the corpus grew. — [LlamaIndex blog](https://www.llamaindex.ai/blog/did-filesystem-tools-kill-vector-search)
- Unstract's dual-LLM verification adds ~2–5s per extraction (vendor claim). — [Unstract LLMChallenge](https://unstract.com/llmchallenge/)

### Inferences
- **Ingest cache:** key by `sha256(file bytes) + parserVersion`. Store page text, offsets, the catalog entry and embeddings in SQLite. Re-ingesting unchanged files costs nothing, and adding one file only indexes that file.
- **Stable prompt prefixes:** put the template spec for a section plus the document catalog first, identically across calls, to maximize provider prefix caching. The Copilot SDK runtime controls request assembly, so verify the actual cache hit rate via the usage metrics.
- **Model tiering:**
  - small/fast: catalog summaries, per-section extraction of simple fields, and retrieval-query generation
  - frontier: verifier passes, conflict adjudication, narrative writing, and complex tables
- **Bound tool outputs:**
  - `search_documents` returns top-k snippets (~200 chars each with docId/page), not full chunks.
  - `read_document_section` paginates (e.g., ≤4–8 pages or ~8–15k tokens per call) with a `next` cursor.
- **Re-run incrementally:** when a user answers or uploads a new doc, re-run only the affected sections, using the dependency map from the plan plus fields referencing the new doc's catalog type.
- **Budget guardrails:** set Copilot SDK session limits per fill job, and show per-job cost from usage events in the UI.

### Gaps
- Copilot SDK pricing per model and how BYOK changes billing were not researched here; they may be covered by another researcher.
- No data was found on prompt-cache behaviour inside Copilot SDK sessions.
