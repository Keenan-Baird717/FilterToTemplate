# Desktop application framework, UI stack, local storage and packaging for a Node 24 Copilot-SDK desktop app (as of 2026-10-11)

Method note: package versions marked "npm, 2026-10-11" come from live `npm view` queries against registry.npmjs.org run on 2026-10-11 (links point to the npm package page). Items marked "local test" were checked by downloading the official Electron v44.7.0 linux-x64 binary and running small scripts against it in this session. Everything else is cited inline. Some third-party and aggregator sources are labeled as such.

## Q1. Desktop shell: Electron vs Tauri 2 vs Electrobun vs others, when the core agent SDK only runs on Node

### Takeaway
Electron is the clear choice. Every supported Electron line (42, 43, 44, and the upcoming 45/46) ships Node 24, so the Copilot SDK (Node `^20.19 || >=22.12`) runs unchanged in a utilityProcess with full npm/native-module support. The Copilot SDK also bundles a ~133 MB native runtime per platform, which wipes out most of the bundle-size advantage that Tauri or Electrobun would otherwise have. Use Electron 44.x now (Node 24.21.0, Chromium 152) and move to 45 after it ships on 2026-10-20. Most first-tier AI desktop apps (Claude, Codex, ChatGPT for Windows, Cursor, Windsurf, VS Code) run on Electron.

