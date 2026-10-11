import { useSyncExternalStore } from 'react'
import { create } from 'zustand'
import type { DemoDocument } from '../../../../agent-core/demo-data'
import type { FieldState, QuestionSet } from '../../../../shared/protocol'
import { useApp } from '@/lib/store'

// Local UI state for the Dock layout: which document the pointer is pointing
// at (citation chip hover), files the user just added, and the focus card.

export type CardMode = 'open' | 'min'

interface Applying {
  question: QuestionSet
  values: Record<string, string>
  startedAt: number
}

interface DockUI {
  /** Document under a hovered citation chip anywhere in the layout. */
  hoverDoc: string | null
  setHoverDoc: (docId: string | null) => void

  /** Files added in this session (they make the dock peek while they parse). */
  added: string[]
  noteAdded: (ids: string[]) => void

  /** Focus card: which question set it tracks, open or minimized, current step and draft answers. */
  forId: string | null
  mode: CardMode
  step: number
  values: Record<string, string>
  /** Bumps when the user asks for the card, so it can take focus. */
  focusTick: number
  /** Set after Send answers while the agent applies them. */
  applying: Applying | null

  syncQuestion: (q: QuestionSet | null) => void
  openCard: (q: QuestionSet, fieldId?: string) => void
  minimize: () => void
  setStep: (step: number) => void
  setValue: (fieldId: string, value: string) => void
  beginApplying: (a: Applying) => void
  endApplying: () => void
}

export const useDock = create<DockUI>((set, get) => ({
  hoverDoc: null,
  setHoverDoc: (hoverDoc) => {
    if (get().hoverDoc !== hoverDoc) set({ hoverDoc })
  },

  added: [],
  noteAdded: (ids) => set((s) => ({ added: [...s.added, ...ids] })),

  forId: null,
  mode: 'open',
  step: 0,
  values: {},
  focusTick: 0,
  applying: null,

  syncQuestion: (q) => {
    if (q && q.id !== get().forId) set({ forId: q.id, mode: 'open', step: 0, values: {} })
  },
  openCard: (q, fieldId) => {
    const app = useApp.getState()
    if (app.answered[q.id] === 'skipped') app.reopenQuestion(q.id)
    const idx = fieldId ? q.items.findIndex((i) => i.fieldId === fieldId) : -1
    set((s) => {
      const same = s.forId === q.id
      return {
        forId: q.id,
        mode: 'open',
        step: idx >= 0 ? idx : same ? s.step : 0,
        values: same ? s.values : {},
        focusTick: s.focusTick + 1
      }
    })
    // One pane at a time on narrow screens: the card lives with the fields.
    app.setPane('template')
  },
  minimize: () => set({ mode: 'min' }),
  setStep: (step) => set({ step }),
  setValue: (fieldId, value) => set((s) => ({ values: { ...s.values, [fieldId]: value } })),
  beginApplying: (applying) => set({ applying, mode: 'open' }),
  endApplying: () => set({ applying: null })
}))

export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/** True while the field still needs the user (a question set can name it). */
export const needsYou = (f: FieldState | undefined) => f?.status === 'conflict' || f?.status === 'missing'

/** A short, readable label for a file name: "Kickoff_call_notes_2026-09-18.docx" → "Kickoff call notes". */
export function shortName(name: string) {
  let s = name
    .replace(/\.[^.]+$/, '')
    .replace(/^RE_\s*/i, 'RE: ')
    .replace(/_+/g, ' ')
    .replace(/\b(19|20)\d{2}-\d{2}(-\d{2})?\b/g, '')
    .replace(/^Acme\s+/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
  if (!s) s = name
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function docSize(doc: DemoDocument) {
  if (doc.kind === 'xlsx') return '1 sheet'
  if (doc.kind === 'eml') return '1 message'
  return `${doc.pages} page${doc.pages === 1 ? '' : 's'}`
}

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** Was focus in a text field when this key event fired? Shortcuts stay quiet there. */
export function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null
  if (!t) return false
  return t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)
}

/** Any modal (source drawer, command menu) open? Then Esc and digits belong to it. */
export function modalOpen() {
  const s = useApp.getState()
  return !!s.source || s.commandOpen || !!document.querySelector('[role="dialog"][data-state="open"]')
}

/** Scroll a field row into view inside the field list only (never the page). */
export function scrollToRow(fieldId: string, smooth = true) {
  const row = document.getElementById(`field-${fieldId}`)
  const vp = row?.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
  if (!row || !vp) return
  const top = vp.scrollTop + row.getBoundingClientRect().top - vp.getBoundingClientRect().top - vp.clientHeight * 0.28
  vp.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
}

/** Show a field row: Fields tab, template pane, scrolled into view, with the change wash. */
export function showRow(fieldId: string, smooth = true) {
  const app = useApp.getState()
  app.setView('fields')
  app.setPane('template')
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      scrollToRow(fieldId, smooth)
      useApp.setState((s) => ({ flash: { ...s.flash, [fieldId]: Date.now() } }))
    })
  )
}
