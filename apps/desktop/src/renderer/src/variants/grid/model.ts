import { fieldDefs, sections, type FieldKind, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState, FieldStatus, RatesState, RateRow as Rate, SourceRef } from '../../../../shared/protocol'
import { DONE, displayValue } from '@/lib/store'
import { locatorText } from '@/components/status'
import type { Filter } from './state'

// The sheet's row model: one item per tracked template value (14 fields plus
// the hourly-rate table), grouped by template section.

export const RATES = 'hourlyRates'
export const ratesTag = '{#hourlyRates}…{/}'

export interface ItemRow {
  type: 'item'
  key: string
  fieldId: string
  sectionId: string
  n: number
  label: string
  tag: string
  kind: FieldKind | 'rates'
  status: FieldStatus
  value: string | null
  sources: SourceRef[]
  by: 'agent' | 'user' | null
  field?: FieldState
}

export interface RateChildRow {
  type: 'rate'
  key: string
  fieldId: typeof RATES
  sectionId: string
  index: number
  rate: Rate
  status: FieldStatus
}

export interface GroupRow {
  type: 'group'
  key: string
  section: SectionDef
  items: ItemRow[]
  done: number
}

export type Row = GroupRow | ItemRow | RateChildRow

export const money = (n: number) => `$${n.toLocaleString('en-US')}`

function itemFor(id: string, f: FieldState | undefined, sectionId: string, n: number): ItemRow {
  const def = fieldDefs[id]
  const status = f?.status ?? 'empty'
  const sources = status === 'conflict' ? (f?.candidates ?? []).flatMap((c) => c.sources) : (f?.sources ?? [])
  const filled = status !== 'empty' && status !== 'missing' && status !== 'conflict'
  return {
    type: 'item',
    key: id,
    fieldId: id,
    sectionId,
    n,
    label: def.label,
    tag: def.tag,
    kind: def.kind,
    status,
    value: displayValue(f),
    sources,
    by: f?.by === 'user' ? 'user' : filled ? 'agent' : null,
    field: f
  }
}

function ratesItem(rates: RatesState, sectionId: string, n: number): ItemRow {
  const rs = rates.rows.map((r) => r.rate)
  return {
    type: 'item',
    key: RATES,
    fieldId: RATES,
    sectionId,
    n,
    label: 'Hourly rates',
    tag: ratesTag,
    kind: 'rates',
    status: rates.status,
    value: rs.length ? `${rs.length} roles · ${money(Math.min(...rs))}–${money(Math.max(...rs))}/hr` : null,
    sources: rates.rows.flatMap((r) => (r.source ? [r.source] : [])),
    by: rs.length ? 'agent' : null
  }
}

export function buildItems(fields: Record<string, FieldState>, rates: RatesState): ItemRow[] {
  const out: ItemRow[] = []
  let n = 0
  for (const s of sections) {
    for (const id of s.fields) out.push(itemFor(id, fields[id], s.id, ++n))
    if (s.hasRates) out.push(ratesItem(rates, s.id, ++n))
  }
  return out
}

export function matchesFilter(filter: Filter, status: FieldStatus) {
  switch (filter) {
    case 'all':
      return true
    case 'needs':
      return status === 'conflict' || status === 'missing'
    case 'unreviewed':
      return status === 'verified' || status === 'user_answered'
    case 'approved':
      return status === 'approved'
  }
}

export function filterCounts(items: ItemRow[]): Record<Filter, number> {
  const c: Record<Filter, number> = { all: items.length, needs: 0, unreviewed: 0, approved: 0 }
  for (const it of items) {
    if (matchesFilter('needs', it.status)) c.needs++
    if (matchesFilter('unreviewed', it.status)) c.unreviewed++
    if (matchesFilter('approved', it.status)) c.approved++
  }
  return c
}

const norm = (s: string) => s.toLowerCase()

function itemMatches(it: ItemRow, q: string) {
  if (!q) return true
  const hay = [it.label, it.tag, it.fieldId, it.value ?? '', ...it.sources.map((s) => `${s.docId} ${s.quote}`)].join(' ')
  return norm(hay).includes(q)
}

function rateMatches(r: Rate, q: string) {
  return norm(`${r.role} ${r.rate} ${money(r.rate)}`).includes(q)
}

export interface ViewOptions {
  filter: Filter
  query: string
  grouped: boolean
  collapsed: Record<string, true>
  ratesOpen: boolean
}

