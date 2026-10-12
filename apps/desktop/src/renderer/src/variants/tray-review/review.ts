import { useMemo } from 'react'
import { create } from 'zustand'
import { fieldDefs, sections, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState, FieldStatus, RatesState, SourceRef } from '../../../../shared/protocol'
import { displayValue, useApp } from '@/lib/store'

// Review state for the tray's second stage. The shared store owns the values
// and their approval; this only tracks where the user is in the review pass,
// what they skipped, and which approved values changed underneath them.

export const RATES = 'hourlyRates'

export interface ReviewItemDef {
  id: string
  sectionId: string
  label: string
}

/** Every reviewable item in the order the field list shows them (rates sit at the end of Fees). */
export const ITEMS: ReviewItemDef[] = sections.flatMap((s) => [
  ...s.fields.map((id) => ({ id, sectionId: s.id, label: fieldDefs[id]?.label ?? id })),
  ...(s.hasRates ? [{ id: RATES, sectionId: s.id, label: 'Hourly rates' }] : [])
])

export const labelOf = (id: string) => ITEMS.find((i) => i.id === id)?.label ?? id
export const sectionOf = (id: string): SectionDef | undefined => sections.find((s) => s.id === ITEMS.find((i) => i.id === id)?.sectionId)

/** Fields the user can retype in place. The rest go through the agent. */
const EDITABLE = new Set(['text', 'email', 'money', 'date', 'narrative'])
export const canEditInPlace = (id: string) => id !== RATES && EDITABLE.has(fieldDefs[id]?.kind ?? '')

const REVIEWABLE: FieldStatus[] = ['verified', 'user_answered', 'approved']
const UNSETTLED: FieldStatus[] = ['missing', 'conflict', 'empty', 'drafting']

export function statusOf(id: string, fields: Record<string, FieldState>, rates: RatesState): FieldStatus {
  return id === RATES ? rates.status : (fields[id]?.status ?? 'empty')
}

export function sourcesOf(id: string, fields: Record<string, FieldState>, rates: RatesState): SourceRef[] {
  if (id === RATES) return rates.rows.flatMap((r) => (r.source ? [r.source] : []))
  const f = fields[id]
  if (!f) return []
  return f.status === 'conflict' ? (f.candidates ?? []).flatMap((c) => c.sources) : f.sources
}

