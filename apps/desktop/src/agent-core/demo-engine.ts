// Scripted stand-in for the Copilot SDK session. It emits the same AI SDK
// UIMessageChunk stream a real session adapter would, so the renderer, the
// transport and the worker plumbing are exercised end to end.

import type { AnswerPayload, AppChunk, AppUIMessage, FieldState, FillOp } from '../shared/protocol'
import {
  billingMissing,
  effectiveDateConflict,
  emptyFields,
  foundFields,
  foundRates,
  openQuestions,
  scopeSources,
  scopeSummaryText,
  scopeWaiting
} from './demo-data'

export const ENGINE_NAME = 'Simulated agent'

export interface EngineIO {
  emit: (chunk: AppChunk) => void
  signal: AbortSignal
}

let seq = 0
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(seq++).toString(36)}`

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const t = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t)
        reject(signal.reason)
      },
      { once: true }
    )
  })
}

class Turn {
  private io: EngineIO

  constructor(io: EngineIO) {
    this.io = io
  }

  emit(chunk: AppChunk) {
    this.io.emit(chunk)
  }

  wait(ms: number) {
    return sleep(ms, this.io.signal)
  }

  fill(op: FillOp) {
    this.emit({ type: 'data-fill', data: op, transient: true })
  }

  activity(label: string | null) {
    this.fill({ op: 'activity', label })
  }

  async text(text: string, wordsPerTick = 2, tickMs = 28) {
    const id = nextId('t')
    this.emit({ type: 'text-start', id })
    const words = text.split(/(\s+)/)
    for (let i = 0; i < words.length; i += wordsPerTick * 2) {
      this.emit({ type: 'text-delta', id, delta: words.slice(i, i + wordsPerTick * 2).join('') })
      await this.wait(tickMs)
    }
    this.emit({ type: 'text-end', id })
  }

  async tool(toolName: string, title: string, input: unknown, output: unknown, runMs = 450) {
    const toolCallId = nextId('c')
    this.emit({ type: 'tool-input-available', toolCallId, toolName, input, dynamic: true, title })
    await this.wait(runMs)
    this.emit({ type: 'tool-output-available', toolCallId, output, dynamic: true })
  }
}

function lastUserMessage(messages: AppUIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return messages[i]
  return undefined
}

function textOf(message: AppUIMessage | undefined) {
  return (message?.parts ?? [])
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim()
}

export async function respond(messages: AppUIMessage[], io: EngineIO): Promise<void> {
  const turn = new Turn(io)
  const user = lastUserMessage(messages)
  turn.emit({ type: 'start', messageId: nextId('m') })
  turn.emit({ type: 'start-step' })
  try {
    if (user?.metadata?.command === 'run-fill') await runFill(turn)
    else if (user?.metadata?.answer) await applyAnswers(turn, user.metadata.answer)
    else await freeform(turn, textOf(user))
  } finally {
    turn.activity(null)
  }
  turn.emit({ type: 'finish-step' })
  turn.emit({ type: 'finish', finishReason: 'stop' })
}

async function runFill(turn: Turn) {
  turn.fill({ op: 'reset' })
  for (const [id, field] of Object.entries(emptyFields())) turn.fill({ op: 'set', fieldId: id, field })
  turn.fill({ op: 'rates', rates: { rows: [], status: 'empty' } })

  turn.activity('Building document catalog')
  await turn.text('Starting a fresh fill of **Engagement Letter v2.1** from 7 indexed documents.')
  await turn.tool('build_catalog', 'Catalogued 7 documents', { count: 7 }, { types: ['agreement', 'sow', 'notes', 'rate card', 'email', 'certificate', 'amendment'] }, 600)

  const passes: { label: string; query: string[]; fields: string[] }[] = [
    { label: 'Parties', query: ['client legal name', 'principal office', 'signatory'], fields: ['client.name', 'client.address', 'client.signatory'] },
    { label: 'Engagement', query: ['matter', 'governing law'], fields: ['matter.description', 'governingLaw'] },
    { label: 'Fees', query: ['fee basis', 'not to exceed', 'retainer', 'payment terms'], fields: ['fee.basis', 'fee.cap', 'retainer', 'paymentTerms'] },
    { label: 'Scope', query: ['litigation'], fields: ['includesLitigation'] }
  ]

  for (const pass of passes) {
    turn.activity(`Extracting ${pass.label}`)
    const docs = [...new Set(pass.fields.flatMap((id) => foundFields[id]?.sources.map((src) => src.docId) ?? []))]
    await turn.tool('search_documents', `Searched for ${pass.query.map((q) => `“${q}”`).join(', ')}`, { queries: pass.query, k: 8, documents: docs }, { hits: pass.query.length * 4 + 1, documents: docs }, 420)
    for (const id of pass.fields) {
      turn.fill({ op: 'set', fieldId: id, field: structuredClone(foundFields[id]) })
      await turn.wait(170)
    }
    if (pass.label === 'Fees') {
      await turn.tool('get_sheet_range', 'Read Rate_card_FY27.xlsx · Rates!B2:C5', { docId: 'D4', sheet: 'Rates', range: 'B2:C5' }, { rows: 4 }, 380)
      turn.fill({ op: 'rates', rates: structuredClone(foundRates) })
    }
  }

  turn.activity('Checking conflicts')
  await turn.tool('search_documents', 'Searched for “effective”, “commence”, “billing”', { queries: ['effective', 'commence', 'billing'], k: 8, documents: ['D2', 'D7', 'D3'] }, { hits: 7, documents: ['D2', 'D7', 'D3'] }, 500)
  turn.fill({ op: 'set', fieldId: 'effectiveDate', field: structuredClone(effectiveDateConflict) })
  await turn.tool('flag_conflict', 'Flagged a conflict on Effective date', { fieldId: 'effectiveDate', candidates: 2 }, { queued: true }, 250)
  turn.fill({ op: 'set', fieldId: 'billing.email', field: structuredClone(billingMissing) })
  await turn.tool('mark_missing', 'Marked Billing contact email as missing', { fieldId: 'billing.email', searched: ['billing', 'invoice', 'accounts payable'] }, { queued: true }, 250)
  turn.fill({ op: 'set', fieldId: 'scopeSummary', field: structuredClone(scopeWaiting) })

  turn.activity(null)
  await turn.text(
    '12 items are filled and every quote matched its source. Answer these two and I’ll write the scope summary.'
  )
  const qid = nextId('q')
  turn.emit({ type: 'data-question', id: qid, data: openQuestions(qid) })
}

async function applyAnswers(turn: Turn, answer: AnswerPayload) {
  const date = answer.answers['effectiveDate']
  const email = (answer.answers['billing.email'] ?? '').trim()
  const chosen = effectiveDateConflict.candidates!.find((c) => c.value === date)

  await turn.text('Thanks. Updating the letter.', 3)

  if (chosen) {
    await turn.tool('set_field', `Set Effective date to ${chosen.display}`, { fieldId: 'effectiveDate', value: chosen.value, source: 'user' }, { status: 'user_answered' }, 300)
    turn.fill({
      op: 'set',
      fieldId: 'effectiveDate',
      field: { value: chosen.value, display: chosen.display, status: 'user_answered', sources: chosen.sources, by: 'user', note: 'You chose this date' }
    })
  }

  if (email) {
    await turn.tool('set_field', `Set Billing contact email to ${email}`, { fieldId: 'billing.email', value: email, source: 'user' }, { status: 'user_answered' }, 300)
    turn.fill({ op: 'set', fieldId: 'billing.email', field: { value: email, status: 'user_answered', sources: [], by: 'user', note: 'You answered this' } })
  }

  turn.activity('Writing scope summary')
  await turn.tool('collect_evidence', 'Collected 3 quotes for the scope summary', { fieldId: 'scopeSummary' }, { quotes: 3, documents: ['D3', 'D2'] }, 600)

  const words = scopeSummaryText.split(/(\s+)/)
  let written = ''
  for (let i = 0; i < words.length; i += 6) {
    written += words.slice(i, i + 6).join('')
    const drafting: FieldState = { value: written, status: 'drafting', sources: scopeSources }
    turn.fill({ op: 'set', fieldId: 'scopeSummary', field: drafting })
    await turn.wait(55)
  }
  await turn.tool('set_narrative', 'Checked the summary against its sources', { fieldId: 'scopeSummary', refs: 3 }, { unresolvedRefs: 0, numberChecks: 'passed' }, 350)
  turn.fill({ op: 'set', fieldId: 'scopeSummary', field: { value: scopeSummaryText, status: 'verified', sources: scopeSources } })
  turn.activity(null)

  await turn.text(
    email
      ? 'All 15 items are filled. Review each section, approve it, then export the letter.'
      : 'The scope summary is written. Billing contact email is still empty, so the letter shows a placeholder there.'
  )
}

async function freeform(turn: Turn, text: string) {
  const q = text.toLowerCase()
  if (/net ?30|payment/.test(q)) {
    await turn.tool('read_document_section', 'Read Acme_MSA_signed_2026-03.pdf · p.9', { docId: 'D1', pages: [9] }, { tokens: 412 }, 400)
    await turn.text(
      'Payment terms come from **MSA §7.2** (Acme_MSA_signed_2026-03.pdf, p.9): “Client shall pay each undisputed invoice within thirty (30) days of the invoice date.” I normalized that to *Net 30*.'
    )
  } else if (/rate|partner|paralegal|associate/.test(q)) {
    await turn.tool('get_sheet_range', 'Read Rate_card_FY27.xlsx · Rates!B2:C5', { docId: 'D4', sheet: 'Rates', range: 'B2:C5' }, { rows: 4 }, 400)
    await turn.text(
      'The hourly rates come from **Rate_card_FY27.xlsx**, sheet *Rates*, cells B2:C5: Partner $650, Senior Associate $425, Associate $310, Paralegal $180. The SOW points to “the rates in Schedule A”, which matches this card.'
    )
  } else if (/litigation|halvorsen/.test(q)) {
    await turn.text(
      'The kickoff notes (p.1) say “Litigation is out of scope for now”, so the checkbox is unticked and the scope summary excludes the Halvorsen dispute.'
    )
  } else if (/export|docx|pdf|word/.test(q)) {
    await turn.text(
      'Export fills **layout.docx** with docxtemplater from the values in the fill state, so the file you save is the same document the Preview tab shows. PDF output would go through LibreOffice, which this preview doesn’t include.'
    )
  } else {
    await turn.text(
      'This preview runs a simulated agent, so it only answers a few scripted questions. Try “Where did Net 30 come from?” or “Which rates did you use?”. With the Copilot SDK connected, I would search your documents and cite what I find.'
    )
  }
}