/** Rows to render, in order, after filter, search, grouping and collapse. */
export function visibleRows(items: ItemRow[], rates: RatesState, o: ViewOptions): Row[] {
  const q = norm(o.query.trim())
  const narrowed = o.filter !== 'all' || !!q
  const out: Row[] = []

  const pushItem = (it: ItemRow) => {
    out.push(it)
    if (it.key !== RATES || !o.ratesOpen) return
    const selfHit = itemMatches(it, q)
    rates.rows.forEach((rate, index) => {
      if (!q || selfHit || rateMatches(rate, q)) {
        out.push({ type: 'rate', key: `${RATES}:${rate.key}`, fieldId: RATES, sectionId: it.sectionId, index, rate, status: rates.status })
      }
    })
  }

  const passes = (it: ItemRow) =>
    matchesFilter(o.filter, it.status) && (itemMatches(it, q) || (it.key === RATES && !!q && rates.rows.some((r) => rateMatches(r, q))))

  if (!o.grouped) {
    for (const it of items) if (passes(it)) pushItem(it)
    return out
  }

  for (const section of sections) {
    const all = items.filter((i) => i.sectionId === section.id)
    const shown = all.filter(passes)
    if (narrowed && !shown.length) continue
    out.push({ type: 'group', key: `group:${section.id}`, section, items: all, done: all.filter((i) => DONE.includes(i.status)).length })
    if (o.collapsed[section.id]) continue
    for (const it of shown) pushItem(it)
  }
  return out
}

export const canApprove = (status: FieldStatus) => status === 'verified' || status === 'user_answered'

/** Short evidence text for the grid's Evidence column. */
export function evidenceText(it: ItemRow): { text: string; quote: boolean } | null {
  if (it.status === 'conflict' && it.field?.candidates) {
    return { text: it.field.candidates.map((c) => c.display).join(' vs '), quote: false }
  }
  if ((it.status === 'missing' || it.status === 'empty') && it.field?.note) return { text: it.field.note, quote: false }
  if (it.key === RATES && it.sources.length) return { text: it.sources.map((s) => s.quote).join(' · '), quote: true }
  const s = it.sources[0]
  if (s) return { text: s.quote, quote: true }
  if (it.field?.note) return { text: it.field.note, quote: false }
  return null
}

export interface HistoryEvent {
  who: 'agent' | 'you' | 'pending'
  text: string
}

const ref = (s: SourceRef) => `${s.docId} ${locatorText(s)}`.trim()

/** A simple timeline derived from the field's current state. */
export function historyOf(it: ItemRow, rates: RatesState): HistoryEvent[] {
  const out: HistoryEvent[] = []
  if (it.key === RATES) {
    if (rates.rows.length) {
      out.push({ who: 'agent', text: `Read ${rates.rows.length} rows from D4 Rates!B2:C5` })
      out.push({ who: 'agent', text: 'Matched the SOW’s “rates in Schedule A”' })
    } else out.push({ who: 'pending', text: 'Waiting for the agent' })
    if (rates.status === 'approved') out.push({ who: 'you', text: 'You approved' })
    return out
  }

  const f = it.field
  const note = f?.note ?? ''
  const agentFound = () => {
    const [first, ...rest] = f?.sources ?? []
    if (first) out.push({ who: 'agent', text: `Agent set from ${ref(first)}` })
    for (const s of rest.slice(0, 2)) out.push({ who: 'agent', text: `Confirmed by ${ref(s)}` })
    if (/^Normalized/.test(note)) out.push({ who: 'agent', text: note })
    if (first) out.push({ who: 'agent', text: 'Quote matched the source' })
  }

  switch (it.status) {
    case 'empty':
      out.push({ who: 'pending', text: note || 'Waiting for the agent' })
      break
    case 'drafting':
      out.push({ who: 'agent', text: `Agent is writing from ${f?.sources.length ?? 0} quotes` })
      break
    case 'conflict': {
      const c = f?.candidates ?? []
      out.push({ who: 'agent', text: `Agent found ${c.length} values: ${c.map((x) => `${x.display} (${x.sources.map(ref).join(', ')})`).join(', ')}` })
      out.push({ who: 'pending', text: 'Waiting for your choice' })
      break
    }
    case 'missing':
      out.push({ who: 'agent', text: note || 'Agent searched every document' })
      out.push({ who: 'pending', text: 'Waiting for your answer' })
      break
    default: {
      if (f?.by === 'user') {
        if (/chose/i.test(note)) {
          out.push({ who: 'agent', text: 'Agent found 2 conflicting values' })
          out.push({ who: 'you', text: `You chose ${it.value}` })
        } else if (/answered/i.test(note)) {
          out.push({ who: 'agent', text: 'Agent found no value in 8 documents' })
          out.push({ who: 'you', text: 'You answered' })
        } else if (/edited/i.test(note)) {
          if (f.sources[0]) out.push({ who: 'agent', text: `Agent set from ${ref(f.sources[0])}` })
          out.push({ who: 'you', text: 'You edited the value' })
        } else out.push({ who: 'you', text: 'You set this value' })
      } else agentFound()
      if (it.status === 'approved') out.push({ who: 'you', text: 'You approved' })
    }
  }
  return out
}
