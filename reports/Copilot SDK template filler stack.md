# Build Schema-Driven Template Filling on Electron

Build the product as an **Electron 44 desktop app (moving to 45 after it ships on 2026-10-20)**. Electron embeds Node 24.21. Host the **GitHub Copilot SDK 1.0.19 in a dedicated `utilityProcess`**, locked to `mode: "empty"` and to tools the app defines itself. Parse documents locally into a SQLite full-text index that records page- and block-level provenance. Fill **Word templates with docxtemplater**, driven by a **JSON Schema contract that the rest of the app is generated from**. The UI should be React 19.3, Tailwind 4.3 and shadcn/ui on Radix. Render the chat with the AI SDK v7 `useChat` hook over a custom IPC transport and AI Elements components, but make a field-by-field fill-state table the centre of the screen, not the chat.

The Copilot SDK is worth using because it supplies a production agent loop: context compaction, sub-agents, hooks, permissions and a form-based `ask_user`. It also bills inference to each user's own Copilot plan in AI Credits, and BYOK (bring your own key) covers users without a seat. It has three costs. It ships a native runtime of roughly 130 MB per platform. Its coding-agent defaults have to be stripped out. And many of its useful APIs are still preview or experimental and change between patch releases.

The most important design choice is not a library. Make the template schema plus an app-owned fill-state store the system of record. Then the agent writes one validated, quote-checked field at a time. Follow-up questions come from gaps the app can observe, not from the model's own confidence. Preview and rendering are produced directly from that state.

The largest open risks are:
- getting the Copilot runtime's binaries through Apple notarization;
- the license of that bundled runtime, which nobody has read yet;
- docxtemplater's per-"instance" licensing when the app is installed on many desktops;
- whether customers will accept their documents passing through Copilot under their own GitHub terms.

## The recommended stack in one table

Every version below was current on the npm registry or official sources on 2026-10-11. The sections that follow give the reasoning and the citations.

| Layer | Recommendation | Why this one |
|---|---|---|
| Runtime | Node 24 LTS, as embedded by Electron (24.21.0) | Hard requirement; Node 24 is supported until 2028-04-30 |
| Desktop shell | **Electron 44.7.x → 45.x** | A real Node host for an SDK that only runs on Node; the shell most AI desktop apps use |
| Dev build / packaging | **electron-vite 5** (Vite 7) + **electron-builder 26.15 / electron-updater 6.8** | Hot reload for all three processes; automatic unpacking of native files; private update feeds |
| Process model | Thin main process; **agent `utilityProcess`**; pool of ingest `utilityProcess`es; sandboxed renderer | Isolates crashes and CPU load; tokens stream over MessagePorts without passing through main |
| IPC | Hand-written zod 4 contract plus a MessagePort event stream | The Electron-specific tRPC adapters have gone stale |
| UI | React 19.3, TypeScript (TS 7 checker), Tailwind 4.3, **shadcn/ui on Radix** | Mainstream stack; the AI component registries assume Radix |
| Chat | **AI SDK v7 `useChat` + custom `IpcChatTransport` + AI Elements + Streamdown 2.7** | Ready-made Tool, Confirmation, Sources and Inline Citation components; fallback is assistant-ui |
| State / polish | Zustand 5, TanStack Query 5 / Router / Virtual, Motion 14, cmdk, sonner, react-dropzone | Current, maintained libraries |
| Agent | **`@github/copilot-sdk` pinned to an exact version**, `mode: "empty"`, custom tools plus the built-in `ask_user` (elicitation variant) | Production agent loop that bills to the user's Copilot plan |
| Auth | "Sign in with GitHub" (your own OAuth flow → `gitHubTokenProvider`) **and** "Use your own key" (BYOK) | Covers users with Copilot seats and users without them |
| Ingestion | unpdf (PDF.js), mammoth + turndown, SheetJS CE 0.20.3 (from the CDN, not npm), officeParser, PostalMime / msgreader, tesseract.js 7 | Permissive licenses, fully local |
| Escalation | Copilot vision on rendered page images; opt-in Mistral OCR 4.1 or Azure DI Layout; optional downloadable Docling | Pay only for pages that need it |
| Retrieval | SQLite FTS5 (BM25 ranking) first; optional sqlite-vec + EmbeddingGemma-300m, merged with RRF (reciprocal rank fusion) | One file per project; template fields are mostly keyword-anchored |
| Storage | `node:sqlite` (fallback better-sqlite3 13); content-addressed files under `userData`; `safeStorage` for secrets | No native rebuilds; tokens encrypted by the OS keychain |
| Templates | **docxtemplater 3.71 core** + angular-expressions + InspectModule; **JSON Schema 2020-12 with `x-agent` / `x-render` extensions** | MIT core; the tag-inspection tool is free; one schema drives everything |
| Output | DOCX natively; PDF via LibreOffice headless (detected on the machine or offered as an optional download), **or** HTML + `printToPDF` if PDF is the only deliverable | No free pure-JS DOCX→PDF converter has high fidelity |
| Preview / review | docx-preview (fast) plus a PDF tab (accurate); RJSF or JSON Forms review form validated with ajv | Field values are edited in a form, not in a document editor |
| Signing | Apple Developer ID + notarization; **Azure Artifact Signing** ($9.99/month) on Windows | Required for auto-update and for `safeStorage` on macOS |
| Test / eval | Vitest 5, Playwright 1.64 `_electron`, golden document bundles in promptfoo or Langfuse, OpenTelemetry | Per-field metrics, gated in CI |
| Repo | pnpm workspaces + Turborepo: `apps/desktop`, `packages/{ipc-contract, agent-core, doc-engine, ui}` | `agent-core` is testable in plain Node 24 |

The runtime topology looks like this:

```
main process        windows, app:// protocol, OAuth + safeStorage, auto-updater, MessagePort broker
 ├─ renderer        React UI, sandboxed + context-isolated; talks to workers over MessagePorts
 ├─ agent worker    utilityProcess: CopilotClient, custom tools, question queue, orchestrator
 │   └─ copilot-runtime   grandchild process the SDK spawns and drives over stdio (JSON-RPC)
 └─ ingest workers  utilityProcess pool: parsers, OCR, page rendering, indexing
state on disk       userData/projects/<id>/project.db   (documents, blocks + FTS5, fill state, questions)
                    userData/projects/<id>/files/<sha256>.<ext>, outputs/, page thumbnails
```

## Electron wins because the Copilot runtime cancels Tauri's size advantage

### Every supported Electron line already ships Node 24

