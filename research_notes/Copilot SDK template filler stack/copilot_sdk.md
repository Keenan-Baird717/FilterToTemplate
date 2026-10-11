# GitHub Copilot SDK (`@github/copilot-sdk`) as the agent foundation for a Node 24 / Electron document-to-template app

Research date: 2026-10-11. Main sources: the `github/copilot-sdk` repo (shallow clone of `main` at commit `6be623b`, 2026-10-10, "Update SDK snapshot for Copilot CLI 1.0.96-2"), the npm registry, the GitHub Changelog and blog, and GitHub's terms. Repo links below point at `main`. Line-level details can change from one snapshot to the next, because the repo is re-snapshotted against each new Copilot CLI build, often daily.

---

## 1. Status, versions, languages, Node requirement, CLI bundling and transport (packaging implications)

### Takeaway
The SDK has been generally available since 2026-06-02 and is on semver 1.x. The latest npm version is `1.0.19`, published 2026-10-09. It requires Node `^20.19.0 || >=22.12.0`, so Node 24 is supported. The Node package ships the Copilot CLI runtime in per-platform optional npm packages of roughly 127–142 MB unpacked. At startup it copies that runtime into a per-user cache directory, spawns it as a child process, and talks to it over JSON-RPC on stdio. TCP, connecting to an existing URL, and an experimental in-process FFI mode are also available. This makes Electron packaging workable, but large and native-binary-heavy.

