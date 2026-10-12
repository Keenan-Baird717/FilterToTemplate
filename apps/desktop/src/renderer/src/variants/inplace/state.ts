import { create } from 'zustand'
import { fieldDefs, sections } from '../../../../agent-core/demo-data'
import type { FieldState, QuestionItem, QuestionSet, SourceRef } from '../../../../shared/protocol'
import { locatorText } from '@/components/status'
import { useApp } from '@/lib/store'

// Layout-local state for "In place": which value the user is looking at
// (drives the Evidence pane), answers being drafted inside the rows, and the
// short "applying your answers" phase after they are sent.

/** Every row in display order, rate table included (for ↑/↓). */
export const rowOrder = sections.flatMap((s) => [...s.fields, ...(s.hasRates ? ['hourlyRates'] : [])])

const shortLabels: Record<string, string> = { 'billing.email': 'Billing email' }
export const labelOf = (id: string) => (id === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[id]?.label ?? id))
export const shortLabelOf = (id: string) => shortLabels[id] ?? labelOf(id)

export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/** Matches a citation chip (docId + locator) to its evidence card. */
export const sourceKey = (s: Pick<SourceRef, 'docId' | 'page' | 'locator'>) => `${s.docId}|${locatorText(s as SourceRef)}`

export interface Sent {
  questionId: string
  values: Record<string, string>
  at: number
  /** Field values when the answers went out, to count what the agent changed. */
  before: Record<string, FieldState['value']>
  phase: 'sending' | 'applying' | 'done'
  changed?: number
}

interface InplaceState {
  selected: string | null
  /** Evidence card to emphasize (set when a citation chip is hovered). */
  focusSource: string | null
  /** The open question set, mirrored here so rows don't each subscribe to the chat. */
  question: QuestionSet | null
  drafts: Record<string, Record<string, string>>
  /** Set when the user tries to send with a required answer missing. */
  nudgeAt: number
  sent: Sent | null
  select: (id: string | null, focusSource?: string | null) => void
  setDraft: (questionId: string, fieldId: string, value: string) => void
}

export const useInplace = create<InplaceState>((set) => ({
  selected: null,
  focusSource: null,
  question: null,
  drafts: {},
  nudgeAt: 0,
  sent: null,
  select: (id, focusSource = null) => set({ selected: id, focusSource }),
  setDraft: (questionId, fieldId, value) =>
    set((s) => ({ drafts: { ...s.drafts, [questionId]: { ...s.drafts[questionId], [fieldId]: value } } }))
}))

const EMPTY: Record<string, string> = {}
const askable = (f: FieldState | undefined) => f?.status === 'conflict' || f?.status === 'missing'

export interface AskState {
  question: QuestionSet | null
  /** Items whose field still needs an answer, in question order. */
  items: QuestionItem[]
  drafts: Record<string, string>
  done: (item: QuestionItem) => boolean
  answered: number
  anyDrafted: boolean
  /** Required choices not made yet. */
  missingChoice: QuestionItem[]
  invalidEmail: QuestionItem | undefined
}

export function deriveAsk(question: QuestionSet | null, drafts: Record<string, string>, fields: Record<string, FieldState>): AskState {
  const items = question ? question.items.filter((i) => askable(fields[i.fieldId])) : []
  const value = (i: QuestionItem) => (drafts[i.fieldId] ?? '').trim()
  const done = (i: QuestionItem) => (i.kind === 'choice' ? !!value(i) : i.inputType === 'email' ? emailOk(value(i)) : !!value(i))
  return {
    question,
    items,
    drafts,
    done,
    answered: items.filter(done).length,
    anyDrafted: items.some((i) => !!value(i)),
    missingChoice: items.filter((i) => i.kind === 'choice' && !value(i)),
    invalidEmail: items.find((i) => i.inputType === 'email' && !!value(i) && !emailOk(value(i)))
  }
}

export function useAsk(): AskState {
  const question = useInplace((s) => s.question)
  const drafts = useInplace((s) => (question ? s.drafts[question.id] : undefined)) ?? EMPTY
  const fields = useApp((s) => s.fields)
  return deriveAsk(question, drafts, fields)
}

function askNow() {
  const s = useInplace.getState()
  return deriveAsk(s.question, (s.question && s.drafts[s.question.id]) || EMPTY, useApp.getState().fields)
}

/**
 * How a row presents itself: 'ask' while its question is open, 'applying'
 * between sending an answer and the agent writing it, else the normal row.
 */
export function useRowMode(id: string): 'ask' | 'applying' | 'none' {
  const ask = useAsk()
  const sent = useInplace((s) => s.sent)
  const field = useApp((s) => s.fields[id])
  if (ask.items.some((i) => i.fieldId === id)) return 'ask'
  if (sent && sent.phase !== 'done' && sent.values[id]?.trim() && askable(field)) return 'applying'
  return 'none'
}

const wide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
export const isWide = wide

/** Select a row, bring it into view (switching tab/pane), optionally focus its answer control. */
export function goToField(id: string, opts: { focus?: boolean } = {}) {
  const app = useApp.getState()
  const switching = app.view !== 'fields' || (!wide() && app.pane !== 'template')
  useInplace.getState().select(id)
  if (app.view !== 'fields') app.setView('fields')
  if (app.pane !== 'template') app.setPane('template')
  setTimeout(
    () => {
      const row = document.getElementById(`field-${id}`)
      if (!row) return
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (!opts.focus) return
      const control =
        row.querySelector<HTMLElement>('[data-answer-control] [role=radio][data-state=checked]') ??
        row.querySelector<HTMLElement>('[data-answer-control] [role=radio], [data-answer-control] input')
      control?.focus({ preventScroll: true })
    },
    switching ? 60 : 0
  )
}

/** The next row still waiting for an answer: after the selected one (wrapping), or the first. */
export function nextUnanswered(fromStart = false): string | null {
  const ask = askNow()
  const open = ask.items.filter((i) => !ask.done(i)).map((i) => i.fieldId)
  if (!open.length) return ask.items[0]?.fieldId ?? null
  const sel = fromStart ? null : useInplace.getState().selected
  const from = sel ? rowOrder.indexOf(sel) : -1
  return open.find((id) => rowOrder.indexOf(id) > from) ?? open[0]
}

export function goToNextQuestion(opts: { fromStart?: boolean } = {}) {
  const id = nextUnanswered(opts.fromStart)
  if (id) goToField(id, { focus: true })
}

export function sendDrafts(submit: (q: QuestionSet, values: Record<string, string>) => void) {
  const ask = askNow()
  if (!ask.question) return
  const blocker = ask.missingChoice[0] ?? ask.invalidEmail
  if (blocker) {
    useInplace.setState({ nudgeAt: Date.now() })
    goToField(blocker.fieldId, { focus: true })
    return
  }
  const values: Record<string, string> = {}
  for (const item of ask.question.items) values[item.fieldId] = (ask.drafts[item.fieldId] ?? '').trim()
  const fields = useApp.getState().fields
  const before = Object.fromEntries(Object.keys(fieldDefs).map((id) => [id, fields[id]?.value ?? null]))
  useInplace.setState({ sent: { questionId: ask.question.id, values, at: Date.now(), before, phase: 'sending' } })
  submit(ask.question, values)
}
