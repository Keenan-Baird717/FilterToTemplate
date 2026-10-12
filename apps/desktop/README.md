# @filtertotemplate/desktop

Electron app for FilterToTemplate. See the [root README](../../README.md) for how to run it and what it demonstrates.

```
src/
  main/index.ts         window, theme, MessagePort broker (main process)
  main/agent-worker.ts  agent utility process; hosts the engine behind the port
  preload/index.ts      contextBridge API and agent-port hand-off
  shared/protocol.ts    fill state, questions, typed chat messages, worker contract
  agent-core/           demo data and the scripted engine (swap for the Copilot SDK)
  doc-engine/render.ts  fill state -> docxtemplater data -> filled .docx (preview and export)
  renderer/             React UI (shadcn/ui in components/ui, AI Elements in components/ai-elements)
templates/engagement-letter/layout.docx   sample Word layout with tags
scripts/build-sample-template.mts         regenerates that layout
scripts/check-template.mts                layout/field-definition sync check
e2e/app.spec.ts         Playwright test that drives the built app
```

The renderer also builds for the browser (`pnpm build:web`). There, the same engine runs in the page instead of a utility process.