/** One source per page, so a narrative citing the same page twice shows it once. */
export function evidenceOf(id: string, fields: Record<string, FieldState>, rates: RatesState): SourceRef[] {
  const all = sourcesOf(id, fields, rates)
  if (id === RATES && all.length) {
    // One sheet, every rate row marked.
    const cells = all.map((s) => s.locator?.replace(/^Rates!/, '') ?? '').filter(Boolean)
    return [{ docId: all[0].docId, locator: `Rates!${cells.join(', ')}`, quote: all[0].quote }]
  }
  const seen = new Set<string>()
  return all.filter((s) => {
    const k = `${s.docId}:${s.page ?? s.locator}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export interface ReviewItem extends ReviewItemDef {
  status: FieldStatus
  reviewable: boolean
  approved: boolean
  skipped: boolean
  inQueue: boolean
}

export function buildModel(fields: Record<string, FieldState>, rates: RatesState, touched: string[], skipped: string[]) {
  const items: ReviewItem[] = ITEMS.map((it) => {
    const status = statusOf(it.id, fields, rates)
    const reviewable = REVIEWABLE.includes(status)
    const approved = status === 'approved'
    return {
      ...it,
      status,
      reviewable,
      approved,
      skipped: !approved && skipped.includes(it.id),
      // Values approved before this job started (set by you earlier) aren't part of the pass.
      inQueue: reviewable && (!approved || touched.includes(it.id))
    }
  })
  const queue = items.filter((i) => i.inQueue)
  const unapproved = queue.filter((i) => !i.approved)
  return {
    items,
    queue,
    toReview: unapproved.length,
    approved: queue.length - unapproved.length,
    leftovers: items.filter((i) => UNSETTLED.includes(i.status)),
    bySection: sections.map((s) => ({ section: s, items: items.filter((i) => i.sectionId === s.id) }))
  }
}
export type ReviewModel = ReturnType<typeof buildModel>

export interface DroppedNote {
  was: string | null
  by: 'you' | 'agent'
}

interface ReviewState {
  /** Stepping through values one at a time. */
  active: boolean
  /** The value under review, remembered after leaving so the strip can resume there. */
  cursor: string | null
  /** Bumped on every move so the row scrolls into view even when the id repeats. */
  moveNonce: number
  /** Approved during this job: they stay in the pass so Back can return to them. */
  touched: string[]
  skipped: string[]
  /** The field whose value is being retyped in place. */
  editing: string | null
  /** Approved values that changed afterwards, with what they were. */
  dropped: Record<string, DroppedNote>
  /** A one-line note in the tray ("Back to the 2 you skipped"). */
  notice: string | null
  /** Which of the current value's sources shows inline. */
  sourceIndex: number
}

const initial: ReviewState = {
  active: false,
  cursor: null,
  moveNonce: 0,
  touched: [],
  skipped: [],
  editing: null,
  dropped: {},
  notice: null,
  sourceIndex: 0
}

export const useReview = create<ReviewState>(() => ({ ...initial }))

export function useReviewModel() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const touched = useReview((s) => s.touched)
  const skipped = useReview((s) => s.skipped)
  return useMemo(() => buildModel(fields, rates, touched, skipped), [fields, rates, touched, skipped])
}

function model() {
  const { fields, rates } = useApp.getState()
  const { touched, skipped } = useReview.getState()
  return buildModel(fields, rates, touched, skipped)
}

/** First unapproved value after `from` in the pass, wrapping around. */
function nextOpen(m: ReviewModel, from: string | null, includeSkipped: boolean): string | null {
  const q = m.queue
  if (!q.length) return null
  const idx = from ? q.findIndex((i) => i.id === from) : -1
  for (let k = 1; k <= q.length; k++) {
    const it = q[(idx + k + q.length) % q.length]
    if (!it.approved && (includeSkipped || !it.skipped)) return it.id
  }
  return null
}

function moveTo(id: string, extra: Partial<ReviewState> = {}) {
  useReview.setState((s) => ({ cursor: id, moveNonce: s.moveNonce + 1, sourceIndex: 0, editing: null, notice: null, ...extra }))
}

/** After a decision: on to the next open value, then the skipped ones, then done. */
function advance(from: string) {
  const m = model()
  const next = nextOpen(m, from, false)
  if (next && next !== from) return moveTo(next)
  const skippedLeft = m.queue.filter((i) => !i.approved && i.skipped)
  if (skippedLeft.length) {
    const first = nextOpen(m, from, true)!
    return moveTo(first, {
      skipped: [],
      notice: skippedLeft.length === 1 ? 'Back to the one you skipped' : `Back to the ${skippedLeft.length} you skipped`
    })
  }
  if (next) return moveTo(next)
  // Everything approved: the tray turns into the export bar.
  useReview.setState({ active: false, cursor: null, editing: null, skipped: [], notice: null })
}

export const review = {
  start(at?: string | null) {
    const m = model()
    const { cursor } = useReview.getState()
    const find = (id: string | null | undefined) => (id ? m.queue.find((i) => i.id === id) : undefined)
    let target: string | null = find(at)?.id ?? null
    // Resume where the user left off; if that value got approved meanwhile, the next open one.
    const left = find(cursor)
    if (!target && left) target = left.approved ? nextOpen(m, left.id, true) : left.id
    target ??= nextOpen(m, null, false) ?? nextOpen(m, null, true)
    if (!target) return
    useApp.getState().setView('fields')
    useApp.getState().setPane('template')
    moveTo(target, { active: true })
  },
  leave() {
    useReview.setState({ active: false, editing: null, notice: null })
  },
  approve() {
    const id = useReview.getState().cursor
    if (!id) return
    const item = model().queue.find((i) => i.id === id)
    if (!item || item.approved) return advance(id)
    useApp.getState().approveField(id)
    stampApproval(id)
    useReview.setState((s) => ({ touched: s.touched.includes(id) ? s.touched : [...s.touched, id], skipped: s.skipped.filter((x) => x !== id) }))
    advance(id)
  },
  approveRestOfSection() {
    const id = useReview.getState().cursor
    const section = id ? sectionOf(id) : undefined
    if (!id || !section) return
    const m = model()
    const rest = m.queue.filter((i) => i.sectionId === section.id && !i.approved)
    if (!rest.length) return
    for (const it of rest) {
      useApp.getState().approveField(it.id)
      stampApproval(it.id)
    }
    useReview.setState((s) => ({
      touched: [...new Set([...s.touched, ...rest.map((i) => i.id)])],
      skipped: s.skipped.filter((x) => !rest.some((i) => i.id === x))
    }))
    const sectionItems = m.queue.filter((i) => i.sectionId === section.id)
    advance(sectionItems.at(-1)!.id)
  },
  skip() {
    const id = useReview.getState().cursor
    if (!id) return
    const item = model().queue.find((i) => i.id === id)
    if (item && !item.approved) useReview.setState((s) => ({ skipped: s.skipped.includes(id) ? s.skipped : [...s.skipped, id] }))
    advance(id)
  },
  /** Back and Next walk the whole pass, approved values included. */
  step(delta: 1 | -1) {
    const m = model()
    const { cursor } = useReview.getState()
    const idx = m.queue.findIndex((i) => i.id === cursor)
    const target = m.queue[idx + delta]?.id ?? (delta === 1 ? nextOpen(m, cursor, true) : null)
    if (target && target !== cursor) moveTo(target)
  },
  canStep(m: ReviewModel, cursor: string | null, delta: 1 | -1) {
    const idx = m.queue.findIndex((i) => i.id === cursor)
    if (idx < 0) return false
    if (m.queue[idx + delta]) return true
    return delta === 1 && !!nextOpen(m, cursor, true) && nextOpen(m, cursor, true) !== cursor
  },
  undoApproval() {
    const id = useReview.getState().cursor
    if (!id) return
    ownUnapprove.add(id)
    useApp.getState().unapproveField(id)
    ownUnapprove.delete(id)
  },
  edit(id?: string | null) {
    const target = id ?? useReview.getState().cursor
    if (!target) return
    if (canEditInPlace(target)) {
      useReview.setState({ editing: target })
      return
    }
    draftToAgent(`Change ${labelOf(target).toLowerCase()} to `)
  },
  setEditing(id: string | null) {
    useReview.setState({ editing: id })
  },
  setSourceIndex(i: number) {
    useReview.setState({ sourceIndex: i })
  },
  reset() {
    useReview.setState({ ...initial })
  }
}

/** The change stamps approvals leave in the shared store, so the rail doesn't treat them as new citations. */
export const approvalStamps = new Set<number>()
function stampApproval(id: string) {
  const at = useApp.getState().flash[id]
  if (at) approvalStamps.add(at)
}

/** Unapprovals the user asked for here: they don't leave a "changed after approval" note. */
const ownUnapprove = new Set<string>()

/**
 * Watches the shared store: an approved value that changes (the user retypes
 * it, or the agent rewrites it) drops back into review with a note. A fresh
 * fill starts the review over.
 */
export function watchApprovals(onAgentChange: (id: string) => void) {
  return useApp.subscribe((s, prev) => {
    if (s.fields === prev.fields && s.rates === prev.rates) return
    if (s.rates.status === 'empty' && prev.rates.status !== 'empty') {
      review.reset()
      return
    }
    const dropped = { ...useReview.getState().dropped }
    let changed = false
    for (const { id } of ITEMS) {
      const before = statusOf(id, prev.fields, prev.rates)
      const after = statusOf(id, s.fields, s.rates)
      if (after === 'approved' && dropped[id]) {
        delete dropped[id]
        changed = true
      }
      if (before !== 'approved' || after === 'approved' || after === 'empty' || ownUnapprove.has(id)) continue
      const field = s.fields[id]
      const by = id !== RATES && field?.by === 'user' ? 'you' : 'agent'
      dropped[id] = { was: id === RATES ? 'the previous rates' : displayValue(prev.fields[id]), by }
      changed = true
      if (by === 'agent') onAgentChange(id)
    }
    if (changed) useReview.setState({ dropped })
  })
}

/** Put a sentence in the agent's composer, for changes the field list can't make in place. */
export function draftToAgent(text: string) {
  useApp.getState().setPane('chat')
  requestAnimationFrame(() => {
    const ta = document.getElementById('chat-input') as HTMLTextAreaElement | null
    if (!ta) return
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(ta, text)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    ta.focus()
    ta.setSelectionRange(text.length, text.length)
  })
}
