import { create } from 'zustand'
import { fieldDefs, sections, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState, FieldStatus, QuestionItem, QuestionSet, RatesState } from '../../../../shared/protocol'

// Canvas-local state and helpers. The shared store owns the fill; this owns
// which value's card is open and the answers drafted on the page.

export const RATES = 'hourlyRates'

/** Every reviewable item in document order (fields plus the rate table). */
export const fieldOrder: string[] = sections.flatMap((s) => [...s.fields, ...(s.hasRates ? [RATES] : [])])

export const labelOf = (id: string) => (id === RATES ? 'Hourly rates' : (fieldDefs[id]?.label ?? id))

export const sectionOf = (id: string): SectionDef | undefined =>
  sections.find((s) => s.fields.includes(id) || (id === RATES && s.hasRates))

export const statusOf = (id: string, fields: Record<string, FieldState>, rates: RatesState): FieldStatus =>
  id === RATES ? rates.status : (fields[id]?.status ?? 'empty')

export const needsYou = (s: FieldStatus) => s === 'conflict' || s === 'missing'

export const attentionIds = (fields: Record<string, FieldState>, rates: RatesState) =>
  fieldOrder.filter((id) => needsYou(statusOf(id, fields, rates)))

/** The next value after `fromId` (or from the top) that still wants a decision. */
export function nextToReview(fields: Record<string, FieldState>, rates: RatesState, fromId?: string) {
  const i = fromId ? fieldOrder.indexOf(fromId) : -1
  for (let k = 1; k <= fieldOrder.length; k++) {
    const id = fieldOrder[(i + k + fieldOrder.length) % fieldOrder.length]
    if (id === fromId) continue
    const st = statusOf(id, fields, rates)
    if (st === 'verified' || st === 'user_answered' || needsYou(st)) return id
  }
  return null
}

export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/** How a drafted answer reads in the letter (choice values show their label). */
export function draftDisplay(item: QuestionItem, value: string) {
  return item.options?.find((o) => o.value === value)?.display ?? value.trim()
}

export function isItemAnswered(item: QuestionItem, value: string | undefined) {
  const v = (value ?? '').trim()
  if (!v) return false
  return item.inputType === 'email' ? emailOk(v) : true
}

export function draftProgress(question: QuestionSet, values: Record<string, string>) {
  const answered = question.items.filter((i) => isItemAnswered(i, values[i.fieldId])).length
  const invalid = question.items.some((i) => i.inputType === 'email' && (values[i.fieldId] ?? '').trim() !== '' && !emailOk(values[i.fieldId]))
  const ready = question.items.filter((i) => i.kind === 'choice').every((i) => values[i.fieldId]) && !invalid
  return { answered, total: question.items.length, ready, invalid }
}

export interface OpenTarget {
  fieldId: string
  /** Which occurrence on the page (a name can appear three times). */
  nth: number
  /** Move keyboard focus into the card. */
  focus: boolean
  /** Scroll the page to the value before opening. */
  scroll: boolean
  /** New on every open, so effects re-run for the same field. */
  key: number
}

const readRail = () => {
  try {
    return localStorage.getItem('ftt-canvas-rail') === 'collapsed'
  } catch {
    return false
  }
}

interface CanvasState {
  open: OpenTarget | null
  draftQid: string | null
  draft: Record<string, string>
  railCollapsed: boolean
  sheetOpen: boolean
  outlineOpen: boolean
  composerText: string
  composerFocus: number
  openField: (fieldId: string, opts?: Partial<Pick<OpenTarget, 'nth' | 'focus' | 'scroll'>>) => void
  closeField: () => void
  setAnswer: (qid: string, fieldId: string, value: string) => void
  clearDraft: () => void
  setRailCollapsed: (v: boolean) => void
  setSheetOpen: (v: boolean) => void
  setOutlineOpen: (v: boolean) => void
  setComposerText: (v: string) => void
  /** Put text in the composer and move focus there. */
  askAbout: (text: string) => void
}

let openKey = 0

export const useCanvas = create<CanvasState>((set) => ({
  open: null,
  draftQid: null,
  draft: {},
  railCollapsed: readRail(),
  sheetOpen: false,
  outlineOpen: false,
  composerText: '',
  composerFocus: 0,
  openField: (fieldId, opts) =>
    set({ open: { fieldId, nth: opts?.nth ?? 0, focus: opts?.focus ?? false, scroll: opts?.scroll ?? false, key: ++openKey } }),
  closeField: () => set({ open: null }),
  setAnswer: (qid, fieldId, value) =>
    set((s) => {
      const base = s.draftQid === qid ? { ...s.draft } : {}
      if (value === '') delete base[fieldId]
      else base[fieldId] = value
      return { draftQid: qid, draft: base }
    }),
  clearDraft: () => set({ draftQid: null, draft: {} }),
  setRailCollapsed: (v) => {
    try {
      localStorage.setItem('ftt-canvas-rail', v ? 'collapsed' : 'open')
    } catch {
      /* storage unavailable: the choice lasts for this session */
    }
    set({ railCollapsed: v })
  },
  setSheetOpen: (v) => set({ sheetOpen: v }),
  setOutlineOpen: (v) => set({ outlineOpen: v }),
  setComposerText: (v) => set({ composerText: v }),
  askAbout: (text) => set((s) => ({ composerText: text, sheetOpen: true, composerFocus: s.composerFocus + 1 }))
}))

const EMPTY: Record<string, string> = {}

/** Drafted answers for the open question set (empty for any other set). */
export function useDraft(question: QuestionSet | null) {
  const qid = useCanvas((s) => s.draftQid)
  const draft = useCanvas((s) => s.draft)
  return question && qid === question.id ? draft : EMPTY
}