The Copilot SDK declares `engines: ^20.19.0 || >=22.12.0`, spawns child processes, and depends on koffi, a native FFI library ([copilot-sdk package.json](https://github.com/github/copilot-sdk/blob/main/nodejs/package.json)). The shell therefore has to host a real Node runtime. Electron does:

- Electron 40 was the first line on Node 24 ([Electron 40 release](https://www.electronjs.org/blog/electron-40-0)).
- Electron 44.0.0 shipped on 2026-08-25 with **Node 24.18.1 and Chromium 152** ([Electron 44 release](https://www.electronjs.org/blog/electron-44-0)).
- The current `latest` tag is 44.7.0 ([npm electron](https://www.npmjs.com/package/electron)). In the research team's local test, that binary reported Node 24.21.0 ([Electron v44.7.0](https://github.com/electron/electron/releases/tag/v44.7.0)).
- Electron 45 is due on 2026-10-20 with Chromium 156 and Node 24.21.0. Electron 46 is estimated to stay on Node 24 ([Electron release schedule](https://releases.electronjs.org/schedule)).

Node 24 moves to maintenance LTS on 2026-10-20 but stays supported until **2028-04-30** ([Node.js release schedule](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)), so the Node 24 requirement holds for the product's foreseeable life. Electron 44 sets two platform floors: **macOS 13 or later**, and no 32-bit Windows or Linux armv7l builds. It also removed the `clipboard` module from renderers ([Electron 44 release](https://www.electronjs.org/blog/electron-44-0)).

The alternatives lose on this workload.

- **Tauri 2** can only run Node as a sidecar process ([Tauri: Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/)). The usual `pkg`-compiled sidecar breaks SDKs that find their native binaries relative to their own JS files ([Recall.ai integration notes](https://docs.recall.ai/docs/integrating-with-non-electron-apps)), and the Copilot SDK does exactly that when it unpacks `runtime.node` from its platform package. Tauri's size advantage (community benchmarks put a hello-world at about 3 MB vs 85 MB ([Tech Insider](https://tech-insider.org/tauri-vs-electron-2026/))) disappears once every installer must carry a **127–142 MB Copilot runtime per platform** ([npm @github/copilot-sdk](https://www.npmjs.com/package/@github/copilot-sdk)) plus a Node binary. The team would also take on Rust, a sidecar lifecycle and three different OS WebViews.
- **Electrobun** does not use Node as its default runtime and names no production users ([Electrobun docs](https://framework.blackboard.sh/electrobun/)).

The apps this product will be compared against are Electron apps: Claude desktop, OpenAI's Codex app, Cursor, Linear and Notion ([dbreunig](https://www.dbreunig.com/2026/02/21/why-is-claude-an-electron-app.html); [Simon Willison](https://simonwillison.net/2026/Feb/2/introducing-the-codex-app/); [CodeNote audit](https://codenote.net/en/posts/famous-electron-apps-2026-research/)). The trade-off you accept is about 100 MB of Chromium and noticeably higher idle memory, in return for one TypeScript codebase and identical rendering on every OS.

### Put the agent in a utilityProcess, not the main process

The research notes disagree here. The Copilot SDK notes say the SDK may run "in the Electron main process or a Node utility process," and one sketch put the tools in main "to keep file access under app control." The desktop notes put the SDK in a `utilityProcess`. **Choose the utilityProcess**, for four reasons.

1. **It is verified to work.** `utilityProcess.fork` creates a Node-enabled child process that exchanges MessagePorts with main ([Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)). The research team's local test confirmed that an ESM utilityProcess entry in Electron 44.7.0 can use `child_process` and `node:sqlite` ([Electron v44.7.0](https://github.com/electron/electron/releases/tag/v44.7.0)). That is all the SDK's default stdio transport needs to spawn its runtime.
2. **The tool handlers are heavy.** They run synchronous SQLite queries (`node:sqlite` exposes only synchronous APIs ([Node v24 sqlite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html))), match quotes against source text and render page images. On main, that work would freeze window management, menus and IPC routing.
3. **Failures are contained.** If the agent or its runtime crashes or hangs, the app sees it through `child-process-gone`, restarts the worker, and resumes sessions from disk ([session persistence](https://github.com/github/copilot-sdk/blob/main/docs/features/session-persistence.md)).
4. **Streaming bypasses main.** A MessagePort lets token and tool events flow directly between renderer and worker.

The "app controls file access" goal is met just as well in the worker. What matters is that the app's own tool code touches files instead of the runtime's built-in tools, and that holds wherever the tool code runs. Main keeps the jobs that belong to it: windows, the `app://` protocol, the OAuth loopback, `safeStorage` decryption and the updater. It hands the worker app-owned paths and short-lived tokens when asked.

### electron-vite plus electron-builder beats Forge for a closed-source app

electron-vite 5 gives you one config with main, preload and renderer sections, hot module replacement in the renderer, hot reload for main and preload, and an isolated build mode for sandboxed preloads ([electron-vite guide](https://electron-vite.org/guide/)). Stable 5.0.0 supports Vite 5–7; Vite 8 is only in the 6.0 beta ([npm electron-vite](https://www.npmjs.com/package/electron-vite)). Pair it with electron-builder 26.15.3 and electron-updater 6.8.9 ([npm electron-builder](https://www.npmjs.com/package/electron-builder)) for NSIS, DMG and AppImage targets, Azure signing, private update feeds and automatic unpacking of native modules.

Electron Forge 8.0.1 is the first-party alternative. It is an ESM rewrite on Vite 8 with updated notarization tooling, and Electron's own signing docs call Forge "the recommended route" ([Forge releases](https://github.com/electron/forge/releases); [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)). Choose Forge if first-party tooling matters more to you than two drawbacks. First, Forge 7.11 labelled its Vite plugin experimental, and the v8 notes don't say that changed. Second, the free update.electronjs.org service only works with **public** repositories ([update.electronjs.org](https://github.com/electron/update.electronjs.org)).

Two smaller tooling choices:

- **TypeScript.** Use TypeScript 7's native compiler for fast type checking ([InfoQ](https://infoq.com/news/2026/08/typescript-7-released/)). Stick to erasable syntax (no enums or parameter properties) so Node 24's stable type stripping can run scripts and tests without a build step ([Node v24 TypeScript](https://nodejs.org/docs/latest-v24.x/api/typescript.html)).
- **IPC.** The Electron tRPC adapters were last published in 2024 or early 2025 ([npm electron-trpc](https://www.npmjs.com/package/electron-trpc)). A hand-written zod contract with a discriminated-union event stream is the lower-risk choice.

### React, shadcn and AI Elements, with the chat as a side pane

The mainstream web stack is current: React 19.3.0, Tailwind CSS 4.3.3, Vite 8.3 and shadcn CLI 4.21 ([npm react](https://www.npmjs.com/package/react); [npm tailwindcss](https://www.npmjs.com/package/tailwindcss); [npm shadcn](https://www.npmjs.com/package/shadcn)). shadcn now also offers Base UI as its component foundation, but stay on Radix, because AI Elements reportedly has type errors on Base UI ([skills.sh shadcn notes](https://skills.sh/vercel/vercel-plugin/shadcn)).

**For the chat, choose AI SDK UI v7 with AI Elements, and keep assistant-ui as the fallback.** The reasons:

- `useChat` accepts a custom `ChatTransport` whose `sendMessages()` returns a stream of UI message chunks, so no HTTP route is needed ([AI SDK v7 transport docs](https://ai-sdk.dev/v7/docs/ai-sdk-ui/transport)). A third-party package already ships a transport with no HTTP involved ([built-in-ai.dev](https://www.built-in-ai.dev/docs/ai-sdk-v7/core/usechat-integration)).
- AI Elements is a shadcn component registry that includes Conversation, Prompt Input, Attachments, Tool, Confirmation, Plan, Sources and Inline Citation ([AI Elements](https://elements.ai-sdk.dev/)). That is close to exactly what this app needs, and the shadcn CLI copies the components into your repo, so you own them.
- assistant-ui's `ExternalStoreRuntime` is a clean match for "the app owns the state" ([assistant-ui external store](https://www.assistant-ui.com/docs/runtimes/custom/external-store)). But it is still pre-1.0 (0.15.27), and several of its APIs are prefixed `unstable_` ([npm @assistant-ui/react](https://www.npmjs.com/package/@assistant-ui/react)).

The deciding factor is that the chat is a secondary pane here. The primary state is the fill-state store, which reaches the renderer as worker events in a Zustand store. Only one thin module, which translates Copilot session events into `UIMessageChunk`s, depends on the chat library. If that translation fights the Copilot event model, swapping in assistant-ui is cheap. One thing is unconfirmed: whether AI Elements works without `useChat`. CopilotKit is ruled out because it needs an AG-UI agent runtime ([CopilotKit docs](https://docs.copilotkit.ai/custom-look-and-feel)).

Render markdown with Streamdown 2.7, which repairs unterminated bold, code fences and links while text is still streaming. Don't use react-markdown, which has not been published since March 2025 ([npm streamdown](https://www.npmjs.com/package/streamdown); [npm react-markdown](https://www.npmjs.com/package/react-markdown)).

Lay the main window out in three panes:
- **Sources:** the document list, plus a page viewer that highlights the cited span.
- **Fill state:** fields grouped by template section, with status chips (verified, conflict, missing, needs user, approved), inline editing and "approve section."
- **Chat and questions.**

A Preview tab shows the rendered document.

Supporting libraries and window styling:
- Zustand 5 holds UI and session state. TanStack Query 5 wraps request/response IPC. TanStack Router uses hash history, since there is no server. Add Motion 14, cmdk for a ⌘K palette, sonner for toasts, and react-dropzone plus TanStack Virtual for file lists in the thousands ([npm zustand](https://www.npmjs.com/package/zustand); [npm @tanstack/react-virtual](https://www.npmjs.com/package/@tanstack/react-virtual)).
- Electron 44 provides the native window chrome: macOS `hiddenInset` and `vibrancy`, Windows 11 `titleBarOverlay` with `backgroundMaterial: 'mica'`, and the new `windowStatePersistence` ([Electron BaseWindowOptions](https://www.electronjs.org/docs/latest/api/structures/base-window-options)).
- Dropped files are never read in the renderer. The preload calls `webUtils.getPathForFile` and sends paths to the ingest workers ([Electron webUtils](https://www.electronjs.org/docs/latest/api/web-utils)).

## Run the Copilot SDK as a locked-down, non-coding agent

### Pin it, wrap it, and strip out the coding persona

The SDK became generally available on 2026-06-02 and promises semver ([GA announcement](https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/); [README](https://github.com/github/copilot-sdk/blob/main/README.md)). It still moves fast:
- It went from 1.0.0 to **1.0.19 in four months** ([npm @github/copilot-sdk](https://www.npmjs.com/package/@github/copilot-sdk)).
- It changed the `onElicitationRequest` handler signature inside 1.x ([CHANGELOG](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)).
- Structured output is in preview. Citations, in-process hosting, `setTools`, skill providers, the login RPC and the usage-metrics RPCs are experimental ([Node SDK README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)).

So pin an exact version, ship the bundled runtime rather than relying on a Copilot CLI the user may have installed, and keep every SDK call inside `agent-core`. The SDK itself is a thin JSON-RPC client. The Copilot runtime runs the agent loop, where each iteration is one model call, until the session reports `session.idle` ([agent loop docs](https://github.com/github/copilot-sdk/blob/main/docs/features/agent-loop.md)).

By default a session exposes the CLI's built-in tools, "similar to running the CLI with `--allow-all`" ([README](https://github.com/github/copilot-sdk/blob/main/README.md)): shell, file edits, URL fetching. That is wrong for a document app. To lock it down:

- **Use `mode: "empty"`.** It turns off optional CLI behaviour (memory, built-in skills, the session store) and requires you to set `baseDirectory` and a per-session `availableTools` list. The docs warn that the default `copilot-cli` mode "can expose ambient host filesystem capabilities" ([multi-tenancy docs](https://github.com/github/copilot-sdk/blob/main/docs/setup/multi-tenancy.md)).
- **Allow only custom tools plus `ask_user`.** `ask_user` belongs to `BuiltInTools.Isolated`, which has no host filesystem access outside the session and no network ([toolSet.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/toolSet.ts)).
- **Reject `shell`, `write` and `url` in `onPermissionRequest`** as a second line of defence.
- **Replace the coding persona with `systemMessage: { mode: "customize" }`.** Replace the `identity` and `tone` sections and remove `code_change_rules`. Don't use `replace`, which "removes all guardrails" ([Node SDK README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)).
- **Pick models at runtime from `listModels()`**, which reports each model's capabilities, billing and policy. Availability varies by plan, org policy and BYOK; the docs themselves use IDs like `gpt-5.4` and `claude-sonnet-4.5`, plus an `auto` router with efficiency and intelligence tiers ([compatibility docs](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)).

The sketch below combines these documented options. It has not been run, and object shapes must be checked against the pinned version.

```ts
// packages/agent-core — runs inside the agent utilityProcess
const client = new CopilotClient({
  mode: "empty",                                         // no ambient CLI tools, memory or skills
  baseDirectory: join(userDataDir, "copilot"),           // COPILOT_HOME owned by the app, not ~/.copilot
  connection: RuntimeConnection.forStdio({ path: unpackedRuntimePath }), // signed binary in app.asar.unpacked
  useLoggedInUser: false,                                // never fall back to ambient gh/CLI credentials
});

const session = await client.createSession({
  model: pickModel(await client.listModels()),           // never hard-code model IDs
  streaming: true,
  availableTools: new ToolSet().addCustom("*").addBuiltIn(["ask_user"]),
  tools: [searchDocuments, readDocumentSection, getFillState, setField, addRow, markMissing, flagConflict],
  systemMessage: { mode: "customize", /* replace identity + tone, remove code_change_rules */ },
  askUserVariant: "elicitation",
  onElicitationRequest: (ctx) => questionQueue.fromAgent(ctx),   // resolves when the user answers in the UI
  onPermissionRequest: (req) => (["shell", "write", "url"].includes(req.kind) ? reject() : approveOnce()),
  onAgentStop: requireRequiredFieldsResolved,            // block "done" while required fields are empty
  onPreToolUse: enforceUserLocks,                        // deny overwrites of approved / user-answered fields
  sessionLimits: { maxAiCredits: 30 },                   // soft per-job budget
  gitHubTokenProvider: () => mainProcess.getCopilotToken(),      // or `provider: {...}` for BYOK
});
```

The notes also conflict on structured output. One thread says the Copilot SDK has no response-format channel. It does: a preview `responseSchema` option, and a typed `sendAndWait(prompt, zodSchema)` that validates the final JSON. The caveats are that it needs runtime support, API gateways may ignore it, and it is not saved as a session default ([Node SDK README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)).

Still, **do not use it to produce the filled template.** In the ExtractBench study, six frontier models produced valid JSON only **51%** of the time on realistic schemas, **0%** on a 369-key schema, and structured-output mode *lowered* validity to 37% ([ExtractBench](https://arxiv.org/html/2602.12247)). Use structured output only for small, fixed-shape calls such as per-document catalog entries, with a tool-based fallback.

### Two sign-in paths: Copilot seats where users have them, BYOK for everyone else

Without BYOK, each end user needs a GitHub account with Copilot access, and usage bills to that user's plan. Since 2026-06-01 that billing is in **AI Credits**, which replaced premium requests. Included amounts are **$10 for Pro, $39 for Pro+, $19 per Business user and $39 per Enterprise user**. "Fallback to a lower-cost model when limits are reached is no longer available" ([GitHub billing change](https://github.blog/changelog/2026/04/27/github-copilot-is-moving-to-usage-based-billing/)). BYOK skips GitHub auth entirely and needs no Copilot subscription ([authentication docs](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md)). The SDK docs list both paths for ISVs (independent software vendors) building products for customers ([choosing a setup path](https://github.com/github/copilot-sdk/blob/main/docs/setup/choosing-a-setup-path.md)).

| Mode | Who pays | Requirement | Implementation |
|---|---|---|---|
| Sign in with GitHub | The user's Copilot plan (AI Credits) | GitHub account + Copilot; Copilot Free covers "personal use" | Your own OAuth flow (device code, or browser loopback with PKCE) → `gitHubTokenProvider`; accepts `gho_`, `ghu_`, `github_pat_` tokens but **not classic `ghp_`** ([GitHub OAuth setup](https://github.com/github/copilot-sdk/blob/main/docs/setup/github-oauth.md)) |
| BYOK, user's key | The user's OpenAI / Anthropic / Azure account | An API key | Key stored with `safeStorage`; provider config passed again on every resume, because "API keys are never persisted" ([BYOK docs](https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md)) |
| BYOK, vendor proxy | You | Your proxy issuing short-lived bearer tokens | `bearerTokenProvider` + OpenAI-compatible `baseUrl`; never embed a vendor key in the app binary |
| BYOK, local model | No one | Ollama / Foundry Local | Offline or high-privacy mode ([BYOK docs](https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md)) |

The interactive `copilot login` device flow exists only in the CLI ([compatibility docs](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)). An experimental in-SDK login RPC (`accounts.login.begin/advance/cancel`, browser loopback with PKCE) could replace your own OAuth code later, at the cost of API churn ([generated rpc.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/generated/rpc.ts)).

For cost visibility:
- `usage.getMetrics`, `models.list` (which includes billing data) and `account.getQuota` expose usage, but several are experimental, and the docs say "never hard-code" prices ([usage and billing](https://github.com/github/copilot-sdk/blob/main/docs/features/usage-and-billing.md)).
- `sessionLimits.maxAiCredits` is a soft cap: a single response can overshoot it ([session limits](https://github.com/github/copilot-sdk/blob/main/docs/features/session-limits.md)).

Business and Enterprise users may have org policies that restrict tools and models. Those policies "compose restrictively," and `approveAll` throws when managed settings are enabled ([CHANGELOG](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)). Handle policy denials gracefully in the UI.

### One question queue, fed by two producers

The notes offer three ways to ask the user follow-up questions:
1. the SDK's legacy `onUserInputRequest` (`ask_user` with a question, optional choices and free text);
2. the newer `askUserVariant: "elicitation"` with `onElicitationRequest`, where the agent sends a JSON-Schema form and the UI returns accept, decline or cancel ([Node SDK README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md));
3. app-owned forms generated from the template schema, entirely outside the SDK.

**Combine them around a single app-owned question queue stored in SQLite.**

**Most questions should come from code, not the model.** After each section pass, the orchestrator turns every field in a `missing`, `conflict` or `unverifiable` state into a question record. It renders one batched form per section in a Questions panel beside the fill-state table. Each input is generated from the field's JSON Schema, and the candidate sources are shown next to it. The reason is that models are poor at noticing what is missing: QuestBench found models identify the single missing piece of information only about **40–50%** of the time ([QuestBench](https://arxiv.org/abs/2503.22674)). The schema, by contrast, already knows exactly which required fields are still empty.

**The SDK's elicitation tool is the second producer**, for blocking clarifications the agent raises mid-run, such as "which of these two policies is this submission for?":
- The `onElicitationRequest` handler in the agent worker turns `requestedSchema` into a question record in the same queue.
- The renderer shows it as an inline card in the chat (AI Elements Confirmation or Tool).
- The handler's Promise resolves when the user answers.
- Prefer elicitation over the legacy variant, because its typed enums, dates and booleans line up with the template's field types.

Both producers write answers through the same `set_field` path with `source: {type: "user", questionId}`, so provenance looks the same either way.

Two constraints shape the design:
- **Elicitation forms are flat.** They follow MCP's elicitation schema: flat objects with primitive properties only, no nested objects or arrays of objects, and never used for secrets ([MCP elicitation spec](https://modelcontextprotocol.io/specification/2025-11-25/client/elicitation)). Gaps in repeating groups ("add the missing third vehicle") therefore need a custom app form.
- **There is no documented timeout for a pending `ask_user`.** If the user walks away, the handler should resolve with `decline`, set the field to `needs_user` and let the agent continue. The question stays in the queue.

The host-initiated `session.ui.*` dialogs are unnecessary, because the app owns its UI. When the user answers an orchestrator question, write the answer straight into fill state, then either re-run the affected sections or tell the live session with `send({ prompt, source: "system" })`.

### Sessions, hooks and citations: what to trust, and what to keep in your own store

Sessions persist on disk and can be resumed. "Infinite sessions" compact the context in the background once it reaches 80% of the window ([Node SDK README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)). However, in-memory tool state is not persisted, BYOK keys must be supplied again on resume ([session persistence](https://github.com/github/copilot-sdk/blob/main/docs/features/session-persistence.md)), and nobody has documented how well compaction preserves facts across large document sets. **Treat the conversation as disposable and the SQLite fill state as durable.** Any resumed or compacted session re-reads the state through `get_fill_state`.

Hooks are the guardrails ([Node SDK README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)):
- `onAgentStop` can return `{decision: "block", reason}` to force another turn while required fields are empty and have no logged `mark_missing`. Watch `stopHookActive` to avoid loops.
- `onPreToolUse` can deny writes to fields the user has locked.
- `onPostToolUse` can stream fill-state changes to the UI.
- `onErrorOccurred` can retry, skip or abort.

The SDK's experimental citations work like this: tools return `citableSources`, and citations attach to the text of the final assistant message only, with coverage that depends on the model provider ([Copilot SDK citations](https://github.com/github/copilot-sdk/blob/main/docs/features/citations.md)). That is good for chat answers like "why did you pick this date?" It is not good enough for field provenance.

For images, attach PNG or JPEG page renders as `blob` attachments to vision-capable models. Oversized images are resized, or **skipped without warning** if they still don't fit. PDF "document" blocks are documented only for Anthropic providers with citations enabled ([image input docs](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/image-input); [Copilot SDK citations](https://github.com/github/copilot-sdk/blob/main/docs/features/citations.md)).

## Parse locally first and escalate only the pages that need it

### A permissively licensed Node pipeline covers born-digital files

Route each upload by magic bytes, then send it to a format-specific extractor running in an ingest worker:

| Format | Library | Notes |
|---|---|---|
| PDF | **unpdf** (MIT) | Bundles PDF.js 5.6. `extractTextItems` returns per-page items with x/y/width/height and font size. `renderPageAsImage` produces PNGs but needs `@napi-rs/canvas` in Node. It does no time-limiting itself: add timeouts and image-size caps for untrusted files ([unpdf](https://github.com/unjs/unpdf)). |
| DOCX | **mammoth** (BSD-2) → HTML → turndown | Mammoth's own Markdown output is deprecated ([mammoth.js](https://github.com/mwilliamson/mammoth.js)). |
| PPTX | **officeParser** (MIT) | Format-agnostic AST with slide numbers ([officeParser](https://github.com/harshankur/officeParser)). |
| XLSX / CSV | **SheetJS CE 0.20.3** | Install from SheetJS's CDN tarball: the npm `xlsx` package is stuck at 0.18.5, which SheetJS calls "a known registry bug" ([SheetJS Node install](https://docs.sheetjs.com/docs/getting-started/installation/nodejs)). |
| Email | **PostalMime** (.eml), **@kenjiuno/msgreader** (.msg) | mailparser is now maintenance-only and itself recommends PostalMime ([mailparser](https://github.com/nodemailer/mailparser); [msgreader](https://github.com/HiraokaHyperTools/msgreader)). |

Two newer engines with Rust cores are worth a timed evaluation:
- **LlamaIndex LiteParse** (Apache-2.0) parses PDFs with PDFium and returns bounding boxes and page screenshots. Office formats only work if LibreOffice is installed separately ([LiteParse](https://github.com/run-llama/liteparse)).
- **Kreuzberg** has frozen its v4 line as LTS and moved active development to "Xberg" ([Xberg v4.3.0](https://newreleases.io/project/github/xberg-io/xberg/release/v4.3.0)), so it is a moving target.

Avoid **mupdf.js** unless you buy a license: it is AGPL-3.0 or commercial ([mupdf.js](https://github.com/ArtifexSoftware/mupdf.js)).

The Python converters are tempting but expensive to ship:
- **Docling** is MIT-licensed and the most structurally rich. Its output carries page numbers and bounding boxes per element ([Docling](https://github.com/docling-project/docling)). But it depends on Python and PyTorch, and a PyInstaller bundle containing only torch was **about 4 GB** ([PyTorch forum](https://discuss.pytorch.org/t/pyinstaller-pytorch/185917)). Offer it only as an optional "high-fidelity engine" download: a local docling-serve instance on 127.0.0.1, called through the community `docling-sdk` TypeScript client ([docling-sdk](https://cdn.jsdelivr.net/npm/docling-sdk@2.0.6/README.md)).
- **MarkItDown** is too low-fidelity for citations, and its OCR is "silently skipped" when no LLM client is configured ([MarkItDown](https://github.com/microsoft/markitdown)).
- **Marker's** model weights need a paid license above $5M in revenue or funding ([Marker](https://github.com/datalab-to/marker)).

### OCR, vision models and cloud parsing form a cost ladder

A per-page quality gate decides which pages need more work. It flags pages with little text for their area, image-only pages, garbled text and pages with low-confidence table layouts. Flagged pages are rendered at about 150–200 DPI and go through local OCR with tesseract.js v7, which reads images, not PDFs ([tesseract.js 7.0.0](https://newreleases.io/project/npm/tesseract.js/release/7.0.0)).

Pages that are still poor, or heavy with tables, escalate to a vision-capable Copilot model as page images. Use that step sparingly, because it spends the user's AI Credits. In a receipt benchmark, a document vision model tied traditional OCR on character error rate while running **about 22× the cost and 24× the latency** ([imagetotable benchmark](https://imagetotable.ai/references/traditional-ocr-vs-document-parsing-vlm)).

For enterprises that allow cloud processing, add an **opt-in, per-workspace cloud parser**:
- **Mistral OCR 4.1** went GA on 2026-08-31 and returns paragraph-level bounding boxes and confidence scores ([Mistral changelog](https://docs.mistral.ai/getting-started/changelog/)). Secondary sources put it at **about $4 per 1,000 pages, or $2 in batch** ([implicator.ai](https://www.implicator.ai/mistral-ocr-4-ships-bounding-boxes-for-170-language-document-ai/)). Other reports cite $2 or €3.50, and Mistral's own pricing page shows no figure, so confirm before quoting.
- **Azure Document Intelligence Layout** runs at about $10 per 1,000 pages and offers disconnected containers for air-gapped sites ([ERP Research](https://erpresearch.com/erp-add-ons/ocr/azure-document-intelligence/pricing); [Azure DI pricing](https://azure.microsoft.com/en-us/pricing/details/ai-document-intelligence/)).
- **LlamaParse** charges $1.25 per 1,000 credits, at 1 to 45 credits per page depending on tier ([LlamaParse pricing](https://developers.llamaindex.ai/llamaparse/general/pricing/)).

For an optional GPU or Apple-Silicon tier, the commercially safe local models with top OmniDocBench scores are **PaddleOCR-VL-1.6** (Apache-2.0, 0.9B parameters, 96.3) and GLM-OCR (MIT) ([PaddleOCR-VL-1.6 card](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6/blob/main/README.md); [Roboflow](https://roboflow.com/blog/best-open-source-ocr-models)). Avoid Chandra, Marker's weights and the non-commercial jina-ocr-v1 ([jina-ocr-v1](https://jina.ai/models/jina-ocr-v1)).

### Provenance must survive down to the block

Every extractor writes into one normalized element model:

```
{docId, sha256, mime,
 pages: [{n, width, height, source: "text-layer" | "ocr" | "vlm" | "cloud"}],
 blocks: [{id, page, type, text, bbox (0–1, top-left origin), headingPath, confidence?}]}
```

Coordinates need normalizing because PDF.js uses a bottom-left origin ([unpdf](https://github.com/unjs/unpdf)). Formats without pages cite differently:
- DOCX: heading path plus paragraph index. Only rendering through LibreOffice gives true page numbers.
- Spreadsheets: sheet plus cell range.
- Slides: slide number.
- Email: message plus part.

When tools hand content to the model, wrap it in XML-style blocks carrying document and page attributes, with block anchors inside the Markdown content (for example `<doc id="D12" page="4">…[b:12]…</doc>`). OpenAI's long-context guide found XML-style delimiters worked well and JSON "performed particularly poorly" ([OpenAI GPT-4.1 guide](https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide)).

At scale, the pipeline should:
- cache by `sha256(bytes) + parserVersion`;
- run a fast text-layer pass first, so documents are searchable within seconds, and upgrade OCR'd pages in place later;
- parse large PDFs page by page;
- confine each worker with timeouts and memory watchdogs, observed through `child-process-gone` ([Electron utilityProcess](https://www.electronjs.org/docs/latest/api/utility-process)).

## Let code run the workflow while the agent fills one verified field at a time

### Front-load a catalog, search by keyword, then read whole sections

The evidence argues against putting the whole corpus in the prompt, even when it fits:
- Chroma tested 18 models and found reliability drops as input grows, with topically similar distractors compounding the errors ([Chroma: Context Rot](https://www.trychroma.com/research/context-rot)).
- On the NoLiMa benchmark, **11 of 13** long-context models fell below half their short-context score at just 32K tokens ([NoLiMa](https://arxiv.org/abs/2502.05167)).
- Anthropic recommends a hybrid: a small amount of high-signal context up front, with tools fetching more "just in time" ([Anthropic context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
- Cursor found that combining keyword search (grep) with semantic search raised answer accuracy by **12.5%** on average ([Cursor](https://cursor.com/blog/semsearch)).
- LlamaIndex found a filesystem-search agent more accurate than RAG (retrieval-augmented generation) on a small corpus (8.4 vs 6.4) but slower, with RAG winning on speed as the corpus grew ([LlamaIndex](https://www.llamaindex.ai/blog/did-filesystem-tools-kill-vector-search)).

The design that follows:
- **Up front:** give each extraction run the section's field specs plus a compact **document catalog** generated at ingest (type, date, parties, one-line summary).
- **Search:** let the agent search with BM25 keyword ranking first. Template fields such as policy numbers, dates and party names are anchored on keywords.
- **Read:** once the relevant one to five documents are found, read whole sections. On multi-hop questions, full context beat chunked retrieval **55.1 vs 34.6** exact match ([ChunkRank](https://arxiv.org/pdf/2609.29828)).

Keep retrieval in the project's SQLite file. FTS5 handles keyword search. sqlite-vec (pre-1.0, brute-force search) can add an optional vector leg with EmbeddingGemma-300m running locally through Transformers.js, merged with keyword results using reciprocal rank fusion in a single SQL query ([Simon Willison](https://simonwillison.net/2024/Oct/4/hybrid-full-text-search-and-vector-search-with-sqlite/); [sqlite-vec](https://github.com/asg017/sqlite-vec); [EmbeddingGemma ONNX](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX)). Prefixing each chunk with its document title, heading and page costs nothing locally. Anthropic's version of this, with model-written context, cut retrieval failures by **49%**, and by **67%** when reranking was added ([Anthropic Contextual Retrieval](https://www.anthropic.com/news/contextual-retrieval)). Add the vector leg only once evals show the keyword search missing things.

### Small, validated tool calls beat one giant JSON object

Deterministic code runs the phases: ingest, plan, per-section extraction, verify, ask, write narrative, render. Agents work inside each phase. This follows Anthropic's split between fixed workflows and open-ended agents ([Building effective agents](https://www.anthropic.com/engineering/building-effective-agents)).

For v1, run **one user-facing chat session plus headless per-section worker sessions** that the orchestrator creates with scoped tools and a cheaper model. Everything shares one fill-state store. The SDK's custom agents and fleet mode can replace the worker sessions later, but fleet mode is experimental and its concurrency limits are undocumented ([fleet mode](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/fleet-mode)). Multi-agent setups use about **15× the tokens of a chat** ([Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)), so use a single session for templates under about 30 fields.

| Tool | What it does | Guardrail enforced in the handler |
|---|---|---|
| `search_documents(query, docIds?, k)` | Top-k snippets (~200 characters) with docId, page and blockId; also returns `citableSources` | Bounded output; filter by catalog type |
| `read_document_section(docId, pages \| blocks, cursor)` | Page-marked content, paginated (about 4–8 pages or 8–15k tokens per call) | `next` cursor; caps tool output |
| `get_sheet_range(docId, sheet, range)` / `get_page_image(docId, page)` | Spreadsheet ranges; page image for vision checks | Image pre-sized under the model's limits |
| `get_fill_state(sectionId?)` / `get_template_spec(sectionId)` | Current values and statuses; field specs rendered from the schema | Read-only |
| `set_field({fieldId, value, raw, sources[], confidence, note})` | Writes one atomic value | ajv check against that field's sub-schema; normalization in code; **quote verification**; idempotent; refuses to overwrite locked fields |
| `add_row` / `update_row({groupId, rowKey, values, sources})` | Adds rows to repeating groups incrementally | Stable `rowKey` for merging and de-duplication |
| `mark_missing({fieldId, searched[], reason})` | Declares a field unfindable | Requires the queries that were tried, so "not found" can't be lazy |
| `flag_conflict({fieldId, candidates[]})` | Records competing values | Feeds the question queue |
| `collect_evidence` / `set_narrative` | Writer phase for prose fields | Every reference must resolve; numbers in the prose must match the referenced fields |
| `ask_user` (built-in, elicitation) | Blocking clarification | Form limited to flat primitives |

This design follows directly from ExtractBench's finding that schema breadth predicts failure ([ExtractBench](https://arxiv.org/html/2602.12247)), and from Anthropic's advice to "poka-yoke" (mistake-proof) tool arguments and return actionable errors ([Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)).

The template schema never reaches the model as one tool schema. `set_field` takes a `fieldId` and validates the value against that field's sub-schema in the handler. That also sidesteps an unanswered question: how the Copilot runtime handles large schemas full of custom `x-` keywords.

**Quote verification** works like this:
1. Normalize the quote and the page text: NFKC Unicode normalization, collapsed whitespace, rejoined hyphenated line breaks, unified quote and dash characters.
2. Accept an exact substring match, or fall back to a fuzzy match of 0.9 or better.
3. Store the character offsets against the *original* text.
4. If no match is found, reject the call with an error the model can act on, such as "quote not found on D12 p.4; copy the exact text." This is Google LangExtract's `char_interval=None` filter, turned into an enforced rule ([LangExtract](https://github.com/google/langextract)).

The fill state is the single source of truth, persisted in SQLite and shared by the tools and the UI:

```json
{
  "templateId": "engagement-letter@2.1.0",
  "schemaHash": "sha256:…",
  "fields": {
    "client.name": {
      "value": "Acme Holdings LLC", "raw": "ACME HOLDINGS, L.L.C.", "status": "verified",
      "sources": [{ "type": "document", "docId": "D12", "page": 1, "blockId": "b4",
                    "quote": "ACME HOLDINGS, L.L.C.", "charStart": 120, "charEnd": 141 }],
      "confidence": { "selfReported": 0.9, "quoteVerified": true, "agreement": true },
      "history": [{ "by": "agent:extractor:parties", "at": "2026-10-11T14:02:11Z", "op": "set" }]
    },
    "effectiveDate": {
      "value": null, "status": "conflict",
      "candidates": [
        { "value": "2026-11-01", "sources": [{ "type": "document", "docId": "D3", "page": 2, "quote": "commencing November 1, 2026" }] },
        { "value": "2026-12-01", "sources": [{ "type": "document", "docId": "D7", "page": 1, "quote": "effective 1 December 2026" }] }
      ]
    }
  },
  "groups": { "hourlyRates": { "rows": { "role:Partner": { "fields": { "rate": { "value": 650, "status": "verified" } } } } } },
  "narratives": { "scopeSummary": { "status": "stale", "refs": ["F:client.name", "Q:D9:p3:120-180"] } },
  "questions": [{ "id": "q7", "fieldId": "effectiveDate", "kind": "conflict", "producer": "orchestrator", "status": "open" }],
  "plan": { "sections": { "parties": { "candidateDocs": ["D12", "D3"], "status": "done" } } }
}
```

### Ask from observable gaps, never from model confidence

Model confidence scores are a weak signal for individual fields:
- A June 2026 preprint found that token log-probabilities, self-reported confidence and multi-sample self-consistency all "collapse toward all-positive behavior" on document field extraction. A fused cross-check signal reached 0.928 ROC AUC ([Beyond Logprobs](https://arxiv.org/abs/2606.24420)).
- Extend is phasing out its log-probability confidence ([Extend](https://docs.extend.ai/product/extraction/confidence-scores)).
- LlamaExtract warns its confidence scores are "not calibrated" ([LlamaExtract](https://developers.llamaindex.ai/python/cloud/llamaextract/features/extensions)).

So drive questions from a **field status machine** instead: `empty → candidate → verified | conflict | missing | needs_user → user_answered | approved`. Questions are triggered by observable states:
- a required field that is still missing after logged searches;
- two or more verified candidates that disagree (auto-resolve with template rules first, for example "an amendment beats the original");
- a quote that does not verify;
- a value that fails normalization;
- a broken cross-field rule (end date before start date);
- for high-stakes fields only, disagreement from a second, independent extraction pass.

User edits lock a field, and handlers refuse agent overwrites of locked fields.

### Narratives come last and cite fields, not raw documents

Generate prose sections only after the atomic fields have stabilized:
1. Collect 5–20 evidence quotes or field references.
2. Outline the paragraph.
3. Write sentences that carry `[[F:client.name]]` field references or `[[Q:D12:p4:120-180]]` quote references.
4. Check deterministically that every reference resolves and that every number and date in the text matches a referenced field.

This "attribute first, then generate" pattern produced more concise citations at comparable quality ([arXiv 2403.17104](https://arxiv.org/abs/2403.17104)). Because narratives are generated from fill state, a later user correction marks them `stale` and triggers regeneration.

### Cost control is mostly retrieval discipline

The main levers:
- **Tier the models.** Cheap models handle catalog summaries and simple-field extraction. Frontier models handle verification, conflicts and narratives. Per-agent `model` and `reasoningEffort` settings exist for this ([custom agents](https://docs.github.com/en/copilot/how-tos/copilot-sdk/features/custom-agents)).
- **Bound tool outputs.** Concise tool response formats used about a third of the tokens of detailed ones ([Writing tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents)).
- **Keep prompt prefixes stable** (template spec, then catalog). Whether the Copilot runtime gets prompt-cache hits from this is undocumented, so measure it with the usage events.
- **Re-run only the affected sections** when the user answers a question or uploads a new file.

## Design each template as a Word layout bound to a JSON Schema contract

### docxtemplater core is the default engine; buy modules only if you need them

**docxtemplater 3.71.0** (published 2026-09-21) is the most mature, actively released DOCX templating engine for Node ([npm docxtemplater](https://registry.npmjs.org/docxtemplater)). Its MIT core covers placeholders, conditions, loops, inverted sections, table-row loops and paragraph-level raw XML ([tag types](https://docxtemplater.com/docs/tag-types/)). Its **InspectModule ships free** in the core package and lists every tag and loop a template uses ([docxtemplater FAQ](https://docxtemplater.com/docs/faq/)).

Images, HTML, styling and Word-comment error reporting are paid modules: **500 EUR/year for one, 1,250 EUR/year for any four (PRO), 3,000 EUR/year for all of them (Enterprise)** ([docxtemplater pricing](https://docxtemplater.com/pricing/)). The pricing page caps One-module and PRO plans at "5 instances" and Enterprise at 25, and never says whether an "instance" is a server or an installed desktop copy. **Ask docxtemplater sales before shipping with paid modules.**

The alternatives:
- **easy-template-x 8.0.0** (MIT) is the strongest fully free fallback. It includes images (it can even replace placeholder images found by their alt text), charts and loops over rows, columns or list items ([easy-template-x](https://github.com/alonrbar/easy-template-x)).
- **docx-templates** runs arbitrary JavaScript inside templates and renders HTML through altChunk, which only Microsoft Word displays ([docx-templates](https://github.com/guigrpa/docx-templates)).
- **Carbone's** CCL license prohibits products whose main purpose is document generation ([Carbone LICENSE](https://unpkg.com/carbone@3.8.2/LICENSE.md)).

Keep the engine behind a `renderDocx(layout, data)` interface so the choice can change later.

### One schema generates prompts, forms, validation, questions and evals

Mature document-automation systems all separate a human-authored layout from a machine-readable variable definition:
- docassemble pairs YAML `fields` with a DOCX template, and its Utilities page generates starter YAML from a template's tags ([docassemble documents](https://docassemble.org/docs/documents.html)).
- Adobe Document Generation mirrors the JSON data shape in its tag paths ([Adobe template tags](https://developer.adobe.com/document-services/docs/overview/document-generation-api/templatetags/)).
- Word binds content controls to a custom XML part ([Microsoft Learn](https://learn.microsoft.com/en-us/previous-versions/visualstudio/visual-studio-2012/bb398244(v=vs.110))).

Do the same here. Ship each template as an immutable folder: `manifest.json`, `layout.docx`, `schema.json`, an optional `ui.json`, `samples/*.json` and a `preview.png`. From the schema, generate:
- the agent's field specs;
- the per-field ajv validators;
- the RJSF or JSON Forms review form ([npm @rjsf/core](https://registry.npmjs.org/@rjsf%2Fcore); [npm @jsonforms/core](https://registry.npmjs.org/@jsonforms%2Fcore));
- the question forms, which must fit MCP's flat-primitive limit;
- the eval metrics;
- the render data.

The examples below are illustrative. They adapt the template notes' sample and add `x-section`, `x-eval` and `rowKey` from the extraction notes' field-metadata recommendations.

```json
{
  "id": "engagement-letter",
  "name": "Engagement Letter",
  "version": "2.1.0",
  "status": "published",
  "locales": ["en-US"],
  "engine": "docxtemplater@3.71",
  "requiredModules": [],
  "outputs": ["docx", "pdf"],
  "layout": "layout.docx",
  "schema": "schema.json",
  "uiSchema": "ui.json",
  "layoutHash": "sha256:…",
  "schemaHash": "sha256:…",
  "fonts": ["assets/fonts/BrandSans-Regular.ttf"],
  "agentPrompt": "Engagement letter for a US professional-services firm. Formal third person. Never invent fees or dates.",
  "followUpPolicy": { "batch": "per-section", "askOn": ["missing-required", "conflict", "unverifiable"], "maxQuestionsPerForm": 8 },
  "samples": ["samples/minimal.json", "samples/full.json", "samples/edge-hourly.json"],
  "changelog": "2.1.0: add includesLitigation checkbox (minor)"
}
```

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "tpl://engagement-letter/2.1.0/schema",
  "title": "Engagement Letter",
  "type": "object",
  "required": ["client", "fee", "scopeSummary"],
  "properties": {
    "client": {
      "type": "object", "x-label": "Client", "x-section": "parties", "required": ["name"],
      "properties": {
        "name": {
          "type": "string",
          "description": "Full legal name of the client entity as it appears in signed agreements.",
          "x-agent": { "sources": ["contract", "id document"], "instructions": "Prefer the latest signed agreement; ignore trade names.",
                       "askUserIfMissing": true, "question": "What is the client's full legal name?" },
          "x-eval": { "metric": "case-insensitive" }
        },
        "address": { "type": "string", "x-render": { "kind": "text", "multiline": true } }
      }
    },
    "effectiveDate": { "type": "string", "format": "date", "x-section": "terms",
                       "x-agent": { "askUserIfMissing": true }, "x-render": { "format": "d MMMM yyyy" }, "x-eval": { "metric": "exact" } },
    "fee": {
      "type": "object", "x-section": "terms", "required": ["type", "amount"],
      "properties": {
        "type":   { "type": "string", "enum": ["fixed", "hourly"], "x-label": "Fee type" },
        "amount": { "type": "number", "minimum": 0, "x-render": { "format": "currency:USD" }, "x-eval": { "metric": "numeric", "tolerance": 0.01 } }
      }
    },
    "hourlyRates": {
      "type": "array", "x-section": "terms", "x-showIf": "fee.type == 'hourly'", "x-agent": { "rowKey": "role" },
      "items": { "type": "object", "required": ["role", "rate"],
                 "properties": { "role": { "type": "string" }, "rate": { "type": "number", "minimum": 0 } } }
    },
    "includesLitigation": { "type": "boolean", "x-section": "scope", "x-render": { "kind": "checkbox" } },
    "scopeSummary": {
      "type": "string", "contentMediaType": "text/markdown", "x-section": "scope",
      "description": "2–4 short paragraphs summarising scope, formal third person.",
      "x-agent": { "kind": "narrative", "instructions": "Write from the uploaded RFP; cite every fact.", "maxWords": 300 },
      "x-render": { "kind": "richtext", "allowedStyles": ["BodyText", "ListBullet"] },
      "x-eval": { "metric": "semantic" }
    }
  }
}
```

The matching tags in `layout.docx` use docxtemplater with the angular-expressions parser and `paragraphLoop: true`. The `date` and `currency` filters are custom filters you register. `scopeSummaryXml` is produced from `scopeSummary` at render time.

```
{client.name}
{client.address}
Effective {effectiveDate | date:'d MMMM yyyy'}
{#fee.type == 'hourly'}Hourly rates apply as follows:{/}
| {#hourlyRates}{role} | {rate | currency}{/hourlyRates} |     ← table-row loop: opens in first cell, closes in last
{includesLitigation ? '☒' : '☐'} Litigation support included
{@scopeSummaryXml}                                             ← paragraph-level raw OOXML built from the Markdown
```

Four lessons from the precedents shape this design:
- **Mirror the data shape in the tags.** Nested objects become dotted paths and arrays become loops.
- **Keep raw values separate from display formatting**, as docassemble's `raw()` does.
- **Fail visibly on unknowns** with docxtemplater's `nullGetter`, rather than leaving silent blanks.
- **Keep the brand logo in the layout**, so the free core is enough. Only images that change per document need the paid Image module or easy-template-x.

### Keep schema and layout in sync with InspectModule and semver

On template import and in CI:
1. Flatten InspectModule's `getAllTags()` tree into dotted paths, with loops written as `array[]`. As of v3.67.6 this can run before `render()` without side effects ([docxtemplater CHANGELOG](https://raw.githubusercontent.com/open-xml-templating/docxtemplater/HEAD/CHANGELOG.md)).
2. Flatten the schema the same way.
3. Report tags the schema lacks as errors, required fields no tag uses as warnings, and type mismatches (a loop over a non-array, for instance).

Version each template bundle as `templateId@semver`:
- **major:** a field is removed, renamed or retyped;
- **minor:** an optional field is added;
- **patch:** layout or styling only.

Store the template version and schema hash with every generated output.

Test each template three ways: render every sample and assert no `{` tags remain, compare text snapshots extracted with mammoth, and diff page images visually.

For non-developer authors, the workflow is:
1. Write and brand the document in Word using named styles.
2. Import it; the app generates a starter schema from the tags, as docassemble's Utilities page does ([docassemble documents](https://docassemble.org/docs/documents.html)).
3. Enrich descriptions and agent hints in an in-app schema editor.
4. Pass the sync check and sample renders.
5. Publish.

Word content controls are elegant, but there is no mature Node library for filling them. One untested middle ground is placing tags inside plain-text content controls so authors see labelled field boxes.

### AI prose becomes styled OOXML, never free-form formatting

Have the agent produce **constrained Markdown**: paragraphs, bold and italic, one level of lists, optionally simple tables. Validate it against an allow-list. Then convert it to OOXML:
1. Parse it with `marked` or remark.
2. Map each node type to a style ID read from the template's `styles.xml`.
3. Emit `<w:p><w:pPr><w:pStyle w:val="BodyText"/>…` and inject it with a `{@raw}` tag. That tag is paragraph-level only ([tag types](https://docxtemplater.com/docs/tag-types/)).

Numbered lists must reference `numId`s that already exist in the template's `numbering.xml`. The paid HTML module does the same job natively through `styleTransformer`, and its output survives LibreOffice and Google Docs because it emits native OOXML, not altChunk ([HTML module](https://docxtemplater.com/modules/html/)). Branding stays in the template, and the model never makes formatting decisions.

### Preview fast with docx-preview; export PDF through LibreOffice or an HTML twin

Use a two-tier preview:
- **Fast tier: docx-preview 0.4.1** (Apache-2.0) re-renders the filled DOCX as HTML after each edit, debounced. It has no real pagination and doesn't support tables of contents ([docx-preview](https://github.com/VolodymyrBaydalka/docxjs)).
- **Accurate tier:** a "Final PDF" tab shows the actual exported PDF in Chromium's built-in viewer.

Users edit field values in the schema-generated form, not in a DOCX editor. If they must hand-edit final prose, the options are:
- SuperDoc, which is AGPL-3.0 unless you buy its commercial license ([SuperDoc](https://github.com/superdoc-dev/superdoc));
- eigenpal's Apache-2.0 editor, which has not been evaluated ([npm eigenpal](https://registry.npmjs.org/@eigenpal%2Fdocx-editor-core));
- Tiptap, whose DOCX conversion requires a paid plan ([Tiptap pricing](https://tiptap.dev/pricing.md)).

**No free, pure-JavaScript DOCX→PDF converter has high fidelity.** docxtemplater's own FAQ calls LibreOffice headless "not perfect" and points to commercial converters for quality ([docxtemplater FAQ](https://docxtemplater.com/docs/faq/)). Microsoft Graph conversion caps files at 2 MB and requires uploading them to OneDrive ([Microsoft Graph](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content-format)).

The decision rule:
- **If recipients need editable Word files**, go Word-first. Detect an installed LibreOffice, or offer it as an optional download through `libreoffice-convert` ([npm libreoffice-convert](https://registry.npmjs.org/libreoffice-convert)).
- **If PDF is the only deliverable**, use HTML templates with a brand theme and Electron's `webContents.printToPDF`. Preview and output come from the same Chromium, so the preview is pixel-identical, and CSS page sizes plus header/footer templates are supported ([Electron webContents](https://www.electronjs.org/docs/latest/api/web-contents)). Typst is the premium-typography variant. Pass data in as JSON; Typst's own guidance says its markup "is not designed to be generated by machines" ([Typst automated generation](https://typst.app/blog/2025/automated-generation)).
- **For fixed third-party forms only:** pdfme or the maintained `@cantoo/pdf-lib` fork. The original pdf-lib has not been released since 2021 ([pdfme](https://pdfme.com/docs/getting-started); [npm pdf-lib](https://registry.npmjs.org/pdf-lib)).

## Ship one signed bundle with all state under userData

### Storage

Default to **`node:sqlite`**:
- It is a "release candidate" since Node 24.15. In the research team's tests it worked in Electron 44's main process and utility processes, and it needs no native rebuilds ([Node v24 sqlite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)).
- Pin Node ≥24.18.1 (Electron 44 or later). A third-party source reports a TEXT-truncation bug fixed in 24.16 ([OpenClaw](https://docs.openclaw.ai/install/node-compatibility)), and an aggregator lists a CVE affecting Node 24.x up to 24.18.0 ([stack.watch](https://stack.watch/vuln/CVE-2026-58041/)).
- FTS5 support inside Electron's build was not checked. A quick check during this synthesis, on stock Node 22.22, found FTS5 compiled in and `loadExtension` available. That is encouraging, but **the spike must confirm FTS5 and sqlite-vec loading inside Electron on every target OS.**

The fallback is **better-sqlite3 13** ([npm better-sqlite3](https://www.npmjs.com/package/better-sqlite3)). Its marginal cost is small: an `@electron/rebuild` step in a packaging pipeline that already has to handle native binaries left outside `app.asar`.

Use **one database file per project** in WAL mode, with each table family written by one process: ingest writes documents and blocks, the agent writes fill state and questions. Store uploads as content-addressed files at `userData/projects/<id>/files/<sha256>.<ext>`. That gives free de-duplication and makes deleting a project for privacy trivial.

Encrypt tokens and BYOK keys with `safeStorage.encryptStringAsync`:
- It uses the Keychain on macOS, DPAPI on Windows and libsecret or kwallet on Linux.
- On Linux, check for the `basic_text` backend, which is a hardcoded-password fallback.
- keytar is no longer maintained.

Sources: [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage); [npm keytar](https://www.npmjs.com/package/keytar).

### Packaging the 130 MB runtime

The Node SDK pulls the Copilot runtime from an optional per-platform package. On linux-x64 that package holds a ~133 MB `runtime.node`, a launcher, and the `rg` and `tgrep` search binaries. On first start the SDK copies them into a per-user cache directory ([npm @github/copilot-sdk-linux-x64](https://www.npmjs.com/package/@github/copilot-sdk-linux-x64); [runtimeArtifacts.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/runtimeArtifacts.ts)). To package it:

1. **Install only the target platform's package** on each CI runner.
2. **Keep it outside the asar archive.** electron-builder's default `smartUnpack` already unpacks any module containing `.node` files or extensionless binaries ([unpackDetector.js](https://app.unpkg.com/app-builder-lib@26.15.3/files/out/asar/unpackDetector.js)). Add an explicit `asarUnpack` rule for `@github/copilot-sdk-*` as a backstop.
3. **Point `RuntimeConnection.forStdio({ path })` or `COPILOT_CLI_PATH` at the copy in `app.asar.unpacked`.** Otherwise every user gets a 133 MB copy in their cache and runs code from a writable location ([Node SDK README](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)).
4. **Set `baseDirectory` under `userData`**, so the app's sessions never mix with a user's own `~/.copilot`.

This is the riskiest seam in the whole build. GitHub publishes no official Electron guidance. A developer who built an Electron app on the SDK in January 2026 found the packaged build "kept failing" to talk to the runtime, and worked around it by running the CLI as a server ([Elio Struyf](https://www.eliostruyf.com/exploring-github-copilot-sdk-building-ghostwriter-app/)). That predates the current API and packaging, but it is a warning.

### Signing and updates

**macOS:**
- Every Mach-O file must be signed with the hardened runtime and then notarized. That includes `runtime.node`, the launcher, `rg` and `tgrep`, and the runtime may need extra entitlements; test this in week one.
- Squirrel.Mac auto-updates and `safeStorage` both depend on a valid signature ([Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)).

**Windows:**
- **Azure Artifact Signing** went GA in January 2026 for organizations and individuals in the US and Canada, and for organizations in the EU and UK ([Microsoft](https://techcommunity.microsoft.com/blog/microsoft-security-blog/-/4482789)). It costs **$9.99/month for 5,000 signatures**, using daily-renewed certificates that are not EV ([DevClass](https://devclass.com/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/)).
- electron-builder supports it through `azureSignOptions` ([electron-builder Windows signing](https://www.electron.build/docs/features/code-signing/code-signing-win)).
- Sign the helper `.exe` files too.
- Public code-signing certificates issued since 2026-03-01 are valid for at most **460 days** ([SSLInsights](https://sslinsights.com/code-signing-certificate-validity-reduced-460-days/)).

**Distribution and hardening:**
- Ship NSIS on Windows and DMG plus ZIP on macOS, with electron-updater serving updates from private GitHub Releases or S3/R2.
- Build separate arm64 and x64 DMGs, since a universal build would roughly double the runtime payload.
- Expect installers of about **150–250 MB per architecture**.
- Use `@electron/fuses` to disable `RunAsNode`, the `NODE_OPTIONS` environment variable and inspector arguments in production builds. The SDK launches its own binary rather than Electron's executable, so this should be safe, but verify it.
- Turn on asar integrity checking ([Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)).

## Evaluate against golden document bundles before tuning prompts

Build **20–50 anonymized document bundles**. Anthropic started its agent evals with about 20 real queries, because early changes have large effects ([Anthropic multi-agent research](https://www.anthropic.com/engineering/multi-agent-research-system)). Each bundle carries:
- the expected fill, including acceptable alternates;
- the expected source document and page per field;
- the list of fields that *should* trigger a question;
- scripted user answers.

Include adversarial cases: conflicting versions, scanned pages, values that only appear in tables, and near-duplicate distractor documents.

Score each dimension separately, following ExtractBench's method of per-field metric declarations (exact, Levenshtein, numeric tolerance, LLM-judged semantic) with present, null and missing kept distinct ([ExtractBench](https://arxiv.org/html/2602.12247)):
- field accuracy by metric type;
- row-level precision, recall and F1 for repeating groups, aligned by `rowKey`;
- provenance accuracy;
- question precision and recall;
- hallucination rate (a value set where the gold answer is null);
- cost and latency per bundle.

The `x-eval` keys in the schema make the metric declarations part of the template itself.

To run it:
- **Harness:** run the real agent loop headless, with a simulated user answering elicitation requests from the scripted answers. Drive it from promptfoo with a custom provider, or from Langfuse datasets ([promptfoo JS assertions](https://promptfoo.dev/docs/configuration/expected-outputs/javascript); [Langfuse](https://langfuse.com/resources/engineering/migrate-from-promptfoo.md)). Both changed owners in 2026: OpenAI acquired promptfoo and ClickHouse acquired Langfuse, and both promise to stay open source ([OpenAI](https://openai.com/blog/openai-to-acquire-promptfoo); [ClickHouse](https://clickhouse.com/blog/clickhouse-acquires-langfuse-open-source-llm-observability)).
- **Tracing:** trace spans per session, sub-agent and tool call using the `traceparent` that tool handlers receive. Make telemetry opt-in and redact document text.
- **Tests:** use Vitest 5 for `agent-core` and `doc-engine`. Use Playwright's `_electron` support (still labelled experimental) for end-to-end tests against a fake agent worker that replays recorded event streams, which makes streaming, approval and question flows deterministic. Keep the inspector fuse enabled in e2e builds ([Playwright Electron](https://playwright.dev/docs/api/class-electron)).

## Licensing and cost risks cluster in a few places

| Area | What the notes found | Action |
|---|---|---|
| Copilot SDK and runtime | The SDK is MIT ([LICENSE](https://github.com/github/copilot-sdk/blob/main/LICENSE)). **Nobody has read the license of the bundled runtime binary**, and no SDK-specific redistribution clause was found | Read the license files in the platform packages; get legal review |
| Copilot usage terms | Individual-plan inputs and outputs may be used for training unless the user opts out. One login per person. No sharing API tokens to exceed rate limits ([GitHub ToS](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)). Business and Enterprise fall under separate terms ([additional terms](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)). What Copilot Free's "personal use" means is undefined | Per-user auth or BYOK only, never a shared vendor token; disclose the data flow; offer BYOK or local models for sensitive documents |
| Copilot billing | AI Credits; no automatic fallback to a cheaper model when limits are hit ([billing change](https://github.blog/changelog/2026/04/27/github-copilot-is-moving-to-usage-based-billing/)). An open request for third-party user-delegated billing exists ([issue #182](https://github.com/github/copilot-sdk/issues/182)) | Show usage per job; set `sessionLimits`; route bulk OCR away from Copilot vision |
| docxtemplater | MIT core; modules cost 500 / 1,250 / 3,000 EUR/year; the "instance" limits are unclear for desktop installs ([pricing](https://docxtemplater.com/pricing/)) | Ask sales before depending on modules; easy-template-x is the free fallback |
| Copyleft and non-commercial traps | mupdf.js (AGPL), SuperDoc (AGPL), Marker weights (paid above $5M), Chandra (OpenRAIL-M), jina-ocr-v1 (non-commercial), Carbone (CCL); MinerU has extra license terms ([MinerU](https://github.com/opendatalab/MinerU)) | Exclude, or buy commercial licenses |
| Stale or mis-published packages | npm `xlsx` 0.18.5, pdf-lib (2021), html-to-docx (2023), docxtemplater-image-module-free (2019), mailparser (maintenance-only), keytar | Use SheetJS from its CDN, `@cantoo/pdf-lib`, `@turbodocx/html-to-docx`, PostalMime, `safeStorage` |
| LibreOffice | Compound license led by MPL; bundling adds hundreds of MB | Prefer detecting an installed copy or an optional download; include the license notices |
| Signing | Artifact Signing $9.99/month, limited countries, non-EV; certificates capped at 460 days | Budget for it; automate signing in CI |
| Cloud parsing | Mistral ~$4/1k pages (reports conflict), Azure Layout ~$10/1k, LlamaParse 1–45 credits per page | Opt-in per workspace; choose zero-retention modes |

## Build in five phases that retire the riskiest unknowns first

| Phase | Goal | Key deliverables | Exit criterion |
|---|---|---|---|
| 0. De-risking spike | Prove the dangerous seams | Electron 44 + agent utilityProcess + pinned SDK launching the runtime from `app.asar.unpacked`; notarized macOS and Artifact-Signed Windows builds; OAuth token → session; a BYOK session; an elicitation round trip to the renderer; FTS5 and sqlite-vec working in Electron's `node:sqlite` on each OS; one real template rendered; answers on the runtime license and docxtemplater instance terms | A signed installer on each OS that chats through both Copilot and BYOK |
| 1. Vertical slice | One template, born-digital PDF and DOCX | Ingest worker (unpdf, mammoth) → blocks + FTS5 + document catalog; tool set; fill-state store with quote-verified `set_field`; three-pane UI with source highlighting; DOCX render + docx-preview; golden set v0 (~20 bundles) | Baseline field, provenance and hallucination metrics recorded |
| 2. Gaps and questions | The loop that differentiates the product | Status machine; orchestrator-generated question forms; elicitation producer; conflict handling; user locks; `onAgentStop` diligence check; incremental re-runs; narrative writer with references | Question precision/recall and hallucination targets met on the golden set |
| 3. Breadth and authoring | Real-world inputs, templates without code changes | XLSX, PPTX and email; OCR quality gate; vision escalation; opt-in cloud parser; vector leg if evals show keyword misses; template import → starter schema → sync check → versioning; PDF output path | A non-developer onboards a new template without engineering help |
| 4. Polish and ship | Production readiness | Window chrome, ⌘K, motion; update channels; fuses; opt-in OpenTelemetry; Playwright E2E with replayed streams; CI gating on golden metrics; credit-usage display; Electron 45 upgrade | Staged rollout to the first customers |

## If "web app" means browser-hosted, the agent moves to your server

If the team actually meant a browser-hosted app, five things change.

- **Where the SDK runs.** The Copilot SDK would run on your servers. The SDK documents a "Backend Services" path for ISVs. For shared servers, `mode: "empty"` stops being a good idea and becomes mandatory, because the default mode "can expose ambient host filesystem capabilities" ([multi-tenancy docs](https://github.com/github/copilot-sdk/blob/main/docs/setup/multi-tenancy.md); [choosing a setup path](https://github.com/github/copilot-sdk/blob/main/docs/setup/choosing-a-setup-path.md)).
- **Auth and billing.** Each request would carry that user's own OAuth token through `gitHubToken` or `gitHubTokenProvider`, with rate limits applied per user ([GitHub OAuth setup](https://github.com/github/copilot-sdk/blob/main/docs/setup/github-oauth.md)). The one-login-per-person rule still forbids routing everyone through a vendor token. BYOK keys would sit in your secrets store instead of the user's keychain.
- **UI.** The stack barely changes: `useChat` uses its default HTTP transport, and AI Elements works unchanged.
- **Ingestion and output.** Ingestion moves to server workers running the same Node libraries. Python engines like Docling become easy to run in a container. Gotenberg (MIT, Chromium plus LibreOffice) becomes a natural PDF service ([Gotenberg](https://github.com/gotenberg/gotenberg)).
- **What disappears.** Electron, code signing, the updater and the 130 MB per-installer runtime all go away.

The new burden is that every document leaves the user's device for your infrastructure. That raises tenancy-isolation, retention and compliance questions the desktop design largely avoids.

## Conclusion

The Copilot runtime's weight reshapes decisions well beyond the shell. Its roughly 130 MB native payload is what cancels Tauri's size advantage. It also makes avoiding native modules in SQLite a weak argument, because the pipeline must handle unpacked native binaries anyway. So pick each layer for maturity, not install size. The same logic applies to LibreOffice, which is really one decision with two payoffs. Accept it for DOCX→PDF output, and it also unlocks true page numbers for DOCX citations and LiteParse's Office parsing. Refuse it, and you are committing to an HTML twin of every template, or to citations by heading path.

The deeper shift is where the product's value sits. The SDK's elicitation forms are limited to flat primitive fields, models find the missing information only about half the time, and huge single-shot JSON outputs fail. Together these mean the intelligence that matters lives in the schema, the fill-state machine and the verification handlers, not in the model. That makes the Copilot SDK a replaceable engine. Keep it behind `agent-core`, and if seat economics or API churn turn against it, the Vercel AI SDK or the OpenAI Agents SDK can take its place. You would lose billing through users' plans, built-in compaction and native elicitation, and keep everything that makes the filled template trustworthy.

## Questions whose answers would change this recommendation

| Question | What changes with the answer |
|---|---|
| Do recipients need an editable **DOCX**, a **PDF**, or both? | DOCX or both → Word-first with docxtemplater and a LibreOffice decision. PDF only → HTML templates + `printToPDF` (or Typst), with no LibreOffice and a pixel-identical preview |
| Do most end users already have **Copilot seats** (which plans, org-managed or personal), or must the app work for people without GitHub accounts? | Seats → GitHub sign-in first. No seats → BYOK or a vendor-run token proxy becomes primary, and the case for the Copilot SDK over a lighter SDK weakens |
| May documents leave the device: to Copilot models, to cloud parsers, at all? Is **offline** operation required? | Strict privacy → local-model BYOK (Ollama), no cloud parsing, local embeddings only, and Copilot's individual-plan training terms become a blocker |
| How many documents per job, how many pages, what share is **scanned**, which languages? | High scanned volume → a stronger local OCR tier (PaddleOCR-VL) or Mistral batch; large corpora → add the vector leg and per-section worker sessions early |
| Who **authors templates**: developers or non-developers, how many templates, how often do they change? | Non-developers → invest in the import wizard, schema editor, content-control labels and Error-location module; developers → plain files in Git with CI sync checks |
| Which **OSes and versions** must be supported? | macOS 12 or 32-bit Windows → Electron 44 is ruled out; Linux → AppImage builds and the `safeStorage` `basic_text` fallback need handling |
| Is this **sold commercially** to external customers, or used internally? | Commercial → docxtemplater licensing, the Copilot runtime license and the Copilot ToS need legal sign-off; internal → simpler, and an org Business/Enterprise plan may cover usage |
| Must users **hand-edit final prose** inside the app, beyond field values? | Yes → budget for a commercial DOCX editor (SuperDoc commercial) or evaluate eigenpal; no → the schema-driven form plus preview is enough |
| Are any templates **fixed third-party PDF forms** (government, insurer)? | Yes → add pdfme or `@cantoo/pdf-lib` AcroForm filling alongside DOCX |
| Did "web app" mean a **browser-hosted** product rather than a desktop app? | Yes → move the SDK, ingestion and rendering to a server with per-user tokens and `mode: "empty"`, as in the section above |