### Cited Findings
**Electron versions and their Node**
- Electron 40.0.0 (January 2026) was the first release on Node 24: Chromium 144.0.7559.60, Node v24.11.1, V8 14.4. Before that, Electron 39 used Node v22.20.0 and Chromium 142. — [Electron 40 blog](https://www.electronjs.org/blog/electron-40-0)
- Electron 44.0.0 shipped 2026-08-25 with Chromium 152.0.7977.54, Node v24.18.1 and V8 15.2. Breaking changes: macOS 13+ is now required (macOS 12 dropped); Windows x86 and Linux armv7l prebuilts were removed; the `clipboard` module is no longer available in renderer processes and its read/write API was reworked to follow W3C async Clipboard semantics; ANGLE is statically linked. New in 44: `windowStatePersistence`. Electron 41.x reached end of support with this release. — [Electron 44 blog](https://www.electronjs.org/blog/electron-44-0)
- The npm `latest` dist-tag is **electron 44.7.0** (published 2026-10-07). Other current lines: `43-x-y` 43.7.9, `42-x-y` 42.11.12. `beta` is 45.0.0-beta.1. Electron 40.0.0 was published 2026-01-16, 41.0.0 on 2026-03-11, 42.0.0 on 2026-05-06, 43.0.0 on 2026-06-30, and 44.0.0 on 2026-08-25. — [npm electron](https://www.npmjs.com/package/electron) (npm, 2026-10-11)
- Local test: in the Electron 44.7.0 binary, `process.versions` reports node **24.21.0**, chrome **152.0.7977.130**, v8 15.2.124.28-electron.0, and bundled sqlite **3.53.4**. Patch releases inside a major line therefore pick up newer Node 24 minors (44.0.0 shipped 24.18.1). — local test of [Electron v44.7.0 release binary](https://github.com/electron/electron/releases/tag/v44.7.0)
- Official schedule (dates are goals; prerelease Node/Chromium values are estimates):

  | Line | Stable | EOL | Chromium | Node |
  |---|---|---|---|---|
  | 42 | 2026-05-05 | 2026-10-20 | M148 | v24.15.0 |
  | 43 | 2026-06-30 | 2027-01-05 | M150 | v24.17.0 |
  | 44 | 2026-08-25 | 2027-03-02 | M152 | v24.18.1 |
  | 45 | 2026-10-20 | 2027-04-27 | M156 | v24.21.0 |
  | 46 | 2027-01-05 | 2027-06-22 | M160 | v24.21.0 (est.) |

  — [Electron release schedule](https://releases.electronjs.org/schedule)
- Electron 45.0.0-beta.1 (released 2026-10-08) ships Node 24.21.0, Chromium 156.0.8078.12 and V8 15.6.75.8. — [releases.electronjs.org v45.0.0-beta.1](https://releases.electronjs.org/release/v45.0.0-beta.1)
- Electron supports the latest three stable majors. It moves `main` to an even-numbered Node.js version when that version enters Active LTS, and it targets even-numbered Chromium versions. — [Electron timelines doc](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)

**Copilot SDK packaging facts that bear on the shell choice**
- `@github/copilot-sdk` 1.0.19 (1.0.0 published 2026-06-02) declares `engines.node: "^20.19.0 || >=22.12.0"`. Its dependencies are `zod 4.3.6`, `koffi 3.2.1` (a native FFI library) and `vscode-jsonrpc 8.2.1`, plus eight `@github/copilot-sdk-<platform>` optionalDependencies (darwin/win32/linux x64+arm64, linuxmusl x64+arm64). — [npm @github/copilot-sdk](https://www.npmjs.com/package/@github/copilot-sdk) (npm, 2026-10-11)
- SDK README: the platform package "contain[s] the Copilot CLI runtime for the host platform... so starting the SDK performs no runtime download. Set `COPILOT_CLI_PATH` to use an existing installation instead." Connection options are `RuntimeConnection.forStdio()` (the default: spawn the runtime and talk over stdin/stdout), `forTcp()`, `forUri()`, and `forInProcess()`, which is "**Experimental**" and hosts the runtime in-process over a native C ABI (FFI). "Managed child-process connections materialize the bundled `copilot-runtime` and adjacent `runtime.node`, then launch the wrapper by default." — [@github/copilot-sdk README (npm tarball 1.0.19)](https://www.npmjs.com/package/@github/copilot-sdk)
- Tarball inspection of `@github/copilot-sdk-linux-x64@1.0.19` shows `prebuilds/linux-x64/copilot-runtime` (~0.5 MB launcher), `prebuilds/linux-x64/runtime.node` (~133 MB native addon), plus `ripgrep/bin/linux-x64/rg` (~5.7 MB) and `tgrep` (~7.9 MB). The darwin-arm64 package is about 127 MB unpacked. In the SDK source, `runtimeArtifacts.js` copies these into a per-user cache: `%LOCALAPPDATA%\github-copilot-sdk\runtime` on Windows, `~/Library/Caches/github-copilot-sdk/runtime` on macOS, and `$XDG_CACHE_HOME/github-copilot-sdk/runtime` on Linux. — [npm @github/copilot-sdk-linux-x64](https://www.npmjs.com/package/@github/copilot-sdk-linux-x64) (tarball inspected 2026-10-11)
- The separate `@github/copilot` CLI package (1.0.95; 1.0.0 published 2026-03-06) also ships per-platform native binaries, about 165 MB unpacked for darwin-arm64. — [npm @github/copilot](https://www.npmjs.com/package/@github/copilot)
- The SDK team opened an ADR issue on "which runtime binary bundling strategy to select" (closed 2026-07-06). — [github/copilot-sdk#1921](https://github.com/github/copilot-sdk/issues/1921)

**Tauri 2**
- `@tauri-apps/cli` latest is 2.12.2. Tauri 2.0.0 was published 2024-10-02. — [npm @tauri-apps/cli](https://www.npmjs.com/package/@tauri-apps/cli) (npm, 2026-10-11)
- The official Tauri guide "Node.js as a sidecar" compiles the Node app into a self-contained binary with `pkg`, registers it under `bundle > externalBin` with target-triple file names, and launches it through the shell plugin's sidecar API. The guide notes that embedding the full Node runtime plus JS as resources is an alternative but is usually larger. It is desktop-only. — [Tauri v2: Node.js as a sidecar](https://v2.tauri.app/learn/sidecar-nodejs/)
- A third-party vendor's integration note warns that `pkg` / `bun build --compile` sidecars break SDKs that locate native binaries relative to their own JS file at runtime. Its recommended workaround is to ship an official Node binary through `externalBin`, with the script and `node_modules` as resources. It also says the guide's `.output()` example is for one-shot commands, and long-lived sidecars need different lifecycle handling. — [Recall.ai: Integrating with non-Electron apps](https://docs.recall.ai/docs/integrating-with-non-electron-apps)
- 2026 comparison blogs report Tauri "Hello World" at about 3.2 MB vs 85 MB for Electron 34.x, idle RAM around 42 MB vs 168 MB, and cold start around 380 ms vs 1,420 ms. Other guides give typical ranges of 2–10 MB vs 80–200 MB. These are community, non-reproducible benchmarks, and the sources disagree on which Electron version they tested. — [Tech Insider: Tauri vs Electron 2026](https://tech-insider.org/tauri-vs-electron-2026/); [PkgPulse: Electron vs Tauri 2026](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)
- The same comparisons note that Tauri pushes more work into per-OS WebView compatibility testing and Rust/native-command ownership, while Electron keeps the advantage in ecosystem maturity and consistent rendering. — [PkgPulse](https://www.pkgpulse.com/guides/electron-vs-tauri-2026)

**Electrobun**
- npm `electrobun` latest is 2.0.2, described as "The lightweight npm bootstrap for Electrobun and Hutch." Releases v1.x through v1.18.x betas preceded it. — [npm electrobun](https://www.npmjs.com/package/electrobun); [newreleases: electrobun v1.18.4-beta](https://newreleases.io/project/github/blackboardsh/electrobun/release/v1.18.4-beta.12)
- Official site, 2.x: the main process runs on "Cottontail", Electrobun's default TypeScript runtime (Bun, Zig, Rust, Go and Odin are also supported). It explicitly avoids bundling Node, uses the system webview by default with CEF optional, and has built-in verified updates with rollback. No production users are named. — [Electrobun docs](https://framework.blackboard.sh/electrobun/)
- v1.0 reportedly shipped in February 2026. Sources conflict on Windows/Linux maturity. — [aicoolies listing (aggregator)](https://aicoolies.com/tools/electrobun); [Mewayz blog (aggregator)](https://mewayz.com/en/blog/electrobun-v1-build-fast-tiny-and-cross-platform-desktop-apps-with-typescript)

**What real AI desktop apps use**
- Claude desktop is Electron. Boris Cherny (Claude Code team) said engineers who had worked on Electron preferred it for shared cross-platform code. — [dbreunig: Why is Claude an Electron app?](https://www.dbreunig.com/2026/02/21/why-is-claude-an-electron-app.html). John Gruber's July 2026 post criticizes the app's quality (opinion). — [Daring Fireball](https://daringfireball.net/2026/07/claudes_criminally_bad_mac_app_is_an_inside_job)
- The OpenAI Codex desktop app (launched February 2026, Mac first) is built in Electron "specifically so we can support Windows and Linux as well," per an OpenAI team member. The Windows version shipped in March 2026. — [Simon Willison](https://simonwillison.net/2026/Feb/2/introducing-the-codex-app/); [DevClass](https://www.devclass.com/development/2026/02/05/openai-codex-app-looks-beyond-the-ide-devs-ask-why-mac-only/4090132); [TechRepublic](https://www.techrepublic.com/article/news-openai-codex-windows-app-launch/)
- A May 2026 audit found: ChatGPT desktop is Electron on Windows (~260 MiB) and native Swift on macOS. Codex Desktop is Electron (~330 MiB Apple Silicon DMG). Cursor and Windsurf are Electron (VS Code forks). Notion, Linear, Slack, Discord, Figma and VS Code are Electron. Raycast is fully native AppKit/Swift. Teams and WhatsApp moved to WebView2, Zed is Rust-native, and AFFiNE moved back from Tauri to Electron. — [CodeNote: 2026 audit of famous Electron apps](https://codenote.net/en/posts/famous-electron-apps-2026-research/)
- A third-party app-analysis site lists LM Studio as an Electron app (Electron 38.6.0); there is no official LM Studio confirmation. — [desktopinsights: LM Studio](https://desktopinsights.com/apps/lm-studio)

### Inferences
- **Electron is the best fit when the core SDK runs only on Node.** Electron's utilityProcess is a real Node 24 runtime (local test: ESM entry, `node:sqlite` and `child_process` all work). The Copilot SDK's default stdio transport spawns its runtime as a child process, which works from a utilityProcess with no extra runtime shipped.
- **Tauri's size advantage disappears here.** You would still ship the ~127–133 MB Copilot runtime per platform, plus either a `pkg`-compiled Node or an official Node binary (roughly 40–100+ MB) as a sidecar. The final size is then close to Electron's (~100 MB Chromium plus ~130 MB runtime), but you would also own two languages (Rust and TS), a custom sidecar lifecycle, and per-OS WebView differences (WebView2, WKWebView, WebKitGTK). The Recall.ai warning about `pkg` and SDKs that resolve native files relative to their JS applies directly, because the Copilot SDK materializes `runtime.node` from its platform package. The Tauri sidecar route therefore needs the "official Node binary plus node_modules as resources" variant.
- **Electrobun is a poor fit.** Its default runtime is not Node, it explicitly avoids bundling Node, and it has no named production users. Running a Node-only SDK with a koffi native dependency there is unproven.
- **Neutralino, Wails and similar shells** have the same problem as Tauri (no in-process Node) and were not researched further.
- **Memory.** Electron's idle overhead (roughly 150–170 MB per the blog figures) is acceptable for a productivity app in the Linear/ChatGPT/Claude class. Those apps are the target polish level and they are Electron.
- **Version pin.** Use `electron@^44.7.0` today. Plan to move to 45.x shortly after 2026-10-20. Both lines stay on Node 24.x, which satisfies the hard Node 24 requirement through at least mid-2027, since Electron 46 is also estimated at Node 24.21.0. Note that Electron 44 requires macOS 13+ and drops 32-bit Windows.

### Gaps
- No official Electron statement yet on when `main` moves to Node 26. Node 26 enters Active LTS on 2026-10-28, so it could arrive around Electron 47. The schedule still shows 46 on Node 24 as an estimate.
- No reliable, controlled 2026 benchmark of Electron vs Tauri memory for a real AI-chat-sized app.
- I found no official Copilot SDK guidance on Electron, or any example of it running inside Electron or Tauri. The ADR issue #1921 body was not read.
- Neutralino and Wails were not researched.

## Q2. Electron best practices in 2026: process model, security, typed IPC, utilityProcess for agent work, ESM

### Takeaway
Use a three-tier model:
1. A thin **main** process for windows, lifecycle, the protocol handler and an IPC broker.
2. One or more **utilityProcess** workers that host the Copilot SDK agent and the heavy document ingestion.
3. A **sandboxed, context-isolated renderer** that talks to the workers over typed IPC and MessagePorts.

Main and utilityProcess entries can be ESM. Preloads must stay CJS, or be bundled into a single non-ESM file, because sandboxed preloads cannot be ESM.

### Cited Findings
- `utilityProcess.fork(modulePath, args, options)` creates a child process with Node.js and message ports enabled. It works like `child_process.fork` but is launched through Chromium's Services API, and it can only be called after `ready`. Options include `serviceName`, which is shown in app metrics and `child-process-gone`. `stdio` covers stdout/stderr only (stdin must be `ignore`). Other options are `env`, `execArgv`, `cwd`, `allowLoadingUnsignedLibraries` (macOS), `respondToAuthRequestsFromMainProcess`, `session` and `partition`. Main can pass `MessagePortMain` objects with `child.postMessage(msg, [ports])`; the child receives them on `process.parentPort`. — [Electron utilityProcess API](https://www.electronjs.org/docs/latest/api/utility-process)
- Local test (Electron 44.7.0, `"type": "module"` app): an ESM `.mjs` utilityProcess entry ran with Node 24.21.0. Inside it, `node:sqlite` worked (SQLite 3.53.4), `child_process.spawnSync` worked, and `process.features.typescript === "strip"`. It messaged main through `process.parentPort.postMessage`. — local test of [Electron v44.7.0](https://github.com/electron/electron/releases/tag/v44.7.0)
- ESM is supported since Electron 28.0.0. In main, "make sure to `await` every Promise that you need to execute before the `ready` event". The renderer uses Chromium's ESM loader and cannot import Node built-ins or `node_modules` without a bundler. For preloads, "Preload scripts will ignore `"type": "module"` fields" (use `.mjs`), and "Sandboxed preload scripts are run as plain JavaScript without an ESM context," so ESM preloads require an unsandboxed renderer. — [Electron ESM tutorial](https://www.electronjs.org/docs/latest/tutorial/esm)
- Security defaults: `contextIsolation` has defaulted to on since Electron 12, the renderer sandbox since Electron 20, and `nodeIntegration` has been off since Electron 5. The 20-item checklist includes: enable context isolation and sandboxing; set a restrictive CSP (`script-src 'self'`); limit navigation and new windows; don't call `shell.openExternal` with untrusted content; validate the sender of every IPC message ("any web frame can send IPC messages to the main process"); prefer custom protocols over `file://`; review fuses (e.g. disable `runAsNode` and `nodeCliInspect` with `@electron/fuses`); don't expose raw Electron APIs to web content. — [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- `webUtils.getPathForFile(file)` replaced the old non-standard `File.path` property. It is called in the preload, and the docs advise against exposing full file paths to web content where possible. — [Electron webUtils](https://www.electronjs.org/docs/latest/api/web-utils)
- Typed-IPC library status (npm, 2026-10-11):
  - `electron-trpc` 0.7.1: last published 2024-12-07.
  - `trpc-electron` 0.1.2: a tRPC v11-compatible fork, peer `@trpc/server >=11`, last published 2025-01-06.
  - `@electron-toolkit/typed-ipc` 1.0.2: last published 2024-11-11.
  - `@electron-toolkit/preload` 3.0.2 / `@electron-toolkit/utils` 4.0.0: last modified in early/mid 2025.
  - By contrast, `@trpc/server` 11.19.0 (2026-09-17) and `@orpc/server` 1.15.5 (2026-10-09) are actively maintained.

  — [npm electron-trpc](https://www.npmjs.com/package/electron-trpc); [npm trpc-electron](https://www.npmjs.com/package/trpc-electron); [npm @electron-toolkit/typed-ipc](https://www.npmjs.com/package/@electron-toolkit/typed-ipc); [npm @orpc/server](https://www.npmjs.com/package/@orpc/server)
- Electron 44 removed `clipboard` from renderer processes. Renderer copy buttons must use the web Clipboard API or IPC to main. — [Electron 44 blog](https://www.electronjs.org/blog/electron-44-0)

### Inferences
- **Recommended process layout:**
  - **main**: BrowserWindow, menu/tray, custom `app://` protocol for the renderer bundle (not `file://`), IPC routing, safeStorage, auto-updater. Keep CPU work out of it.
  - **utilityProcess "agent"** (`serviceName: 'copilot-agent'`): hosts `CopilotClient` with the default stdio connection, so the runtime is a grandchild process. It owns session state, emits streaming events, and receives "ask user" answers.
  - **utilityProcess "ingest"**: parses PDFs/DOCX, extracts text, chunks content and writes to SQLite. Concurrency can be bounded with `worker_threads` inside it.
  - **renderer**: React UI only. `sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`. A preload exposes a small typed API through `contextBridge`.
- **Streaming path.** Give the renderer a direct `MessagePort` to the agent utilityProcess: main creates a `MessageChannelMain`, sends one port to the renderer with `webContents.postMessage` and the other to the utility with `child.postMessage`. Token and tool events then skip the main-process hop and cannot jank window management.
- **Typed IPC.** The Electron-specific tRPC adapters are stale (last publish 2024 / early 2025). A low-risk 2026 approach is a hand-written contract: a shared `packages/ipc-contract` with zod 4 schemas, typed `invoke`/`on` wrappers in the preload, and a discriminated-union event stream over the MessagePort. If an RPC framework is preferred, oRPC or tRPC v11 over a custom MessagePort link are candidates, but neither was verified for Electron here.
- **Drag-and-drop for hundreds of files.** Never read file bytes in the renderer. Call `webUtils.getPathForFile` in the preload and send paths to main/ingest, which copies files into the app data dir and processes them off the UI thread.
- **Agent permissions.** Handle the Copilot runtime's tool permission requests in the agent process and surface them as approval cards in the UI rather than auto-approving. Set `workingDirectory` and `baseDirectory` (the SDK's `COPILOT_HOME`) to app-owned directories under `app.getPath('userData')` so the agent stays sandboxed to the project.

### Gaps
- Electron's utilityProcess doc does not explicitly state ESM entry support. It was verified only by the local Linux test, not on macOS or Windows.
- No first-party Electron guidance was found on renderer↔utilityProcess MessagePort patterns beyond the API reference (the MessageChannelMain docs were not fetched).
- oRPC's Electron/MessagePort adapter support was not verified.

## Q3. Build tooling: electron-vite vs Electron Forge (Vite plugin) vs electron-builder; TypeScript; monorepo

### Takeaway
**electron-vite 5 for dev/build plus electron-builder 26 for packaging, signing and updates** is the most practical combination for a polished closed-source app. Electron Forge 8.0.1 (an ESM rewrite on Vite 8, released 2026-09-29) is the official, fully first-party alternative and a reasonable choice if you prefer Electron-maintained tooling. Stable electron-vite 5 caps at Vite 7; Vite 8 needs the electron-vite 6 beta.

### Cited Findings
- **electron-vite** latest is 5.0.0 (published 2025-12-07); the `beta` tag is 6.0.0-beta.8 (2026-10-10). The 5.0.0 peer is `vite: "^5.0.0 || ^6.0.0 || ^7.0.0"`, and 6.0.0-beta.8 adds `^8.0.0`. Engines: Node `^20.19.0 || >=22.12.0`. — [npm electron-vite](https://www.npmjs.com/package/electron-vite) (npm, 2026-10-11)
- electron-vite features: a single `electron.vite.config` with `main`/`preload`/`renderer` sections, HMR for the renderer and hot reload for main/preload, multi-threading through import suffixes, main-process asset handling, an "isolated build" mode "for better sandbox support," and V8 bytecode compilation for source protection. — [electron-vite guide](https://electron-vite.org/guide/)
- **Electron Forge** `@electron-forge/cli` latest is 8.0.1 (8.0.0 published 2026-09-29), engines Node `>= 22.13.0`. — [npm @electron-forge/cli](https://www.npmjs.com/package/@electron-forge/cli) (npm, 2026-10-11)
- Forge 8 notes:
  - All first-party packages are ESM, and Node ≥22.12 is required for `require(esm)`.
  - `init` moved to `create-electron-app`.
  - The Vite plugin moved to Vite 7 and then Vite 8 (Rolldown-based), and dev/prod builds run in subprocesses.
  - Templates switched from ESLint/Prettier to the oxc toolchain and use `moduleResolution: bundler`.
  - MakerPKG gained notarization.
  - `@electron/*` dependencies got new majors: asar v4, notarize v3, osx-sign v2, packager v19, rebuild v4, windows-sign v2.
  - Forge 7.11 had marked the Vite plugin "experimental", and the v8 notes don't confirm it is now stable. "ESM bundling support for the Vite plugin" was listed as future work in alpha.6.

  — [Electron Forge releases](https://github.com/electron/forge/releases)
- **electron-builder** latest is 26.15.3 (2026-10-08) and electron-updater is 6.8.9. — [npm electron-builder](https://www.npmjs.com/package/electron-builder); [npm electron-updater](https://www.npmjs.com/package/electron-updater) (npm, 2026-10-11)
- Electron's own code-signing docs say "Electron Forge is the recommended route" and describe Forge as using `@electron/packager`, `@electron/osx-sign`, `@electron/notarize` and `@electron/windows-sign`. — [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- Toolchain versions (npm, 2026-10-11):
  - vite 8.3.4 (8.0.0 published 2026-03-12)
  - typescript 7.0.2 (the native Go compiler; 7.0.2 published 2026-07-08; 6.0.x was the previous line)
  - `@vitejs/plugin-react` 6.1.2
  - turbo 2.11.7
  - pnpm 12.11.2
  - `@electron/rebuild` 4.2.1
  - `@electron/fuses` 2.1.3

  — [npm vite](https://www.npmjs.com/package/vite); [npm typescript](https://www.npmjs.com/package/typescript); [npm turbo](https://www.npmjs.com/package/turbo); [npm pnpm](https://www.npmjs.com/package/pnpm)
- TypeScript 7.0 is "the first stable version... to ship its long-in-development native compiler" (Go), with roughly 8–12× faster builds. Code that compiles cleanly on 6.0 (with `stableTypeOrdering`, without `ignoreDeprecations`) should compile identically, but 6.0 deprecations become hard errors. Pre-release reports said the old JS compiler API ("Strada") is not supported and a replacement API is still in development. — [ADTmag, 2026-07-10](https://adtmag.com/articles/2026/07/10/microsoft-bets-typescript-future-on-a-native-compiler.aspx); [InfoQ](https://infoq.com/news/2026/08/typescript-7-released/)

### Inferences
- **Choose electron-vite + electron-builder** for the best DX: one Vite config for main/preload/renderer, hot reload of main and preload, and the sandbox-friendly isolated preload build. electron-builder adds NSIS + DMG + AppImage targets, electron-updater with private feeds, `azureSignOptions`, and automatic asar smart-unpack of native files (see Q4). Stay on Vite 7 with electron-vite 5, or adopt electron-vite 6 beta to get Vite 8/Rolldown.
- **Choose Forge 8** if you want everything first-party and maintained by Electron, accept the Vite plugin's uncertain stability label, and are fine with Squirrel.Windows/MSIX plus update.electronjs.org (public repos only) or a custom update server.
- **Suggested monorepo** (pnpm workspaces + Turborepo):
  - `apps/desktop`: electron-vite with `src/main`, `src/preload`, `src/renderer`, `src/workers/agent.ts`, `src/workers/ingest.ts`.
  - `packages/ipc-contract`: zod schemas and shared types.
  - `packages/agent-core`: Copilot SDK wrapper, tools, prompts. Testable in plain Node 24.
  - `packages/doc-engine`: ingestion and template filling.
  - `packages/ui`: shadcn components and AI chat components.
  - Native and SDK packages (`@github/copilot-sdk`, `better-sqlite3` if used) belong in `apps/desktop` `dependencies`, not bundled by Vite. Mark them `external` so electron-builder copies them into `node_modules` and smart-unpacks them. pnpm's symlinked layout can confuse packagers; `node-linker=hoisted` for the desktop app is a common mitigation, though it was not verified here.
- **TypeScript.** Adopt TS 7 for `tsc --noEmit` type-checking speed. Keep a TS 6.x devDependency only if a tool still needs the legacy compiler API (e.g. some type-aware lint rules or codegen). Use `"module": "NodeNext"` or `"bundler"`, `"verbatimModuleSyntax": true`, and `"target": "ES2024"` (Node 24/V8 15 and Chromium 152 support it).

### Gaps
- Not verified: which ecosystem tools (typescript-eslint, vite-plugin-checker, etc.) fully support TS 7's new API as of October 2026.
- Forge 8 Vite plugin stability status is unconfirmed.
- No authoritative 2026 head-to-head of electron-vite+builder vs Forge was found. The recommendation above is inference.

## Q4. Packaging, code signing, auto-update, installers, size; bundling the Copilot CLI/runtime and native modules

### Takeaway
On macOS: sign with a Developer ID, notarize (via `@electron/notarize`, which uses notarytool), and ship DMG + ZIP. On Windows: sign with **Azure Artifact Signing** (the renamed Trusted Signing, GA January 2026, about $9.99/month) through electron-builder's `azureSignOptions` or Forge, and ship NSIS (electron-updater) or MSIX/Squirrel. The Copilot SDK platform package must sit outside `app.asar`. electron-builder's default `smartUnpack` already does that, because it unpacks any module containing `.node` or extensionless binaries. Expect installers of roughly 150–250 MB per platform/arch, dominated by Chromium (~100 MB) and the ~130 MB Copilot runtime.

### Cited Findings
**Windows signing**
- Microsoft announced in January 2026 that "Trusted Signing is now Artifact Signing—and it's officially Generally Available". GA covers organizations and individuals in the USA and Canada, and organizations in the EU/UK. — [Microsoft Tech Community](https://techcommunity.microsoft.com/blog/microsoft-security-blog/-/4482789)
- Artifact Signing uses certificates renewed daily and valid for 24 hours (timestamped signatures stay valid). Pricing is $9.99/month for 5,000 signatures with one profile, or $99.99/month for 100,000. The certificates are not EV. — [DevClass, 2026-01-14](https://devclass.com/2026/01/14/code-signing-windows-apps-may-be-easier-and-more-secure-with-new-azure-artifact-service/)
- Electron's docs describe Azure Artifact Signing as "the cheapest Windows signing option" that removes SmartScreen warnings, available only in certain countries, and usable from Linux/macOS CI through `jsign` (`TRUSTEDSIGNING` store type). For traditional certificates, the docs say "since June 2023, Microsoft requires software to be signed with an 'extended validation' certificate," that OV-signed apps are treated as unsigned, and that EV keys must live on certified hardware or in cloud HSMs. Electron's own apps use DigiCert KeyLocker. Tooling is `@electron/windows-sign` via the `windowsSign` option (Forge, Packager, electron-winstaller, electron-wix-msi). — [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- electron-builder `win.azureSignOptions` takes `publisherName` (must exactly match the certificate CN), `endpoint` (region-specific), `certificateProfileName` and `codeSigningAccountName`. It cannot be combined with `signtoolOptions`, and authentication comes from Azure environment variables. A newer `signtool /dlib` integration replaces the deprecated PowerShell path. — [electron-builder Windows code signing](https://www.electron.build/docs/features/code-signing/code-signing-win); [WindowsAzureSigningConfiguration API](https://www.electron.build/docs/api/app-builder-lib.Interface.WindowsAzureSigningConfiguration)
- Under CA/B Forum ballot CSC-31, publicly trusted code-signing certificates (OV and EV) issued on or after 2026-03-01 have a maximum validity of 460 days. Existing timestamped signatures are unaffected. — [SSLInsights](https://sslinsights.com/code-signing-certificate-validity-reduced-460-days/); [AppViewX](https://www.appviewx.com/blogs/460-day-code-signing-certificate-2026/) (one AppViewX version says 200 days, which contradicts the other sources and looks like an error)

**macOS**
- macOS release takes two steps: code-sign, then notarize. It requires an Apple Developer Program membership and Xcode. `Squirrel.Mac requires the app to be signed for automatic updates to work at all`, and `safeStorage`, `app.setLoginItemSettings()` and the `cookieEncryption` fuse depend on a valid signature. — [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- Forge 8 bumped to `@electron/notarize` v3 and `@electron/osx-sign` v2. — [Electron Forge releases](https://github.com/electron/forge/releases)

**Auto-update**
- update.electronjs.org requires a **public GitHub repo** with builds in GitHub Releases, macOS or Windows, and code signing (macOS and MSIX). It supports darwin x64/arm64/universal and win32 x64/ia32/arm64, uses Squirrel.Windows by default, and offers MSIX through an `msix` feed segment on Electron 41+. It is used through `update-electron-app` (3.3.0, last published 2026-06-28). — [update.electronjs.org](https://github.com/electron/update.electronjs.org); [npm update-electron-app](https://www.npmjs.com/package/update-electron-app)
- electron-updater 6.8.9 is the updater paired with electron-builder. — [npm electron-updater](https://www.npmjs.com/package/electron-updater)

**ASAR and bundling native binaries**
- Electron ASAR: only `execFile` is supported for executing binaries inside an ASAR archive. Unpacked files go to `app.asar.unpacked`. — [Electron ASAR archives](https://www.electronjs.org/docs/latest/tutorial/asar-archives)
- electron-builder source (app-builder-lib 26.15.3): `AsarOptions.smartUnpack` ("Whether to automatically unpack executables files", default `true`). `unpackDetector.js` unpacks a whole module root if any file ends in `.dll`, `.exe`, `.dylib`, `.so` or `.node`, or if an extensionless file is binary. — [app-builder-lib unpackDetector.js](https://app.unpkg.com/app-builder-lib@26.15.3/files/out/asar/unpackDetector.js)
- The Copilot SDK platform package contains `runtime.node` (~133 MB), an extensionless `copilot-runtime` launcher, and extensionless `rg`/`tgrep` binaries. At startup the SDK copies them into a per-user cache dir, and `COPILOT_CLI_PATH` or an explicit connection `path` overrides the bundled runtime. — [npm @github/copilot-sdk](https://www.npmjs.com/package/@github/copilot-sdk) (tarball inspected)

### Inferences
- **Bundling the Copilot runtime.**
  - Keep `@github/copilot-sdk` and only the target-platform `@github/copilot-sdk-<platform>` as production deps of the desktop app. Install per platform/arch on CI runners, or use `npm install --os/--cpu`-style filtering so a mac build does not carry Windows binaries.
  - electron-builder's default `smartUnpack` should automatically place `@github/copilot-sdk-<platform>` in `app.asar.unpacked` because it contains `.node` and extensionless binaries. Add an explicit `asarUnpack: ["**/node_modules/@github/copilot-sdk-*/**"]` as a belt-and-braces measure.
  - For deterministic, signed paths, pass the unpacked runtime path explicitly through `RuntimeConnection.forStdio({ path })` or `COPILOT_CLI_PATH` (replace `app.asar` with `app.asar.unpacked`). Otherwise the SDK copies a ~133 MB file into the user cache on first run, which costs disk space, slows first launch, and executes code from a writable location.
  - Notarization requirement: on macOS, every Mach-O file (`runtime.node`, `copilot-runtime`, `rg`, `tgrep`) must be signed with the hardened runtime. `@electron/osx-sign` signs binaries under `app.asar.unpacked`, but third-party binaries may need entitlements such as `com.apple.security.cs.allow-jit` or `disable-library-validation`. Test notarization early.
  - On Windows, also sign `copilot-runtime.exe`, `rg.exe` and `tgrep.exe`. SmartScreen/Defender can flag unsigned helper executables spawned from the app.
- **Installers and update channel.** electron-builder NSIS (per-user, no admin) + DMG/ZIP + electron-updater on GitHub Releases (private repos supported) or S3/R2. That gives differential updates and staged rollouts without the public-repo requirement of update.electronjs.org. Use Squirrel/MSIX through Forge only if enterprise MSIX deployment is a requirement.
- **Hardening.** Use `@electron/fuses` to disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable` and `EnableNodeCliInspectArguments` in production builds (but keep `nodeCliInspect` enabled in test builds for Playwright; see Q9). Turn on `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar`. Caution: disabling `RunAsNode` is fine because the Copilot SDK spawns its own launcher, not `process.execPath`, but verify this.
- **Size estimate.** Chromium-based Electron runtime ~85–110 MB compressed, Copilot runtime ~127–133 MB uncompressed per platform, plus app code and native modules. Expect DMG/NSIS of roughly 150–250 MB per arch. Universal macOS builds would nearly double the Copilot runtime part, so prefer separate arm64 and x64 DMGs.

### Gaps
- No primary source was found on how SmartScreen reputation behaves for Artifact Signing (non-EV) versus EV in 2026, beyond Electron's statement that it removes warnings.
- Whether `@electron/osx-sign` handles the Copilot SDK's `runtime.node` without extra entitlements is untested.
- Whether the Copilot runtime needs network or JIT entitlements on macOS is unknown.
- Whether the SDK's runtime copy-to-cache step works when the source is inside `app.asar` (via Electron's asar fs shim) rather than `app.asar.unpacked` is untested.
- A web search summary mentioned a toolhive-studio commit (April 2026) that moved Electron Forge Windows signing to Azure, with a DigiCert KeyLocker fallback and a note about an open electron/windows-sign issue requiring a no-space DLL path. The commit was not opened, so this is unverified.

## Q5. UI framework: React 19 + Vite + TypeScript + Tailwind v4 + shadcn/ui (Radix/Base UI); alternatives

### Takeaway
React 19 + Vite + TS + Tailwind CSS v4 + shadcn/ui is still the mainstream, current stack in October 2026: React 19.3.0, Tailwind 4.3.3, Vite 8.3.4 and shadcn CLI 4.x. shadcn now supports Base UI as an alternative primitive layer to Radix. Stay on **Radix** for this app, because the AI component registries (AI Elements) are reported to assume Radix. Svelte 5, Solid and Vue are viable but have a much smaller AI-chat component ecosystem.

### Cited Findings
- Current versions (npm, 2026-10-11):
  - react 19.3.0 (published 2026-09-09; 19.2.0 was 2025-10-01)
  - tailwindcss 4.3.3 (4.0.0 2025-01-21; 4.3.0 2026-05-08) and `@tailwindcss/vite` 4.3.3
  - vite 8.3.4
  - shadcn CLI 4.21.4 (4.0.0 published 2026-03-06; 3.0.0 2025-08-27)
  - `radix-ui` (unified package) 1.7.0
  - `@base-ui/react` 1.9.0 (1.0.0 published 2025-12-11). The old `@base-ui-components/react` name stopped at 1.0.0-rc.0.

  — [npm react](https://www.npmjs.com/package/react); [npm tailwindcss](https://www.npmjs.com/package/tailwindcss); [npm shadcn](https://www.npmjs.com/package/shadcn); [npm @base-ui/react](https://www.npmjs.com/package/@base-ui/react); [npm radix-ui](https://www.npmjs.com/package/radix-ui)
- shadcn/ui added Base UI as an alternative to Radix in January 2026. Components look and behave the same and only the primitive layer changes; it is selected at init (e.g. `--base base-ui`) with Radix as the default. In February 2026 the new-york style moved to the single `radix-ui` package (`npx shadcn@latest migrate radix`). — [Shadcnblocks changelog (vendor)](https://www.shadcnblocks.com/changelog/new-feature-base-ui-support); [skills.sh shadcn skill (third-party)](https://skills.sh/vercel/vercel-plugin/shadcn)
- Third-party skill doc: "stick with Radix if you use AI Elements," which reportedly has type errors with Base UI (unverified). — [skills.sh shadcn skill](https://skills.sh/vercel/vercel-plugin/shadcn)
- Alternatives (npm, 2026-10-11): svelte 5.57.2, solid-js 1.9.17, vue 3.5.43. — [npm svelte](https://www.npmjs.com/package/svelte); [npm solid-js](https://www.npmjs.com/package/solid-js); [npm vue](https://www.npmjs.com/package/vue)
- assistant-ui and Streamdown both declare React `^18 || ^19` peers. — [npm @assistant-ui/react](https://www.npmjs.com/package/@assistant-ui/react); [npm streamdown](https://www.npmjs.com/package/streamdown)

### Inferences
- Recommended: React 19.3, TypeScript (TS 7 for type-checking), Vite (7 via electron-vite 5, or 8 via electron-vite 6 beta), Tailwind 4.3 through `@tailwindcss/vite` (CSS-first config with `@theme`, no `tailwind.config.js`), and shadcn/ui with Radix primitives. Polished apps like Linear and the ChatGPT/Claude desktop apps are web-stack UIs, and shadcn plus Radix gives accessible primitives (Dialog, Popover, DropdownMenu, Tooltip, ContextMenu) that feel native with keyboard support.
- Consider the React Compiler to cut memo boilerplate in heavy streaming UIs. Its current version and stability status were not verified in this session (see Gaps).
- Svelte 5 or Solid would give smaller bundles and finer-grained reactivity (useful for token streaming), but they lack assistant-ui, AI Elements and the broad shadcn/AI registry ecosystem. Bundle size matters little in Electron, so React's ecosystem advantage wins.

### Gaps
- No primary shadcn changelog page was fetched. The Base UI details come from vendor and third-party mirrors.
- React Compiler version and status not checked.
- Tailwind 4.3 release notes not reviewed.

## Q6. AI chat UI component libraries driven by a custom IPC transport; streaming markdown; tool-call/approval and "ask user" UI

### Takeaway
There are two good transport-agnostic options:
- **(a) Vercel AI SDK UI v7 `useChat` with a custom `ChatTransport`** whose `sendMessages()` returns a `ReadableStream<UIMessageChunk>` fed from the Electron MessagePort, rendered with **AI Elements** (shadcn-registry components) and **Streamdown**.
- **(b) assistant-ui** with `useExternalStoreRuntime` backed by a Zustand store you update from IPC events.

Both work without an HTTP route. CopilotKit is tied to the AG-UI protocol and its runtime, and LlamaIndex chat-ui is less active, so neither is a first choice.

### Cited Findings
- **AI SDK** `ai` 7.0.137 (7.0.0 published 2026-06-25) and `@ai-sdk/react` 4.0.140. — [npm ai](https://www.npmjs.com/package/ai); [npm @ai-sdk/react](https://www.npmjs.com/package/@ai-sdk/react) (npm, 2026-10-11)
- `useChat` accepts a `transport` option, defaulting to `DefaultChatTransport` with `/api/chat`. The docs tell you to build custom transports by implementing the `ChatTransport` interface's `sendMessages` method, which processes UI message streams and handles errors. The docs present the system as being for "alternative communication protocols like WebSockets... or specialized backend integrations." — [AI SDK v7 Transport docs](https://ai-sdk.dev/v7/docs/ai-sdk-ui/transport); [useChat reference](https://ai-sdk.dev/v7/docs/reference/ai-sdk-ui/use-chat)
- A third-party package (`@browser-ai/core`) implements `ChatTransport` as a class whose `sendMessages` returns a `ReadableStream` of UI message chunks with no HTTP involved. That is a working pattern for non-HTTP transports. — [built-in-ai.dev useChat integration (AI SDK v7)](https://www.built-in-ai.dev/docs/ai-sdk-v7/core/usechat-integration)
- **AI Elements** is "a component library and custom registry built on top of shadcn/ui". Components include Conversation, Message, Prompt Input, Attachments, Reasoning, Chain of Thought, Tool, Confirmation, Plan, Queue, Task, Sources, Inline Citation, Suggestion, Shimmer, Checkpoint, Context, Model Selector, Artifact, Code Block, File Tree, Web Preview and others. The library advertises "Deep integration with the AI SDK. Streaming, status states and type safety built-in." — [AI Elements](https://elements.ai-sdk.dev/)
- **assistant-ui** `@assistant-ui/react` 0.15.27 (0.15.0 published 2026-07-28; still pre-1.0). — [npm @assistant-ui/react](https://www.npmjs.com/package/@assistant-ui/react) (npm, 2026-10-11)
- assistant-ui `ExternalStoreRuntime` is recommended "when you already keep messages in a store such as redux, zustand, or tanstack-query": "You own the state, and the adapter translates between your format and assistant-ui's." Streaming works by updating the assistant message in place with `setMessages` and toggling `isRunning`. Tool results flow through `onAddToolResult`, human-in-the-loop through `onResumeToolCall` and `onRespondToToolApproval` (these enable `thread.capabilities.answerToolCall`), and interrupted runs through `onResume`. There is a Zustand + immer example. Several APIs are prefixed `unstable_`. — [assistant-ui External Store runtime](https://www.assistant-ui.com/docs/runtimes/custom/external-store)
- **Streamdown** 2.7.0 (2.0.0 published 2026-01-12). Vercel's streaming-markdown React component is a drop-in replacement for react-markdown (same `children`, `components`, `remarkPlugins` props). It handles unterminated bold, code fences and links mid-stream, includes GFM, KaTeX and Shiki by default, and offers Mermaid/CJK as `@streamdown/*` plugins. Its companion `remend` "self-heals" partial markdown. Usage: `<Streamdown isAnimating={isStreaming}>{text}</Streamdown>`. Tailwind needs Streamdown's dist files in its content sources. — [npm streamdown](https://www.npmjs.com/package/streamdown); [Streamdown docs mirror (Mintlify)](https://www.mintlify.com/vercel/streamdown); [skills.sh streamdown (third-party)](https://skills.sh/vercel/streamdown/streamdown)
- react-markdown 10.1.0 has not been published since 2025-03. — [npm react-markdown](https://www.npmjs.com/package/react-markdown)
- **CopilotKit** `@copilotkit/react-core` 1.78.0. CopilotKit is "a first-class client" of **AG-UI**, an event-based, bidirectional protocol between agent backends and frontends that "can work with any end-user facing UI, such as... a desktop application." — [npm @copilotkit/react-core](https://www.npmjs.com/package/@copilotkit/react-core); [LlamaIndex blog on AG-UI + CopilotKit](https://www.llamaindex.ai/blog/announcing-easy-agentic-frontends-with-ag-ui-and-copilotkit); [CopilotKit custom look and feel](https://docs.copilotkit.ai/custom-look-and-feel)
- **LlamaIndex chat-ui** `@llamaindex/chat-ui` 0.6.1, last modified 2026-06-05. — [npm @llamaindex/chat-ui](https://www.npmjs.com/package/@llamaindex/chat-ui)

### Inferences
- **Option A (AI SDK UI + AI Elements + Streamdown; recommended for the shadcn look):**
  - Implement `class IpcChatTransport implements ChatTransport<UIMessage>`. `sendMessages({ messages, abortSignal })` posts a `chat.send` message over the agent MessagePort and returns a `ReadableStream` whose controller enqueues `UIMessageChunk`s (text-delta, reasoning, tool-input/tool-output, data parts) translated from Copilot SDK session events. `abortSignal` maps to an SDK session abort.
  - `reconnectToStream` can resume after a renderer reload by asking the utility process for its buffered events.
  - Because AI Elements components are copied into the repo through the shadcn CLI and consume AI SDK `UIMessage` parts, they render tool calls (Tool), approvals (Confirmation), plans/tasks, reasoning and attachments with no HTTP server.
- **Option B (assistant-ui ExternalStoreRuntime + Zustand):** maximum control and Radix-based primitives (Thread, Composer, ActionBar, BranchPicker). Good if the Copilot event model doesn't map cleanly onto AI SDK `UIMessage`s. Being pre-1.0 with `unstable_` APIs means more churn.
- **"Ask user" follow-ups** (the agent asks clarifying questions mid-run): model them as a client-side tool (e.g. `ask_user`, with a JSON-schema form spec) that the agent calls. Render it inline as a form card: AI Elements `Confirmation`/`Tool`, or assistant-ui `makeAssistantToolUI` with `onResumeToolCall`. Build the form with shadcn Form + react-hook-form/zod. Send the answer back as the tool result over IPC. This matches the human-in-the-loop hooks both libraries document.
- **Streaming markdown:** use Streamdown (directly or through the AI Elements message components) instead of react-markdown. Throttle renderer updates to animation frames (batch tokens per rAF) so long responses stay at 60 fps.
- **CopilotKit** would require running an AG-UI-compatible agent endpoint or runtime. Adapting it to the Copilot SDK over IPC is more work than A or B, so it is not recommended here.

### Gaps
- Whether AI Elements has a documented non-`useChat` usage path (passing plain props) was not confirmed; the page only says "deep integration with the AI SDK."
- prompt-kit was not found in searches and is unverified.
- The current AI SDK v7 `UIMessageChunk` type names were not read from source.
- No first-party AI SDK example of an Electron IPC transport was found.

## Q7. Other polish libraries: file drop, virtualization, state, routing, animation, command palette, toasts, theming, native window chrome

### Takeaway
All the usual picks are current and actively maintained: react-dropzone 20, TanStack Virtual 3, Zustand 5, TanStack Query 5, TanStack Router 1, Motion 14, cmdk 1.1, sonner 2. Electron 44 has the window-chrome APIs needed for a Linear/Raycast feel: `titleBarStyle: 'hiddenInset'`, `trafficLightPosition`, macOS `vibrancy`, Windows `backgroundMaterial: 'mica'`, `titleBarOverlay`, and `windowStatePersistence`.

### Cited Findings
- Versions (npm, 2026-10-11):
  - react-dropzone 20.1.3
  - `@tanstack/react-virtual` 3.14.15
  - zustand 5.0.15
  - `@tanstack/react-query` 5.104.1
  - `@tanstack/react-router` 1.170.42
  - motion 14.1.0
  - cmdk 1.1.1 (last modified 2025-08-27; slow-moving)
  - sonner 2.0.8
  - zod 4.6.6
  - electron-log 5.4.4
  - electron-store 11.0.2

  — [npm react-dropzone](https://www.npmjs.com/package/react-dropzone); [npm @tanstack/react-virtual](https://www.npmjs.com/package/@tanstack/react-virtual); [npm zustand](https://www.npmjs.com/package/zustand); [npm @tanstack/react-query](https://www.npmjs.com/package/@tanstack/react-query); [npm @tanstack/react-router](https://www.npmjs.com/package/@tanstack/react-router); [npm motion](https://www.npmjs.com/package/motion); [npm cmdk](https://www.npmjs.com/package/cmdk); [npm sonner](https://www.npmjs.com/package/sonner)
- BrowserWindow options:
  - `titleBarStyle: 'hidden'` gives full-size content. Windows/Linux show controls only with `titleBarOverlay`.
  - `hiddenInset` (macOS) insets the traffic lights. `customButtonsOnHover` is experimental.
  - `titleBarOverlay` enables the Window Controls Overlay with `color`, `symbolColor` and `height`.
  - `trafficLightPosition` (macOS).
  - `vibrancy` (macOS): values include `sidebar`, `under-window`, `header`, `content`, `hud`, etc. `visualEffectState` can be `followWindow`, `active` or `inactive`.
  - `backgroundMaterial` (Windows): `auto`, `none`, `mica`, `acrylic`, `tabbed`.
  - `roundedCorners` has no effect before Windows 11 build 22000.

  — [Electron BaseWindowOptions](https://www.electronjs.org/docs/latest/api/structures/base-window-options)
- Transparent windows cannot be clicked through and are not resizable. On Windows they cannot be maximized through the title bar, and on macOS they lose the native shadow. — [Electron custom window styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles)
- Electron 44 adds `windowStatePersistence` (save/restore position, size, display mode) and system-themed Window Controls Overlay icons on Linux frameless windows. — [Electron 44 blog](https://www.electronjs.org/blog/electron-44-0)

### Inferences
- **File intake:** use react-dropzone (or a plain `onDrop` handler) only for the visual drop zone and the `File` objects. Immediately map each file to a path with `webUtils.getPathForFile` in the preload and send paths to the ingest utility. Show per-file progress in a TanStack Virtual list, which handles thousands of rows. Native "Add files…" uses `dialog.showOpenDialog` with `multiSelections`.
- **State:** Zustand for UI and chat/session state, which also feeds the assistant-ui external store if you choose option B. Use TanStack Query for request/response IPC calls (project lists, file metadata, template lists) with IPC-backed query functions, and push invalidations from main when ingestion finishes.
- **Routing:** TanStack Router with memory or hash history (Electron has no server) for type-safe routes such as `/projects/$id/chat` and `/projects/$id/output`.
- **Motion and feel:** Motion for message enter/exit, layout transitions and the template preview panel. cmdk inside a shadcn `CommandDialog` for a ⌘K palette. sonner for toasts. Theming with shadcn CSS variables plus `nativeTheme.shouldUseDarkColors` and the `prefers-color-scheme` media query. Call `nativeTheme.themeSource` to keep native menus and vibrancy in sync.
- **Window chrome recipe:**
  - macOS: `titleBarStyle: 'hiddenInset'` + `vibrancy: 'sidebar'` (transparent sidebar background in CSS) + `trafficLightPosition`.
  - Windows 11: `titleBarStyle: 'hidden'` + `titleBarOverlay: { color, symbolColor, height }` + `backgroundMaterial: 'mica'`.
  - Use `-webkit-app-region: drag` on the header, set `backgroundColor` to avoid a white flash, and show the window on `ready-to-show`.

### Gaps
- No 2026 primary sources were checked for cmdk maintenance status (last publish 2025-08) or for Motion 14 breaking changes.
- `backgroundMaterial` visual behavior on Windows 10 is not documented in the fetched page.

## Q8. Local persistence: node:sqlite vs better-sqlite3 vs libSQL; Drizzle; file storage; secure credentials

### Takeaway
**`node:sqlite` works inside Electron 44** (local test: main and utilityProcess, SQLite 3.53.4) and is "Stability 1.2 – Release candidate" in Node 24 (since 24.15.0). It removes the need for native-module rebuilds, so it is a sound default for a Node-24-only app. Keep **better-sqlite3 13** as the fallback if you hit RC bugs. Drizzle supports `node:sqlite` only in its 1.0 RC line. Store uploaded files as content-addressed blobs under `app.getPath('userData')` and keep only metadata, extracted text and chunks in SQLite. Use Electron **safeStorage** (async API) for tokens. keytar is not maintained.

### Cited Findings
- Node v24 docs (v24.21.0): `node:sqlite` is "Stability: 1.2 – Release candidate." History: added in v22.5.0; unflagged (but still experimental) in v23.4.0/v22.13.0; "SQLite is now a release candidate" in v24.15.0. The class is `DatabaseSync`, and "All APIs exposed by this class execute synchronously." — [Node v24 sqlite docs](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- Latest Node docs (v26 line) list RC status since v25.7.0 and rename `DatabaseSync` → `Database` and `StatementSync` → `Statement`, with the old names kept as deprecated aliases (DEP0210/DEP0211). They add `createTagStore()` (an LRU prepared-statement cache), sessions/changesets, `serialize`/`deserialize`, `backup()` and `setAuthorizer()`. There is still no async API. — [Node latest sqlite docs](https://nodejs.org/api/sqlite.html)
- A secondary source reports a TEXT-decoding bug in Node 24.15.0 (truncation at embedded NUL characters), fixed in 24.16.0. — [OpenClaw Node compatibility (third-party)](https://docs.openclaw.ai/install/node-compatibility). CVE-2026-58041 (a stale statement iterator reusing a cached prepared statement) is listed as affecting Node 24.x ≤ 24.18.0. — [stack.watch CVE-2026-58041 (aggregator)](https://stack.watch/vuln/CVE-2026-58041/)
- Local test: in Electron 44.7.0 (Node 24.21.0), `require('node:sqlite')` works in `ELECTRON_RUN_AS_NODE` mode, in the ESM main process and in an ESM utilityProcess (create, insert, select; `sqlite_version()` = 3.53.4). — local test of [Electron v44.7.0](https://github.com/electron/electron/releases/tag/v44.7.0)
- better-sqlite3 13.0.3 (13.0.0 published 2026-07-21), engines Node ≥22. `@libsql/client` 0.18.0. `@electron/rebuild` 4.2.1. — [npm better-sqlite3](https://www.npmjs.com/package/better-sqlite3); [npm @libsql/client](https://www.npmjs.com/package/@libsql/client); [npm @electron/rebuild](https://www.npmjs.com/package/@electron/rebuild) (npm, 2026-10-11)
- drizzle-orm `latest` is 0.45.4. The `rc` tag is 1.0.0-rc.4 and `beta` is 1.0.0-beta.22. The beta/RC package exports include `./node-sqlite`, `./sqlite-proxy`, `./bun-sqlite`, `./op-sqlite`, etc. — [npm drizzle-orm](https://www.npmjs.com/package/drizzle-orm) (npm, 2026-10-11)
- safeStorage uses Keychain on macOS, DPAPI on Windows (which "protects data from other users on the machine but not from other apps in the same userspace") and kwallet/libsecret on Linux. The async API (`encryptStringAsync`/`decryptStringAsync`) is recommended: it is non-blocking and supports key rotation (`shouldReEncrypt`) and `isTemporarilyUnavailable`. The sync API "may be deprecated in a future version." On Linux with no secret store, data is encrypted with a hardcoded password, so check `getSelectedStorageBackend()` for `basic_text`. — [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- Local test: `safeStorage.encryptStringAsync` exists in Electron 44.7.0. `isEncryptionAvailable()` returned `false` on a headless Linux box with no keyring (expected). — local test of [Electron v44.7.0](https://github.com/electron/electron/releases/tag/v44.7.0)
- keytar 7.9.0 is the latest version on npm, with no newer releases. — [npm keytar](https://www.npmjs.com/package/keytar)
- Signing matters for safeStorage on macOS. — [Electron code signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)

### Inferences
- **Database choice:** run `node:sqlite` in the ingest/agent utility processes, never on the main thread for heavy queries, because it is synchronous. Use WAL mode and one writer process. Schema: `projects`, `documents` (sha256, original name, mime, size, path, status), `chunks` (+ FTS5 virtual table for keyword search), `sessions`/`messages`, `questions`/`answers`, `outputs`. FTS5 availability in Node's bundled SQLite was not checked (see Gaps).
- **ORM:** use Drizzle 1.0 RC with `drizzle-orm/node-sqlite` if you accept an RC ORM on an RC driver. Otherwise use a thin hand-written repository layer with prepared statements, or Kysely (not researched). If `node:sqlite` RC issues appear, switch to better-sqlite3 13. That brings back `@electron/rebuild` and asar smart-unpack but is battle-tested and is what most Electron apps use. Pin Electron ≥44 / Node ≥24.18.1 to avoid the reported sqlite CVE and NUL bug.
- **libSQL** (`@libsql/client`) only makes sense if you need Turso sync or embedded replicas. Unnecessary for a local-only app.
- **Files:** copy uploads into `userData/projects/<id>/files/<sha256>.<ext>` (content-addressed to dedupe repeated uploads). Store extracted text and derived artifacts next to them, and write generated DOCX/PDF to `userData/projects/<id>/outputs/`. Offer "Reveal in Finder/Explorer" through `shell.showItemInFolder`.
- **Credentials:** the GitHub/Copilot token should come from the Copilot runtime's own logged-in-user flow (`useLoggedInUser`), or from a token the app stores encrypted with `safeStorage.encryptStringAsync` in SQLite or electron-store. Do not use keytar.

### Gaps
- No official Electron doc or release note was found that states `node:sqlite` is supported or enabled. Support was confirmed only empirically on Linux x64 with Electron 44.7.0; it was not tested on macOS or Windows builds.
- FTS5/JSON1 availability in Node's bundled SQLite was not checked.
- The CVE and NUL-bug details come from aggregator or third-party sources, not Node security release notes.
- No primary source confirms that keytar is formally deprecated or archived.

## Q9. Testing: Playwright for Electron, Vitest

### Takeaway
Use **Vitest 5** for unit and integration tests of the agent core, the IPC contract and the doc engine (plain Node 24), plus renderer component tests. Use **Playwright 1.64 `_electron`** (still labeled experimental but widely used) for end-to-end tests of the packaged or dev app. Keep the `nodeCliInspect` fuse enabled in test builds.

### Cited Findings
- `@playwright/test` 1.64.0 and vitest 5.0.3. — [npm @playwright/test](https://www.npmjs.com/package/@playwright/test); [npm vitest](https://www.npmjs.com/package/vitest) (npm, 2026-10-11)
- Playwright "has **experimental** support for Electron automation" through `_electron.launch()`, for Electron v21+. `electronApp.evaluate()` runs code in main, and `firstWindow()` returns a normal Page. Launch can time out if the `EnableNodeCliInspectArguments` fuse is disabled. Native dialogs are not intercepted and must be stubbed in main through `evaluate()`. — [Playwright Electron API](https://playwright.dev/docs/api/class-electron)

### Inferences
- Stub the Copilot SDK in E2E tests with a fake agent utility process that replays recorded event streams. This gives deterministic tests of streaming, tool approval and ask-user flows without network access or quota.
- Test drag-and-drop by calling the preload API directly through `page.evaluate`, or by dispatching DataTransfer events with synthetic `File`s backed by fixture paths.
- Build a separate "e2e" flavor with fuses relaxed, and keep production fuses strict.

### Gaps
- Vitest 5 breaking changes and browser-mode status not reviewed.
- No 2026 source on Playwright Electron support for utilityProcess introspection.

## Q10. Node 24 specifics: LTS timeline as of October 2026 and useful features

### Takeaway
Node 24 "Krypton" is the current Active LTS but enters **Maintenance LTS on 2026-10-20**, and Node 26 becomes Active LTS on 2026-10-28. Node 24 stays supported until **2028-04-30**, so the requirement is safe for the app's lifetime. Electron currently bundles Node 24.21.0 (the latest Node 24). Useful features include **stable TypeScript type stripping** (since 24.12.0), `node:sqlite` as a release candidate (since 24.15.0), `require(esm)`, the `--permission` model, global `URLPattern`, undici 7 fetch, and V8 explicit resource management (`using`).

### Cited Findings
- Release schedule: v24 started 2025-05-06, entered LTS 2025-10-28, moves to maintenance 2026-10-20, and reaches end of life 2028-04-30 (codename Krypton). v22: maintenance since 2025-10-21, EOL 2027-04-30. v26: LTS on 2026-10-28, EOL 2029-04-30. v25: EOL 2026-06-01. — [nodejs/Release schedule.json](https://raw.githubusercontent.com/nodejs/Release/main/schedule.json)
- The latest Node 24 release is v24.21.0, marked "Latest LTS". — [Node.js previous releases](https://nodejs.org/en/about/previous-releases)
- Node 24.0.0 brought:
  - V8 13.6: `Float16Array`, explicit resource management (`using`), `RegExp.escape`, Wasm Memory64, `Error.isError`
  - npm 11
  - `AsyncLocalStorage` defaulting to `AsyncContextFrame`
  - `URLPattern` as a global
  - the permission model renamed from `--experimental-permission` to `--permission`
  - the test runner auto-awaiting subtests
  - undici 7
  - deprecations of `url.parse()` and `SlowBuffer`

  — [Node v24.0.0 release notes](https://nodejs.org/en/blog/release/v24.0.0)
- TypeScript type stripping in Node 24 is "Stability: 2 (Stable)". It was unflagged in v23.6.0, stopped warning in v24.3.0, and was declared stable in v24.12.0. Enums, runtime namespaces, parameter properties and import aliases need `--experimental-transform-types`. Decorators error. `tsconfig.json` is ignored (`paths` unsupported; use `#` subpath imports). Type imports need `import type` (enforce with `verbatimModuleSyntax`). `.ts` files inside `node_modules` are refused. — [Node v24 TypeScript docs](https://nodejs.org/docs/latest-v24.x/api/typescript.html)
- `node:sqlite` is an RC in Node 24.15.0+. — [Node v24 sqlite docs](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)
- Forge 8 requires Node ≥22.12.0 because it is "the first version supporting `require(esm)` in CommonJS". — [Electron Forge releases](https://github.com/electron/forge/releases)
- Local test: Electron 44.7.0's Node reports `process.features.typescript === "strip"` and exposes `module.stripTypeScriptTypes`, a global `URLPattern`, `fetch` and `WebSocket`. — local test of [Electron v44.7.0](https://github.com/electron/electron/releases/tag/v44.7.0)

### Inferences
- **Type stripping** lets `packages/agent-core` scripts, migrations and dev tooling run directly as `.ts` under Node 24 (`node scripts/migrate.ts`) with no tsx or ts-node. Production Electron code is still bundled by Vite, so stripping mainly helps tooling and tests. Write erasable-only TS (no enums or parameter properties; turn on `erasableSyntaxOnly` in tsconfig) to keep both paths compatible.
- **`require(esm)`** removes most CJS/ESM interop pain. ESM-only dependencies such as Forge 8 or newer AI SDK packages can be loaded from CJS preload bundles if needed.
- **Permission model.** `--permission` applies to standalone Node processes and is not a sandbox for Electron's utilityProcess (Electron controls the flags). Treat it as unavailable for in-app isolation. Rely on OS-level separation instead: a dedicated utility process, Copilot SDK tool permission callbacks and restricted working directories.
- **Platform floor.** Electron 44 itself requires macOS 13+ (Q1). This is the effective macOS floor for the app regardless of Node's own platform list.

### Gaps
- Not verified: whether Electron honors `--permission` or `--experimental-transform-types` passed through `utilityProcess` `execArgv`.
- Node 24's minimum OS versions not checked.

## Q11. Recommended concrete stack (synthesis)

### Takeaway
Electron 44.x (→45) + electron-vite + electron-builder/electron-updater. React 19.3 + TypeScript + Tailwind 4.3 + shadcn/ui (Radix). AI SDK UI v7 `useChat` with a custom IPC `ChatTransport`, plus AI Elements and Streamdown (assistant-ui external-store as the alternative). Copilot SDK in a utilityProcess. `node:sqlite` (better-sqlite3 fallback) + safeStorage. Vitest + Playwright. pnpm + Turborepo.

### Cited Findings
- Every version below is drawn from the npm registry on 2026-10-11 or from the official sources cited in Q1–Q10. See those sections for per-item citations: [npm electron](https://www.npmjs.com/package/electron), [Electron schedule](https://releases.electronjs.org/schedule), [npm electron-vite](https://www.npmjs.com/package/electron-vite), [npm electron-builder](https://www.npmjs.com/package/electron-builder), [npm @github/copilot-sdk](https://www.npmjs.com/package/@github/copilot-sdk), [AI SDK v7 transport](https://ai-sdk.dev/v7/docs/ai-sdk-ui/transport), [AI Elements](https://elements.ai-sdk.dev/), [Node v24 sqlite](https://nodejs.org/docs/latest-v24.x/api/sqlite.html).

### Inferences

| Layer | Pick (version, 2026-10-11) | Why / notes |
|---|---|---|
| Runtime | Node 24 LTS (24.21.0 inside Electron) | Hard requirement; supported to 2028-04-30 |
| Shell | **Electron 44.7.x** → 45.x after 2026-10-20 (Chromium 152→156, Node 24.21.0) | Node-native SDK hosting; industry standard for AI desktop apps |
| Dev build | **electron-vite 5.0.0** (Vite 7) or 6.0.0-beta (Vite 8) | HMR, main/preload hot reload, isolated sandboxed preload build |
| Packaging/updates | **electron-builder 26.15.3 + electron-updater 6.8.9** (NSIS, DMG+ZIP, AppImage) | `azureSignOptions`, smartUnpack, private update feeds. Alt: Forge 8.0.1 + update.electronjs.org (public repos only) |
| Signing | Win: **Azure Artifact Signing** ($9.99/mo) or EV on cloud HSM; mac: Developer ID + notarization (`@electron/notarize` v3) | 460-day max cert validity since 2026-03-01 |
| Hardening | `@electron/fuses` 2.1.3; sandbox + contextIsolation; CSP; `app://` protocol | Electron security checklist |
| Agent host | `utilityProcess` running `@github/copilot-sdk` 1.0.19 (stdio connection; runtime path pointed at `app.asar.unpacked`) | Isolates crashes/CPU; streams over MessagePort |
| Ingestion | Second `utilityProcess` (+ worker_threads) | Keeps UI and agent responsive with hundreds of PDFs |
| IPC | Hand-rolled typed contract with zod 4.6 + MessagePort event stream (oRPC/tRPC optional) | Electron-specific tRPC adapters are stale |
| UI | React 19.3 + TypeScript (TS 7.0.2 checker) + Tailwind 4.3.3 + shadcn CLI 4.21 (Radix, `radix-ui` 1.7) | Mainstream, AI component ecosystem |
| Chat UI | AI SDK `ai` 7.0 / `@ai-sdk/react` 4.0 `useChat` + custom `IpcChatTransport`; **AI Elements**; **Streamdown 2.7** | Tool/Confirmation/Reasoning/PromptInput/Attachments components; streaming-safe markdown |
| Chat UI alt | assistant-ui 0.15.x `useExternalStoreRuntime` + Zustand | More control; pre-1.0 churn |
| State/data | Zustand 5.0.15; TanStack Query 5.104 (IPC query fns); TanStack Router 1.170 (hash/memory history) | |
| Polish | Motion 14.1, cmdk 1.1.1, sonner 2.0.8, react-dropzone 20.1.3, TanStack Virtual 3.14 | |
| Window chrome | mac `hiddenInset` + `vibrancy`; Win11 `titleBarOverlay` + `backgroundMaterial: 'mica'`; `windowStatePersistence` | Electron 44 APIs |
| Storage | `node:sqlite` (RC, built-in) in utility processes; fallback better-sqlite3 13.0.3; Drizzle 1.0 RC `node-sqlite` (optional) | No native rebuilds with node:sqlite |
| Files | Content-addressed copies under `userData/projects/<id>/files` | Dedup, offline, reproducible outputs |
| Secrets | `safeStorage.encryptStringAsync` | keytar unmaintained |
| Preview | DOCX: docx-preview 0.4.1 (HTML render); PDF: pdfjs-dist 6.4.299 or Chromium's built-in viewer | Details belong to the template/doc research notes |
| Testing | Vitest 5.0.3; Playwright 1.64 `_electron` | Keep `nodeCliInspect` fuse on in e2e builds |
| Monorepo | pnpm 12 workspaces + Turborepo 2.11 | apps/desktop, packages/{ipc-contract, agent-core, doc-engine, ui} |
| Logging | electron-log 5.4.4 | |

- **Main trade-off accepted:** Electron costs roughly 100 MB of Chromium and ~150 MB idle RAM in exchange for a single TypeScript codebase, native Node 24 for the SDK, consistent Chromium rendering on Windows and macOS, and a mature signing and updating pipeline. Since the Copilot runtime alone is ~130 MB per platform, the incremental size cost of Electron over Tauri is proportionally small for this app.
- **Biggest risks to validate in a spike:**
  1. Notarizing and signing the Copilot SDK's `runtime.node`, `copilot-runtime`, `rg` and `tgrep` inside `app.asar.unpacked`.
  2. Copilot SDK stdio spawn from a utilityProcess on Windows (path quoting, Defender).
  3. `node:sqlite` RC behavior on macOS and Windows Electron builds.
  4. The electron-vite 6 beta if you choose Vite 8.

### Gaps
- No end-to-end reference app combining Electron + Copilot SDK was found.
- The DOCX/PDF preview library recommendations were not evaluated in depth here; they belong to the template and document research notes. Versions are from npm (docx-preview, pdfjs-dist, docx 9.10.0, docxtemplater 3.71.0, @react-pdf/renderer 4.9.0, pdf-lib 1.17.1, which has not been published since 2021).
