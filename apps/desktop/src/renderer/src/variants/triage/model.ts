import { fieldDefs, sections, type FieldDef, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState, FieldStatus, RatesState, SourceRef } from '../../../../shared/protocol'
import { displayValue } from '@/lib/store'

// The review inbox: every template field plus the hourly-rate table, as one
// flat list of items the user proves against their evidence.

export const RATES_ID = 'hourlyRates'

export interface Item {
  id: string
  label: string
  tag: string
  kind: FieldDef['kind'] | 'rates'
  required?: boolean
  help?: string
  section: SectionDef
  /** Position in the template (1-based), for "3 of 15". */
  n: number
}

export const items: Item[] = sections
  .flatMap((section) => [
    ...section.fields.map((id) => ({ ...fieldDefs[id], section })),
    ...(section.hasRates
      ? [{ id: RATES_ID, label: 'Hourly rates', tag: '{#hourlyRates}…{/}', kind: 'rates' as const, required: true, section }]
      : [])
  ])
  .map((item, i) => ({ ...item, n: i + 1 }))

export const itemById: Record<string, Item> = Object.fromEntries(items.map((i) => [i.id, i]))

export type Group = 'needs' | 'review' | 'approved'
export const groupOrder: Group[] = ['needs', 'review', 'approved']
export const groupTitle: Record<Group, string> = { needs: 'Needs you', review: 'To review', approved: 'Approved' }

export function statusOf(id: string, fields: Record<string, FieldState>, rates: RatesState): FieldStatus {
  return id === RATES_ID ? rates.status : (fields[id]?.status ?? 'empty')
}

export function groupOf(status: FieldStatus): Group {
  if (status === 'conflict' || status === 'missing') return 'needs'
  if (status === 'approved') return 'approved'
  return 'review'
}

export const canApprove = (s: FieldStatus) => s === 'verified' || s === 'user_answered'
export const isWaiting = (s: FieldStatus) => s === 'empty' || s === 'drafting'

const editableKinds = new Set<Item['kind']>(['text', 'email', 'money', 'date', 'narrative'])
export function canEdit(item: Item, status: FieldStatus) {
  return editableKinds.has(item.kind) && status !== 'conflict' && status !== 'missing' && !isWaiting(status)
}

/** Every quote behind an item (both sides of a conflict). */
export function sourcesOf(id: string, fields: Record<string, FieldState>, rates: RatesState): SourceRef[] {
  if (id === RATES_ID) return rates.rows.flatMap((r) => (r.source ? [r.source] : []))
  const f = fields[id]
  if (!f) return []
  if (f.status === 'conflict') return (f.candidates ?? []).flatMap((c) => c.sources)
  return f.sources
}

export function docIdsOf(sources: SourceRef[]) {
  return [...new Set(sources.map((s) => s.docId))]
}

/** Short value text for a list row. */
export function rowValue(id: string, fields: Record<string, FieldState>, rates: RatesState): string | null {
  if (id === RATES_ID) {
    if (!rates.rows.length) return null
    const r = rates.rows.map((x) => x.rate)
    return `${rates.rows.length} rates · $${Math.min(...r)}–$${Math.max(...r)}`
  }
  const v = displayValue(fields[id])
  return v ? v.split('\n')[0] : null
}

/**
 * Visible items grouped for the inbox. Needs-you lists conflicts first (the
 * one decision that unblocks the agent); To review puts values that are
 * ready before ones the agent is still writing.
 */
export function groupItems(fields: Record<string, FieldState>, rates: RatesState, filter: string) {
  const out: Record<Group, Item[]> = { needs: [], review: [], approved: [] }
  for (const item of items) {
    if (filter !== 'all' && item.section.id !== filter) continue
    out[groupOf(statusOf(item.id, fields, rates))].push(item)
  }
  const rank = (s: FieldStatus) => (s === 'conflict' ? 0 : s === 'missing' ? 1 : isWaiting(s) ? 3 : 2)
  for (const g of groupOrder) out[g].sort((a, b) => rank(statusOf(a.id, fields, rates)) - rank(statusOf(b.id, fields, rates)) || a.n - b.n)
  return out
}

export function visibleOrder(fields: Record<string, FieldState>, rates: RatesState, filter: string): Item[] {
  const g = groupItems(fields, rates, filter)
  return groupOrder.flatMap((k) => g[k])
}

/** Suggested questions the agent can answer for a given item. */
export const suggestionsFor = (id: string) => {
  const all = ['Where did Net 30 come from?', 'Which rates did you use?', 'Why is litigation excluded?']
  const first = id === 'paymentTerms' ? all[0] : id === RATES_ID ? all[1] : id === 'includesLitigation' || id === 'scopeSummary' ? all[2] : null
  return first ? [first, ...all.filter((s) => s !== first)] : all
}

export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