### Cited Findings
- Status history: technical preview announced 2026-01-14 (four languages), public preview 2026-04-07, GA 2026-06-02 — [GitHub Changelog: GA](https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/); [Changelog: technical preview](https://github.blog/changelog/2026-01-14-copilot-sdk-in-technical-preview/); [Changelog: public preview](https://github.blog/changelog/2026-04-07-copilot-sdk-in-public-preview/)
- npm release dates: first published 2026-01-08 (0.1.x), `0.2.0` on 2026-03-20, `0.3.0` on 2026-04-24, `1.0.0` on 2026-06-02, then frequent 1.0.x releases up to `1.0.19` on 2026-10-09. Current dist-tags are `latest: 1.0.19`, `prerelease: 1.0.20-preview.2`, and an `unstable` channel — [npm registry `@github/copilot-sdk`](https://www.npmjs.com/package/@github/copilot-sdk) (queried via `npm view`)
- The README FAQ says: "The GitHub Copilot SDK is generally available and follows semantic versioning." — [README](https://github.com/github/copilot-sdk/blob/main/README.md)
- Official SDKs: Node.js/TypeScript (`npm install @github/copilot-sdk`), Python (`github-copilot-sdk`), Go, .NET (`GitHub.Copilot.SDK`), Rust (`github-copilot-sdk`, new at GA) and Java (`com.github:copilot-sdk-java`). Clojure and C++ SDKs are community-maintained and unofficial — [README](https://github.com/github/copilot-sdk/blob/main/README.md); [GA changelog](https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/)
- Node requirement: "Node.js ^20.19.0 or >=22.12.0" (`engines` in package.json). Runtime dependencies are `zod` 4.3.6, `koffi` 3.2.1 (native FFI library) and `vscode-jsonrpc` 8.2.1. The package is ESM-first (`"type": "module"`) and also exports CJS (`./dist/cjs/index.js`). There is a second entry point, `@github/copilot-sdk/extension`, for CLI extensions — [nodejs/package.json](https://github.com/github/copilot-sdk/blob/main/nodejs/package.json); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Architecture: "All SDKs communicate with the Copilot CLI server via JSON-RPC… The SDK manages the CLI process lifecycle automatically. You can also connect to an external CLI server" — [README](https://github.com/github/copilot-sdk/blob/main/README.md)
- Bundling: "For Node.js, Python, and .NET SDKs, the Copilot CLI is bundled automatically". Go, Java and Rust need a separate CLI install, although Go and Rust have their own bundling features — [README](https://github.com/github/copilot-sdk/blob/main/README.md)
- The Node SDK "uses an optional `@github/copilot-sdk-<platform>` package containing the Copilot CLI runtime for the host platform… starting the SDK performs no runtime download. Set `COPILOT_CLI_PATH` to use an existing installation instead." — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Platform packages for 1.0.19 are linux-x64, linux-arm64, linuxmusl-x64, linuxmusl-arm64, darwin-x64, darwin-arm64, win32-x64 and win32-arm64. The main package is about 3.0 MB unpacked, `@github/copilot-sdk-darwin-arm64` about 127 MB, and `@github/copilot-sdk-win32-x64` about 142 MB — [npm registry](https://www.npmjs.com/package/@github/copilot-sdk) (queried via `npm view … optionalDependencies dist.unpackedSize`)
- The SDK pins the runtime build it ships with. `package.json` carries a `copilotCliVersion` field, set to `1.0.96-2` in the current snapshot, and the SDK protocol version is `3` — [nodejs/package.json](https://github.com/github/copilot-sdk/blob/main/nodejs/package.json); [sdk-protocol-version.json](https://github.com/github/copilot-sdk/blob/main/sdk-protocol-version.json)
- Transport options, from the `CopilotClientOptions.connection` docs:
  - `RuntimeConnection.forStdio({ path?, args?, env? })` (default): "spawn the runtime and communicate over its stdin/stdout"
  - `RuntimeConnection.forTcp({ port?, connectionToken?, … })`
  - `RuntimeConnection.forUri(url, { connectionToken? })`: connect to an already-running runtime. "There is no top-level `cliUrl` shortcut."
  - `RuntimeConnection.forInProcess()`: "host the runtime in-process over its native C ABI (FFI). **Experimental.**"
  - "Managed child-process connections materialize the bundled `copilot-runtime` and adjacent `runtime.node`, then launch the wrapper by default. An explicit connection `path` or `COPILOT_CLI_PATH` overrides the bundled runtime."
  — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- The runtime is materialized under the user cache directory: `%LOCALAPPDATA%\github-copilot-sdk\runtime` on Windows, `~/Library/Caches/github-copilot-sdk/runtime` on macOS, and `$XDG_CACHE_HOME` or `~/.cache/github-copilot-sdk/runtime` on Linux. The key is `<platform>-<fingerprint>`, and the copy is staged through a temporary `.runtime-*` directory — [nodejs/src/runtimeArtifacts.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/runtimeArtifacts.ts)
- The bundled-CLI setup guide gives "Desktop apps" as a target: "Best for: Most applications—desktop apps, standalone tools, CLI utilities, prototypes… The SDK starts it as a child process and communicates over stdio… Users authenticate through your app (or use env vars / BYOK); Sessions are managed per-user on their machine". It also says "Session state persists at `~/.copilot/session-state/{sessionId}/`" — [docs/setup/bundled-cli.md](https://github.com/github/copilot-sdk/blob/main/docs/setup/bundled-cli.md)
- `baseDirectory` "Sets `COPILOT_HOME` on the spawned runtime. When not set, the runtime defaults to `~/.copilot`". `workingDirectory`, `env`, `logLevel` and `sessionFs` (a custom session filesystem provider) are also client options — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- In-process mode: "In-process hosting is experimental in every SDK… Runs in the application process without Node.js, a child process, a TCP port, or a connection token… The native runtime bundle must match the host operating system, CPU architecture, and, on Linux, C library." `env`, `telemetry` and `workingDirectory` are rejected with this transport — [docs/setup/in-process-runtime.md](https://github.com/github/copilot-sdk/blob/main/docs/setup/in-process-runtime.md); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- `stop()` "closes stdin and waits up to 10 seconds for host cleanup… before falling back to termination". `forceStop()` also exists. Clients and sessions support `await using` (`Symbol.asyncDispose`) — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Older Electron experience (January 2026, technical-preview era): one developer moved from Tauri to Electron because Rust wasn't supported yet. The packaged Electron app "kept failing" to talk to the CLI, and they fixed it by spawning `copilot --server --port 4321` and connecting with `new CopilotClient({ cliUrl: "localhost:4321" })` — [Elio Struyf blog, 2026-01-26](https://www.eliostruyf.com/exploring-github-copilot-sdk-building-ghostwriter-app/). **Possibly outdated:** `cliUrl` has since been replaced by `RuntimeConnection.forUri(...)`, a Rust SDK now exists, and runtime bundling moved to platform packages.
- Some docs.github.com pages in search snippets still say "technical preview" and show a `cliPath` option. These look like stale indexes or mirrors of older docs — [docs.github.com bundled-cli (search snippet)](https://docs.github.com/en/copilot/how-tos/copilot-sdk/set-up-copilot-sdk/bundled-cli). The repo docs are more current.

### Inferences
- Node 24 is supported by the engines range. Run the SDK in the Electron **main process** or a Node utility process, never the renderer, because it spawns child processes and uses native modules. Whether a given Electron major embeds a compatible Node version (≥22.12) needs checking against the Electron version you pick.
- Packaging: the SDK copies the runtime from `node_modules/@github/copilot-sdk-<platform>` into the user cache and runs it from there. So:
  - include the correct platform package for each build target. Cross-building installers needs every target's optional dependency installed.
  - plan for roughly 130–145 MB of extra installer size per platform.
  - add `@github/copilot-sdk-*` and `koffi` to `asarUnpack`. That is the safe choice for native binaries, even though copying out of asar may also work through Electron's fs patches.
  - on macOS, make sure the copied runtime binaries are signed and notarized as part of the app, or point `connection: RuntimeConnection.forStdio({ path })` / `COPILOT_CLI_PATH` at a binary inside the signed app bundle. All of this is unverified; no official Electron guidance was found.
- Set `baseDirectory` to the app's own `userData` folder. This keeps the app's sessions, config and caches out of `~/.copilot`, so they don't collide with a user's own Copilot CLI install.
- Tauri: a Tauri app would have to run Node as a sidecar process, or use the Rust SDK (now official) from the Tauri core. Electron is the more direct route for a Node/TS codebase.
- Expect frequent churn. There were 19 patch releases in about 4 months after GA, the runtime is re-snapshotted daily, and many APIs are marked experimental. Pin exact versions.

### Gaps
- No official Electron or Tauri sample, and no packaging guidance (asar, code signing, notarization, Windows SmartScreen) was found in the repo, the cookbook, or issue search. An issue search for "electron" returned no packaging issues.
- The license of the bundled Copilot CLI runtime binary in the platform packages was not checked. The SDK source is MIT; the runtime may be under different terms.
- The CHANGELOG only documents up to v1.0.14 (2026-09-16). Release notes for 1.0.15–1.0.19 would have to come from GitHub Releases, which were not fetched.

---

## 2. Core API: clients, sessions, messaging, streaming, persistence/resume, system prompt, models, reasoning effort, context/compaction

### Takeaway
The API is built around `CopilotClient`, `createSession(config)` / `resumeSession(id, config)`, and `send` / `sendAndWait`, with typed `session.on(...)` events. On top of that it offers full system-prompt control (`append`, `customize` by section, or `replace`), model switching mid-session, `reasoningEffort` (`low` to `max`), "infinite sessions" with automatic background compaction (on by default), sessions that persist on disk and can be resumed, steering and queueing, and preview structured output via Zod or JSON Schema. Structured output fits final template filling well.

### Cited Findings
- Quick start:
  ```ts
  import { CopilotClient, approveAll } from "@github/copilot-sdk";
  const client = new CopilotClient();
  await client.start();
  const session = await client.createSession({ model: "gpt-5", onPermissionRequest: approveAll });
  session.on("assistant.message", (event) => console.log(event.data.content));
  session.on("session.idle", () => {/* done */});
  await session.send({ prompt: "What is 2+2?" });
  await session.disconnect(); await client.stop();
  ```
  — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Client methods: `start`, `stop`, `forceStop`, `createSession`, `resumeSession`, `ping`, `listSessions(filter?)`, `deleteSession`, and `onLifecycle` (with `session.created`, `deleted`, `updated`, `foreground` and `background` events). `client.rpc.*` exposes the generated RPC surface, for example `client.rpc.models.list({})` and `client.rpc.account.getQuota({})` — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [docs/features/usage-and-billing.md](https://github.com/github/copilot-sdk/blob/main/docs/features/usage-and-billing.md)
- Session methods: `send(options) → messageId`, `sendAndWait(options, timeout?)`, `on(eventType, handler)` / `on(handler)`, `setModel(model, { reasoningEffort?, autoTier? })`, `setAutoTier`, `setTools` (experimental), `abort`, `getEvents`, `disconnect` ("Session data on disk is preserved for later resumption"), `capabilities`, and `ui` — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- `MessageOptions` fields:
  - `prompt`
  - `attachments`
  - `mode: "enqueue" | "immediate"`. `immediate` is steering, "Inject mid-turn without aborting"; `enqueue` is the default.
  - `source: "user" | "system" | \`agent-${string}\`` provenance, added in v1.0.14
  — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md); [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)
- Structured output is in **preview**: pass a Zod or JSON Schema `responseSchema` to `send`/`sendAndWait`, or use the typed overload `const answer = await session.sendAndWait("What is 19 + 23?", answerSchema);`. That overload "parses the final JSON, and validates it with the schema's `parse` method. Invalid JSON, a schema mismatch, or a completed run without a matching assistant message throws." Caveats:
  - "Requires a runtime build with `responseFormat`… support"
  - "Remote sessions and known HydraFusion routes reject response formats"
  - "An API-compatible gateway may ignore format fields… the Claude Chat-completions compatibility route is not equivalent to Anthropic's native `output_config.format` endpoint"
  - the schema "is not a persisted session default"
  — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Streaming: `streaming: true` emits `assistant.message_delta` (with `deltaContent`) and `assistant.reasoning_delta`. Final `assistant.message` and `assistant.reasoning` events are always sent. Other events include `user.message`, `tool.execution_start`, `tool.execution_complete`, `session.idle`, `session.compaction_start`, `session.compaction_complete`, `assistant.usage` and `session.usage_info`. The compatibility doc says "40+ event types" — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)
- Agent loop: "The SDK is a transport layer… The CLI is the orchestrator that runs the agentic tool-use loop… Each iteration of this loop is exactly one LLM API call", visible as an `assistant.turn_start` / `assistant.turn_end` pair. The loop ends with `session.idle` — [docs/features/agent-loop.md](https://github.com/github/copilot-sdk/blob/main/docs/features/agent-loop.md)
- System prompt: `systemMessage: { content }` appends by default ("The SDK auto-injects environment context, tool instructions, and security guardrails. The default CLI persona is preserved"). `mode: "customize"` can `replace`, `remove`, `append`, `prepend` or `preserve` named sections:
  - `preamble`, `identity`, `tone`, `tool_efficiency`, `environment_context`
  - `code_change_rules`, `guidelines`, `safety`, `tool_instructions`
  - `custom_instructions`, `runtime_instructions`, `last_instructions`

  An action can also be a callback. `mode: "replace"` gives "full control (removes all guardrails)". The official example removes `code_change_rules` and sets content to "Focus on financial analysis and reporting." — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Models: the README says "All models available via Copilot CLI are supported in the SDK. The SDK also exposes a method which will return the models available". `listModels()` returns "capabilities, billing, policy". Model IDs used in the docs include `gpt-5`, `gpt-5.4` (the most common default in docs), `gpt-5.5`, `gpt-5.2-codex`, `claude-sonnet-4.5` and `auto`. `model: "auto"` with `capi.autoTier` set to `"efficiency" | "balance" | "intelligence" | "fast"` routes automatically. A Rust example shows an `allowed_models` allowlist (v1.0.14) — [README](https://github.com/github/copilot-sdk/blob/main/README.md); [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)
- Reasoning: `reasoningEffort?: "low" | "medium" | "high" | "xhigh" | "max"`, "for models that support it. Use `listModels()` to check" — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Infinite sessions: "By default, sessions use **infinite sessions** which automatically manage context window limits through background compaction and persist state to a workspace directory". Config is `infiniteSessions: { enabled, backgroundCompactionThreshold: 0.8, bufferExhaustionThreshold: 0.95 }`. The `workspacePath` folder contains `checkpoints/`, `plan.md` and `files/`. Experimental extras: manual `session.rpc.history.compact()`, `history.clearContext()` (called from a tool marked `isTerminal: true`), `history.truncate()` and `sessions.fork()` — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [docs/features/context-management.md](https://github.com/github/copilot-sdk/blob/main/docs/features/context-management.md); [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)
- Persistence and resume:
  - `resumeSession(id, config)` can reconfigure `model`, `systemMessage`, `availableTools`, `excludedTools`, `provider`, `reasoningEffort`, `streaming`, `workingDirectory`, `mcpServers`, `customAgents`, `skillDirectories`, `infiniteSessions` and more.
  - "When using your own API keys, you must re-provide the provider configuration when resuming. API keys are never persisted to disk."
  - "Tool state not persisted — In-memory tool state is lost".
  - `allowTranscriptRecovery` (default true) repairs damaged transcripts.
  - Custom `sessionId` values are supported.
  - The optional `memory: { enabled }` feature recalls information across turns.
  — [docs/features/session-persistence.md](https://github.com/github/copilot-sdk/blob/main/docs/features/session-persistence.md); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Budget control: `sessionLimits: { maxAiCredits: 30 }` sets a soft AI Credits cap. "Usage is checked after model calls return, so one response can exceed the configured value" — [docs/features/session-limits.md](https://github.com/github/copilot-sdk/blob/main/docs/features/session-limits.md)
- Telemetry: `telemetry: { otlpEndpoint }` (OpenTelemetry). `clientInfo` (app name and version) attributes runtime telemetry to the host app (v1.0.13) — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)
- Features that are CLI-only and not in the SDK include the TUI slash commands, `/share` export, `/research` deep research, and the interactive login commands (`/login`, `copilot auth login`). Use the SDK's own APIs instead, for example `setModel()` and `session.rpc.plan.*` — [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)

### Inferences
- For "fill a template", a good pattern is to run the conversational session, then make a final `sendAndWait(prompt, zodTemplateSchema)` call to get typed, validated JSON for rendering. Because structured output is in preview and depends on the provider, keep a fallback: a custom `submit_template` tool whose Zod parameters are the template schema, marked `isTerminal: true`.
- The default persona is a coding agent. For a non-coding app, use `mode: "customize"` to replace `identity` and `tone` and remove `code_change_rules`, or use `replace` but re-add any safety text you need.

### Gaps
- No authoritative, current list of Copilot models and context-window sizes was found in the SDK docs. The list comes from `listModels()` at runtime and depends on plan, policy and BYOK.
- Compaction quality and token behavior on large document sets are not documented beyond the threshold settings.

---

## 3. Custom tools, permission handling, built-in tools, and restricting them for a non-coding app

### Takeaway
Tools are defined with `defineTool(name, { description, parameters: zodSchema | JSONSchema, handler })`. Handlers run in your Node process and receive an `AbortSignal`. Every tool call, built-in or custom, goes through the `onPermissionRequest` handler unless `skipPermission: true` is set. By default the session exposes the CLI's first-party tools "similar to running the CLI with `--allow-all`": shell, file read/write/edit, grep/glob, URL fetch and so on. For a non-coding desktop app, allowlist tools with `availableTools` (`custom:*` plus selected built-ins) or use client `mode: "empty"`, and deny shell and write in the permission handler.

### Cited Findings
- Tool definition:
  ```ts
  defineTool("lookup_issue", {
    description: "Fetch issue details from our tracker",
    parameters: z.object({ id: z.string().describe("Issue identifier") }),
    handler: async ({ id }) => fetchIssue(id),
  })
  ```
  "Handlers can return any JSON-serializable value (automatically wrapped), a simple string, or a `ToolResultObject`… Raw JSON schemas are also supported if Zod isn't desired." — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Tool options:
  - `overridesBuiltInTool: true`, required to replace a built-in such as `edit_file` or `read_file`
  - `skipPermission: true`
  - `defer: "auto" | "never"`, for lazy loading through tool search
  - `isTerminal: true`, which ends the turn when the tool succeeds
  - tools without a `handler` are declaration-only, resolved through pending tool-call RPCs
  - `session.setTools([...])` replaces the tool set mid-session (experimental)
  — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [docs/features/context-management.md](https://github.com/github/copilot-sdk/blob/main/docs/features/context-management.md)
- Cancellation (v1.0.13): "Host-owned external tool callbacks are now cancelled when their runtime request completes or their SDK session terminates… Node.js exposes `ToolInvocation.signal`" — [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)
- Tool results can carry an experimental `citableSources` array (`content`, `id`, `title`, `url`, `path`). It is "persisted with the tool result" and feeds the citations feature — [docs/features/citations.md](https://github.com/github/copilot-sdk/blob/main/docs/features/citations.md)
- Defaults: "By default, the SDK exposes the Copilot CLI's first-party tools, similar to running the CLI with `--allow-all`. Tool execution is still governed by each SDK's permission handler" — [README](https://github.com/github/copilot-sdk/blob/main/README.md)
- Built-in tool names that appear in docs include `view`, `edit`, `bash`, `grep`, `glob`, `read_file`, `write_file`, `edit_file`, `apply_patch`, `task` and `tool_search_tool`. The `BuiltInTools.Isolated` set ("no host filesystem access outside the session… no network. Safe to enable in `Mode = "empty"`") contains `ask_user`, `task_complete`, `exit_plan_mode`, `task`, `read_agent`, `write_agent`, `list_agents`, `send_inbox`, `context_board` and `skill` — [nodejs/src/toolSet.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/toolSet.ts); [docs/features/custom-agents.md](https://github.com/github/copilot-sdk/blob/main/docs/features/custom-agents.md); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Filtering: `availableTools?: string[] | ToolSet` takes source-qualified patterns (`builtin:*`, `builtin:<name>`, `mcp:*`, `mcp:<name>`, `custom:*`, `custom:<name>`). "a tool is enabled when it matches `availableTools`… AND it does not match `excludedTools`". `excludedTools` "Always takes precedence". `excludedBuiltinAgents` hides built-in agents. Builder example: `new ToolSet().addBuiltIn(BuiltInTools.Isolated).addMcp("*").addCustom("*")` — [nodejs/src/types.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/types.ts); [nodejs/src/toolSet.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/toolSet.ts)
- `mode: "empty"` "disables optional Copilot CLI behavior by default… your application must explicitly decide which tools, MCP servers, skills, and workspace paths a session can access". It requires `baseDirectory` or `sessionFs`, plus `availableTools` on each session. Memory, built-in skills and the session store default to off. "Do not use the default `mode: "copilot-cli"` for shared servers… can expose ambient host filesystem capabilities." Example: `availableTools: ["custom:lookupOrder", "custom:createTicket"]` — [docs/setup/multi-tenancy.md](https://github.com/github/copilot-sdk/blob/main/docs/setup/multi-tenancy.md); [nodejs/src/types.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/types.ts); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Permission handler:
  - `onPermissionRequest(request, invocation)` sees `request.kind` of `"shell" | "write" | "read" | "mcp" | "custom-tool" | "url" | "memory" | "hook"` ("additional kinds may be added"), plus fields such as `toolName`, `fileName` and `fullCommandText`.
  - It returns `approve-once`, `approve-for-session`, `approve-for-location`, `approve-permanently`, `reject` (with optional `feedback` to the model), `user-not-available`, or `no-result`.
  - "When omitted, permission requests are emitted as events and left pending."
  - `approveAll` "throws when `enableManagedSettings` is true" (enterprise-managed policy).
  — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Enterprise policy: the `managedSettings` (host-injected) and `enableManagedSettings` (self-fetched) permission policy layers are deny/ask/allow rule lists that "compose restrictively" with org policy (v1.0.13) — [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)
- `workingDirectory` and `additionalDirectories` scope the session's filesystem access ("re-supply on resume") — [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)

### Inferences
- A recommended baseline for this app:
  ```ts
  new CopilotClient({ mode: "empty", baseDirectory: app.getPath("userData") + "/copilot" })
  ```
  plus `availableTools: new ToolSet().addCustom("*").addBuiltIn(["ask_user"])` (optionally also `view` for images), plus an `onPermissionRequest` that rejects `shell`, `write` and `url`. This sketch is assembled from the documented options above and has not been run.
- Put document extraction (`list_documents`, `read_document(id, page range)`, `search_documents(query)`), template inspection (`get_template_schema`) and field writing (`set_field`, `submit_template`) in custom tools. Doing this in the main process keeps file access under app control instead of exposing the runtime's built-in filesystem tools.

### Gaps
- No complete, authoritative list of built-in tool names or their descriptions was found in the SDK docs. The README defers to Copilot CLI documentation. Names may vary between Windows (`powershell`) and Unix (`bash`); unverified.

---

## 4. Human-in-the-loop: asking the end user follow-up questions; hooks

### Takeaway
Yes, this is built in. A model-facing `ask_user` tool is turned on by giving a handler:
- `onUserInputRequest` (legacy): a question, optional choices, and freeform text
- `askUserVariant: "elicitation"` with `onElicitationRequest` (newer): the agent sends a JSON-Schema form, and your UI returns `accept`/`decline`/`cancel` plus the content

The host app can also start its own dialogs with `session.ui.confirm` / `select` / `input` / `elicitation`. Rich hooks cover pre/post tool use, prompt submit, session start/end, errors, agent stop, and sub-agent start/stop.

### Cited Findings
- Legacy `ask_user`:
  ```ts
  onUserInputRequest: async (request, invocation) => {
    // request.question, request.choices?, request.allowFreeform (default true)
    return { answer: "User's answer here", wasFreeform: true };
  }
  ```
  "Enable the legacy question-and-answer `ask_user` tool by providing an `onUserInputRequest` handler" — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Elicitation `ask_user` (v1.0.13): "Session create and cold resume now accept… `askUserVariant` option with `legacy` and `elicitation` values. SDK sessions retain the legacy question-and-answer tool by default. Select `elicitation` and provide an elicitation handler to expose the structured form-based `ask_user` tool." — [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)
- Elicitation handler:
  ```ts
  askUserVariant: "elicitation",
  onElicitationRequest: async (context) => {
    // context.message, context.requestedSchema (JSON Schema), context.mode "form" | "url", context.elicitationSource
    return { action: "accept", content: { region: "us-east", dryRun: true } };
  }
  ```
  MCP servers can also trigger elicitation requests. "The server fans out elicitation requests to **all** connected clients that registered a handler — the first response wins." — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Host-initiated dialogs: `session.ui.confirm("Deploy?")`, `session.ui.select(msg, options)`, `session.ui.input(msg, { minLength, maxLength })` and `session.ui.elicitation({ message, requestedSchema })`. These need `session.capabilities.ui?.elicitation` to be true. "All UI methods throw if elicitation is not supported by the host." — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- The GA notes list "Slash commands and interactive input prompts are available in all SDKs" — [GA changelog](https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/)
- Hooks:
  - `onPreToolUse` can return `permissionDecision: "allow" | "deny" | "ask"`, `modifiedArgs` and `additionalContext`
  - `onPostToolUse` (success only) and `onPostToolUseFailure`
  - `onUserPromptSubmitted` can return `modifiedPrompt`
  - `onSessionStart`, `onSessionEnd`
  - `onErrorOccurred` can return `errorHandling: "retry" | "skip" | "abort"`
  - `onAgentStop` can return `{ decision: "block", reason }` to force another turn
  - `onSubagentStart`, `onSubagentStop`
  — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Steering: `send({ mode: "immediate" })` injects user input mid-turn without aborting; `abort()` cancels — [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)

### Inferences
- In Electron, the handler in the main process can send an IPC message to the renderer to show a question card or a form generated from `requestedSchema`, then wait on a Promise resolved by the renderer's reply. Elicitation forms map naturally onto the "fill gaps in the template" step. The agent can request exactly the missing fields, typed and with enums.
- Use `onAgentStop` to block completion until every required template field is filled or explicitly marked unknown, checked by your own validator. Watch `stopHookActive` to avoid loops.

### Gaps
- No documented timeout behavior was found for a `ask_user` call that waits a long time on a human, beyond general cancellation semantics.

---

## 5. File/document handling: attachments, images, many documents, built-in document reading

### Takeaway
Messages accept `file`, `directory`, `selection` and `blob` (base64 plus mimeType) attachments. Images are auto-resized for vision-capable models. When citations are enabled with an **Anthropic** provider, file attachments are sent as `document` blocks, and the docs show a PDF sent as a blob. No documentation says the SDK parses DOCX, XLSX or PDFs for other providers. For many heterogeneous documents, the robust approach is to convert them in your own code (pdf/docx/xlsx to text or markdown, images as attachments) and expose that through custom tools or a working directory, not to rely on raw attachments.

### Cited Findings
- Attachment union in `MessageOptions`:
  - `{ type: "file", path, displayName? }`
  - `{ type: "directory", path, displayName? }`
  - `{ type: "selection", filePath, displayName, selection?, text? }`
  - `{ type: "blob", data, mimeType, displayName? }`
  - `ExtensionContextAttachment`
  — [nodejs/src/types.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/types.ts)
- Compatibility doc: "File attachments… Images auto-encoded and resized" and "Directory attachments… Attach directory context" — [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)
- Images: JPG, PNG, GIF "and other common image types". The model must have `capabilities.supports.vision = true`, and limits come from `capabilities.limits.vision.{supported_media_types, max_prompt_images, max_prompt_image_size}`. "If an image cannot be brought within limits after processing, it is skipped and not sent to the LLM." "The agent's `view` tool can also read images directly from the filesystem" — [docs/features/image-input.md](https://github.com/github/copilot-sdk/blob/main/docs/features/image-input.md); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- PDFs and citations (experimental): "When citations are enabled and the session uses an Anthropic provider, file attachments are sent as `document` blocks with citations turned on". The example sends `{ type: "blob", data: pdfBase64, displayName: "quarterly-report.pdf", mimeType: "application/pdf" }`. Citation locations can be `char`, `page` or `block` ranges. Limitations: "Coverage depends on the model provider… Citations are only present on the final `assistant.message` event" — [docs/features/citations.md](https://github.com/github/copilot-sdk/blob/main/docs/features/citations.md)
- `sessionFs` (custom session filesystem provider) supports binary reads and writes up to about 48 MiB ("50,330,880 raw bytes"). Custom providers must implement `readFileBytes` and `writeFileBytes` "to serve images to the `view` tool" — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- The session workspace RPCs `session.rpc.workspace.listFiles/readFile/createFile` cover files in the session workspace — [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)
- Image generation is available as an experimental opt-in (`imageGeneration`) — [nodejs/src/types.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/types.ts)

### Inferences
- With dozens of uploads, attaching everything to one prompt will hit context and image-count limits. Better to:
  - extract and chunk in the app (for example with pdf parsing or docx/xlsx libraries in the main process)
  - keep an index
  - give the agent `list_documents` / `read_document` / `search_documents` tools, returning `citableSources` for traceability
  - attach only images or scans that need vision, or render PDF pages to PNG for vision models
- Infinite-session compaction helps long conversations. Still, keep extracted facts in app state (for example, a field-value map the agent updates through tools) so compaction doesn't lose them.

### Gaps
- No docs on whether the built-in `view` or `read_file` tools can read DOCX, XLSX or PDF content. No built-in document-conversion tool is documented. PDF blob support with OpenAI or Copilot-hosted models (as opposed to Anthropic BYOK or Claude models) is undocumented.
- No maximum attachment count or size for non-image files was found.

---

## 6. MCP servers (local/remote), skills, custom agents/sub-agents

### Takeaway
Supported: local stdio and remote HTTP/SSE MCP servers per session through `mcpServers`, custom agents (`customAgents`, each with its own prompt, tools and MCP servers) that the runtime delegates to as sub-agents, fleet mode for parallel sub-agents (experimental), skills from directories or an experimental programmatic `skillProvider`, and plugin directories.

### Cited Findings
- MCP config:
  ```ts
  mcpServers: {
    "my-local-server": { type: "local", command: "node", args: ["./mcp-server.js"], env: { DEBUG: "true" }, cwd: "./servers", tools: ["*"], timeout: 30000 },
    "github": { type: "http", url: "https://api.githubcopilot.com/mcp/", headers: { "Authorization": "Bearer ${TOKEN}" }, tools: ["*"] },
  }
  ```
  `disabledMcpServers: [...]` is also available. MCP tool names at runtime are `<server-key>-<tool-name>`. The doc carries the note "This is an evolving feature" (issue #36) — [docs/features/mcp.md](https://github.com/github/copilot-sdk/blob/main/docs/features/mcp.md); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Custom agents: "Each agent has its own system prompt, tool restrictions, and optional MCP servers… the Copilot runtime automatically delegates to that agent as a **sub-agent**—running it in an isolated context". Example: `customAgents: [{ name: "researcher", displayName, description, tools: ["grep","glob","view"], prompt }]`. `defaultAgent.excludedTools` hides tools from the main agent only, and `agent` preselects an agent — [docs/features/custom-agents.md](https://github.com/github/copilot-sdk/blob/main/docs/features/custom-agents.md); [docs/features/session-persistence.md](https://github.com/github/copilot-sdk/blob/main/docs/features/session-persistence.md)
- Fleet mode: "Parallel sub-agent execution", started with `session.rpc.fleet.start()` (experimental) — [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)
- Skills: `skillDirectories`, `disabledSkills`, `enableSkills`. A `skillProvider: { listSkills, readSkill }` serves skills from host storage. It is experimental, "never persisted. Pass it again to `resumeSession`", and "not supported for cloud sessions" — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)

### Inferences
- Useful for this app:
  - a "document-extractor" custom agent with only read and extract tools
  - a "template-filler" agent with only the field-writing tools
  - optionally an existing document-conversion MCP server, run as a local stdio process bundled with the app
- In-process custom tools are simpler and avoid shipping extra processes.

### Gaps
- Sub-agent cost and context behavior with large document sets is not documented.

---

## 7. Authentication, BYOK, and billing for end users

### Takeaway
Without BYOK, each end user needs a GitHub account with Copilot access, and usage bills to that user's Copilot plan. Since 2026-06-01 Copilot bills in usage-based "AI Credits" instead of premium requests. Auth options:
- the user's stored Copilot CLI credentials
- an OAuth/GitHub App user token your app obtains (`gho_`, `ghu_` or `github_pat_`; classic `ghp_` is not supported)
- environment tokens
- server-to-server org auth
- **BYOK** with OpenAI, Azure/Foundry, Anthropic, or OpenAI-compatible and local endpoints (Ollama, Foundry Local), which needs **no GitHub account or Copilot subscription**

The interactive `copilot login` device flow is CLI-only. There is a new **experimental** in-SDK login RPC (`session.rpc.accounts.login.begin/advance/cancel`, browser loopback with PKCE). Otherwise, run your own OAuth flow and pass `gitHubToken`.

### Cited Findings
- Auth method table:

  | Method | Copilot subscription required? |
  |---|---|
  | GitHub signed-in user | Yes |
  | GitHub OAuth App | Yes |
  | Environment variables | Yes |
  | Server-to-server | No user subscription; organization policy required |
  | BYOK | No |

  — [docs/auth/authenticate.md](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md)
- Signed-in user: "Users authenticate via GitHub OAuth device flow, and the SDK uses their stored credentials… Credentials are stored securely in the system keychain", from a prior `copilot` CLI login — [docs/auth/authenticate.md](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md)
- Priority order:
  1. explicit `gitHubToken`
  2. `GITHUB_COPILOT_API_TOKEN` with `COPILOT_API_URL`
  3. `COPILOT_GITHUB_TOKEN`, then `GH_TOKEN`, then `GITHUB_TOKEN`
  4. stored OAuth credentials
  5. `gh auth` credentials

  `useLoggedInUser: false` disables the fallback to stored or `gh` credentials — [docs/auth/authenticate.md](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md)
- OAuth app pattern: `new CopilotClient({ gitHubToken: userAccessToken, useLoggedInUser: false })`. Supported token prefixes are `gho_`, `ghu_` and `github_pat_`; `ghp_` is ❌. "Your application is responsible for token storage, refresh, and expiration handling." Limitations: "Each user needs an active Copilot subscription… Users must have GitHub accounts… Rate limits per user" — [docs/setup/github-oauth.md](https://github.com/github/copilot-sdk/blob/main/docs/setup/github-oauth.md); [docs/auth/authenticate.md](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md)
- Rotating tokens: a per-session `gitHubTokenProvider` callback returns `{ kind: "token", accessToken, expiresIn }`. "production tokens typically last eight hours". It cannot be combined with `gitHubToken` (v1.0.13) — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)
- Interactive login: listed under "Not available in SDK (CLI-only)" as "Login flow | `/login`, `copilot auth login` | OAuth device flow" — [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)
- Newer generated RPC, marked `@experimental`:
  - `session.accounts.login.begin` / `advance` / `cancel`, with provider kinds `githubDotCom` ("OAuth github.com sign-in via the browser (web loopback + PKCE)"), `proxima` (GitHub Enterprise Cloud `*.ghe.com`) and `entra` (Entra-derived EMU credential)
  - steps are `open-url`, `input-required`, `awaiting`, `needs-interaction`, `completed` and `error`
  - results include `needs-plaintext-consent`
  - also `account.login` (validate and store a token), `account.logout`, `account.getCurrentAuth` and `account.getAllUsers`
  — [nodejs/src/generated/rpc.ts](https://github.com/github/copilot-sdk/blob/main/nodejs/src/generated/rpc.ts)
- BYOK:
  - "allows you to use the Copilot SDK with your own API keys from model providers, bypassing GitHub Copilot authentication"
  - providers: OpenAI (`"openai"`), Microsoft Foundry/Azure OpenAI (`"openai"` or `"azure"`), Anthropic (`"anthropic"`), Ollama, Foundry Local, and other OpenAI-compatible endpoints (vLLM, LiteLLM)
  - `ProviderConfig` has `type`, `baseUrl` (required), `apiKey`, `bearerToken`, `bearerTokenProvider`, `wireApi: "completions" | "responses"` ("Anthropic models always use the Messages API"), and `azure.apiVersion`
  - `model` is **required** with a custom provider
  - Anthropic example: `provider: { type: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: process.env.ANTHROPIC_API_KEY }`
  — [docs/auth/byok.md](https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md); [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- BYOK limitations: "Only models supported by your provider are available… Subject to your provider's rate limits… Usage is tracked by your provider… Premium requests - Do not count against Copilot premium request quotas". "BYOK uses key-based authentication only. Microsoft Entra ID… managed identities… not supported", per the README FAQ. A separate repo doc does describe Azure Managed Identity through `bearerTokenProvider`, so the README FAQ may be outdated on this point. BYOK keys are not persisted and must be re-supplied on resume. `onListModels` can supply a custom model list — [docs/auth/byok.md](https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md); [README](https://github.com/github/copilot-sdk/blob/main/README.md); [docs/setup/choosing-a-setup-path.md](https://github.com/github/copilot-sdk/blob/main/docs/setup/choosing-a-setup-path.md); [docs/features/session-persistence.md](https://github.com/github/copilot-sdk/blob/main/docs/features/session-persistence.md)
- README FAQ: "a GitHub Copilot subscription is required… **unless you are using BYOK**… which includes a free tier with limited usage". "Billing… is based on the same model as the Copilot CLI, with each prompt being counted towards your usage allowance" — [README](https://github.com/github/copilot-sdk/blob/main/README.md)
- GA post: "Available to all existing GitHub Copilot subscribers, including Copilot Free for personal use. Non-Copilot users can access it via BYOK" — [GA changelog](https://github.blog/changelog/2026-06-02-copilot-sdk-is-now-generally-available/)
- Copilot billing change, effective 2026-06-01:
  - "GitHub AI Credits replace premium request units"
  - usage is measured in tokens (input, output, cached) at each model's listed API rates
  - included credits: Pro $10/mo → $10, Pro+ $39 → $39, Business $19/user → $19, Enterprise $39/user → $39 (Business/Enterprise pooled; admins can set budgets)
  - "Fallback to a lower-cost model when limits are reached is no longer available"
  - annual Pro/Pro+ stays on premium-request pricing until renewal

  The announcement does not mention the SDK or BYOK specifically — [GitHub Changelog 2026-04-27](https://github.blog/changelog/2026/04/27/github-copilot-is-moving-to-usage-based-billing/)
- SDK billing surface:
  - `session.rpc.usage.getMetrics()` returns `totalNanoAiu` (cost in nano-AI units) and `totalPremiumRequestCost`
  - `client.rpc.models.list({})` returns `billing.tokenPrices` and `billing.multiplier`
  - `client.rpc.account.getQuota({})` returns `quotaSnapshots` keyed by `premium_interactions`, `chat`, `completions`
  - `assistant.usage` and `session.usage_info` events
  - several of these RPCs are marked experimental
  - "Price values change… never hard-code"
  — [docs/features/usage-and-billing.md](https://github.com/github/copilot-sdk/blob/main/docs/features/usage-and-billing.md)
- An open feature request (#182, opened 2026-01-25, still open) asks for "User-Delegated Billing… for Third-Party Applications" and a simpler non-agentic prompt/response mode. It is assigned to a maintainer, but no maintainer has stated a policy — [Issue #182](https://github.com/github/copilot-sdk/issues/182). Note: the OAuth docs, written later, do describe per-user tokens billed to "each user's subscription", which partly addresses the request — [docs/setup/github-oauth.md](https://github.com/github/copilot-sdk/blob/main/docs/setup/github-oauth.md)
- A third-party guide claims that "applications that must serve users without Copilot access cannot use the SDK as-is" ([agentpatterns.ai](https://agentpatterns.ai/tools/copilot/copilot-sdk/), via search snippet). The official docs contradict this for BYOK ([docs/auth/authenticate.md](https://github.com/github/copilot-sdk/blob/main/docs/auth/authenticate.md)).

### Inferences
- End users **without** Copilot can use the app through BYOK: the user enters their own OpenAI or Anthropic key, or the vendor supplies a key, possibly through the vendor's own proxy at an OpenAI-compatible `baseUrl` with `bearerTokenProvider`. Then GitHub billing doesn't apply and no GitHub account is needed. Supporting both modes is straightforward: "Sign in with GitHub" uses Copilot AI Credits, and "Use your own API key" uses BYOK.
- Embedding a vendor API key in a distributed desktop binary is insecure. Prefer a vendor-run proxy that issues short-lived bearer tokens, or user-supplied keys stored in the OS keychain through Electron `safeStorage`.
- For GitHub sign-in in a desktop app, the stable path is your own OAuth/GitHub App flow (device flow, or loopback with PKCE), then `gitHubToken` or `gitHubTokenProvider`. The experimental `session.accounts.login.*` RPC could remove that work, but carries churn risk.
- Organizational users on Copilot Business or Enterprise may have model, MCP and permission policies applied (managed settings). The app should handle policy-denied tools and models gracefully.

### Gaps
- Whether SDK usage under Copilot Free is limited to "personal use", and what that means for a commercial app used by employees, is not clearly defined in the SDK docs. Exact Copilot Free AI-credit allotments were not found.
- How a GitHub OAuth App or GitHub App gets its tokens accepted for Copilot (for example, required scopes or app approval) is not spelled out in the sections read.

---

## 8. Licensing / terms: embedding in a distributed commercial desktop app

### Takeaway
The SDK source is MIT-licensed. GitHub positions the SDK explicitly for ISVs ("App developer (ISV): You're building a product for customers"), with GitHub OAuth or BYOK. No SDK-specific restriction on commercial distribution was found. Copilot model usage through a user's account is governed by GitHub's Copilot terms: ToS Section J for individuals, the Generative AI Services Terms for Business/Enterprise bought from GitHub, and Microsoft Product Terms when bought through Microsoft. Account-sharing rules apply: one login per person, and no sharing tokens to beat rate limits.

### Cited Findings
- SDK license: "MIT License — Copyright GitHub, Inc." — [LICENSE](https://github.com/github/copilot-sdk/blob/main/LICENSE); package.json `"license": "MIT"` — [nodejs/package.json](https://github.com/github/copilot-sdk/blob/main/nodejs/package.json)
- ISV positioning: "🚀 App developer (ISV) — You're building a product for customers. You need to handle authentication for your users—either through GitHub or by managing identity yourself. Start with: GitHub OAuth… BYOK… Backend Services" — [docs/setup/choosing-a-setup-path.md](https://github.com/github/copilot-sdk/blob/main/docs/setup/choosing-a-setup-path.md)
- Terms routing: "For GitHub Copilot Business and Copilot Enterprise license holders who purchase directly from GitHub, your use… is governed by the GitHub Generative AI Services Terms… If you purchase through Microsoft… Microsoft's Product Terms… For all other GitHub Copilot users… Section J (AI Features) of the GitHub Terms of Service." (Version Effective Date 2026-08-27) — [GitHub Terms for Additional Products and Features](https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features)
- GitHub ToS (effective 2026-04-27):
  - Section J covers ownership ("GitHub does not claim ownership of your Input or Output"), training on Inputs/Outputs for individual licenses unless the user opts out, and "You are responsible for reviewing, testing, and validating any Output"
  - Section B: "a single login may not be shared by multiple people"
  - Section H: "You may not share API tokens to exceed GitHub's rate limitations"
  - nothing directly addresses offering GitHub services to third parties beyond the API-resale language
  — [GitHub Terms of Service](https://docs.github.com/en/site-policy/github-terms/github-terms-of-service)
- Integrator attribution: `GITHUB_COPILOT_INTEGRATION_ID` sets a `Copilot-Integration-Id` header (default `copilot-developer-cli`) on Mission Control requests, and `clientInfo` attributes telemetry to your application — [docs/setup/multi-tenancy.md](https://github.com/github/copilot-sdk/blob/main/docs/setup/multi-tenancy.md); [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)

### Inferences
- Commercial distribution of the SDK code looks fine under MIT. The open questions are (a) the license of the bundled Copilot CLI runtime binaries, and (b) whether sending end users' document content to Copilot under *their* GitHub account is acceptable to them and their org. Individual-plan inputs may be used for training unless the user opts out.
- With a BYOK provider, the provider's terms (OpenAI, Anthropic, Azure) govern model usage and data handling, not GitHub's Copilot terms.
- Using a single shared vendor GitHub token for all end users would likely conflict with the one-login-per-person rule and Copilot seat licensing. Use per-user auth or BYOK.

### Gaps
- No SDK-specific product terms page, redistribution clause for the bundled runtime, or "Copilot in third-party apps" policy was found. Legal review is advised. The license text inside the `@github/copilot-sdk-<platform>` packages was not inspected.

---

## 9. Known limitations, issues, community sentiment, samples

### Takeaway
The SDK is capable but fast-moving and coding-centric. Many useful pieces are still experimental or preview: structured output, citations, in-process runtime, `setTools`, skill providers, login RPC, usage metrics RPCs. Official samples target coding and dev workflows. No Electron or document-processing sample was found. Community sentiment specific to the SDK is thin in sources found; most published reviews are about Copilot the product.

### Cited Findings
- Experimental or preview flags:
  - structured output (preview)
  - citations ("experimental in every SDK and are not covered by compatibility guarantees")
  - in-process hosting (experimental)
  - `setTools` (experimental)
  - skill providers (experimental)
  - `session.quota`, `usage.getMetrics`, `metadata.contextInfo` (experimental)
  - fleet mode, agent management, manual compaction, fork (experimental)
  — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md); [docs/features/citations.md](https://github.com/github/copilot-sdk/blob/main/docs/features/citations.md); [docs/features/usage-and-billing.md](https://github.com/github/copilot-sdk/blob/main/docs/features/usage-and-billing.md); [docs/troubleshooting/compatibility.md](https://github.com/github/copilot-sdk/blob/main/docs/troubleshooting/compatibility.md)
- Breaking changes have occurred inside 0.x and 1.x minor lines. Example: "⚠️ Breaking change (Node.js): The `onElicitationRequest` handler signature changed from two arguments… to a single `ElicitationContext`" — [CHANGELOG.md](https://github.com/github/copilot-sdk/blob/main/CHANGELOG.md)
- The Node cookbook lists Error Handling, Multiple Sessions, Managing Local Files (AI grouping of files by metadata), PR Visualization (GitHub MCP) and Persisting Sessions. The page says "This README is a scaffold; recipe files are placeholders until populated" — [awesome-copilot cookbook (Node)](https://github.com/github/awesome-copilot/blob/main/cookbook/copilot-sdk/nodejs/README.md)
- The repo ships an interactive chat sample (`nodejs/samples`, `npm start`) and a `samples/runtime-host` sample — [nodejs/README.md](https://github.com/github/copilot-sdk/blob/main/nodejs/README.md)
- Community Electron write-up from January 2026, covered in section 1: "Documentation was sparse… few concrete samples", plus packaging trouble fixed with CLI server mode — [Elio Struyf](https://www.eliostruyf.com/exploring-github-copilot-sdk-building-ghostwriter-app/)
- Open feature requests include #182 (user-delegated billing and a simple non-agentic mode) and #1896 (mutating a live session's tool list, re-triage of #735, opened 2026-07-02, now partly addressed by experimental `setTools`) — [Issue #182](https://github.com/github/copilot-sdk/issues/182); [issues search](https://github.com/github/copilot-sdk/issues?q=is%3Aissue%20electron)
- A Japanese GA hands-on (TypeScript custom tools plus pricing investigation) exists — [DevelopersIO / classmethod](https://dev.classmethod.jp/articles/shoma-github-copilot-sdk-ga-typescript-hello-world-to-custom-tools-pricing/) (title from search results only; not read)
- General Copilot product reviews from 2026 mention context loss in long conversations and limits being hit under agent use. These are about Copilot the product, not the SDK — [nxcode review](https://www.nxcode.io/resources/news/github-copilot-review-2026-worth-10-dollars) (search snippet only)

### Inferences
- Pin `@github/copilot-sdk` to an exact version, keep the runtime bundled (don't rely on the user's CLI), and wrap SDK calls behind your own interface so you can switch providers or SDKs.
- Budget engineering time for de-"coding-agent"-ing: customizing the system prompt, filtering tools, and handling the default `mode: "copilot-cli"` behaviors such as custom-instruction discovery, the session store and memory.

### Gaps
- No Hacker News or Reddit discussion specifically about the Copilot SDK turned up in searches. The open issue count and the main recurring bugs were not gathered, because GitHub API access to the repo was blocked in this environment.

---

## 10. Brief comparison to alternatives (only where relevant)

### Takeaway
The Copilot SDK's distinctive value is a production agent runtime (planning, compaction, sub-agents, hooks, permissions, MCP), plus billing through users' own Copilot plans, with BYOK as a fallback. The costs are a heavy bundled native runtime, a coding-agent heritage, and a dependency on GitHub accounts and plans for the non-BYOK path. This section's comparisons come mostly from background knowledge and were **not re-verified as of October 2026**.

### Cited Findings
- The Copilot SDK "exposes the same engine behind Copilot CLI… No need to build your own orchestration—you define agent behavior, Copilot handles planning, tool invocation, file edits, and more" — [README](https://github.com/github/copilot-sdk/blob/main/README.md)
- BYOK supports Anthropic, OpenAI, Azure/Foundry and local models, so the model choice is not locked to Copilot-hosted models — [docs/auth/byok.md](https://github.com/github/copilot-sdk/blob/main/docs/auth/byok.md)

### Inferences (unverified background knowledge; check against the other researchers' notes)
- **Claude Agent SDK**: a similar "agent harness as a library" model (Claude Code runtime, built-in tools, hooks, MCP, a user-question tool). It typically needs Anthropic API, Bedrock or Vertex billing, with no "use the end user's existing subscription" path like Copilot's. It also bundles a CLI runtime, with similar packaging considerations.
- **OpenAI Agents SDK (JS)**: a lightweight pure-JS library with no bundled binary. It has handoffs, guardrails and human-in-the-loop tool approvals, but you implement compaction, persistence and file tools yourself. Billing goes to your OpenAI key.
- **Vercel AI SDK**: the lightest option, pure TS and provider-agnostic, with strong structured output (`generateObject`/Zod) and tool calling. You build the agent loop, the ask-user flow and persistence yourself. It is a good fit if the Copilot runtime proves too heavy, or if structured output reliability through Copilot's preview feature is insufficient.
- What you'd **lose** by leaving Copilot SDK: billing through users' Copilot plans, built-in infinite-session compaction, elicitation-based `ask_user`, and enterprise managed-policy integration. What you'd **gain**: a smaller app (no ~130–145 MB runtime per platform), fewer native-binary packaging issues, and a less coding-centric default behavior.

### Gaps
- No fresh October 2026 sources on the alternatives were consulted (outside this task's scope). Rely on the other research notes for exact current features.
