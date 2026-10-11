// Checks that a template's Word layout and its field definitions agree, then
// renders it with complete sample data and fails if any tag or placeholder
// survives. Run in CI after anyone edits layout.docx.
//
//   node scripts/check-template.mts

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import Docxtemplater from 'docxtemplater'
import expressionParser from 'docxtemplater/expressions.js'
import InspectModule from 'docxtemplater/js/inspect-module.js'
import PizZip from 'pizzip'
import { fieldDefs, foundFields, foundRates, scopeSummaryText } from '../src/agent-core/demo-data.ts'
import { renderDocx, toRenderData } from '../src/doc-engine/render.ts'
import type { FieldState } from '../src/shared/protocol.ts'

const layoutPath = fileURLToPath(new URL('../templates/engagement-letter/layout.docx', import.meta.url))
const layout = new Uint8Array(readFileSync(layoutPath))
const problems: string[] = []

// 1. Tags in the layout vs. tags the field definitions say they render through.
const inspect = new InspectModule()
new Docxtemplater(new PizZip(layout), { paragraphLoop: true, parser: expressionParser, modules: [inspect] })
const layoutTags = new Set<string>()
const walk = (node: Record<string, unknown>) => {
  for (const [tag, child] of Object.entries(node)) {
    layoutTags.add(tag)
    if (child && typeof child === 'object') walk(child as Record<string, unknown>)
  }
}
walk(inspect.getAllTags())

for (const def of Object.values(fieldDefs)) {
  const tag = def.tag.match(/^\{[#^@]?([^}]+)\}/)?.[1]
  if (!tag || !layoutTags.has(tag)) problems.push(`${def.id}: tag ${def.tag} is not in layout.docx`)
}

// 2. A complete render leaves no tags or placeholders behind.
const complete: Record<string, FieldState> = {
  ...foundFields,
  effectiveDate: { value: '2026-12-01', display: '1 December 2026', status: 'user_answered', sources: [] },
  'billing.email': { value: 'ap@acmeholdings.com', status: 'user_answered', sources: [] },
  scopeSummary: { value: scopeSummaryText, status: 'verified', sources: [] }
}
const out = new PizZip(renderDocx(layout, toRenderData(complete, foundRates)))
const text = (out.file('word/document.xml')?.asText() ?? '').replace(/<[^>]+>/g, '')
for (const leftover of text.match(/\{[^}]*\}|\[[A-Z][^\]]*\]/g) ?? []) problems.push(`unfilled after render: ${leftover}`)
for (const needle of ['Acme Holdings LLC', '1 December 2026', '$650', 'ap@acmeholdings.com', 'Series C financing'])
  if (!text.includes(needle)) problems.push(`expected “${needle}” in the rendered letter`)

console.log(`layout tags: ${[...layoutTags].join(', ')}`)
if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`)
  process.exit(1)
}
console.log(`ok: ${Object.keys(fieldDefs).length} fields map to layout tags; a complete render leaves nothing unfilled`)
