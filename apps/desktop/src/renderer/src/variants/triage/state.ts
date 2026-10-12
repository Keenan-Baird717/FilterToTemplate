import { create } from 'zustand'
import { useEffect, useState } from 'react'

// UI state local to the Triage prototype. The fill state, answers and chat
// live in the shared store; this only tracks what the reviewer is looking at.

interface TriageState {
  selected: string
  filter: string
  letterOpen: boolean
  /** Narrow screens: list or detail. */
  showDetail: boolean
  editing: string | null
  /** Draft answers for the open question set, keyed by field id. */
  draft: { qid: string | null; values: Record<string, string> }
  transcriptOpen: boolean
  /** Id of the agent reply the user closed in the answer panel. */
  dismissed: string | null
  select: (id: string, opts?: { detail?: boolean }) => void
  setFilter: (filter: string) => void
  setLetterOpen: (open: boolean) => void
  setShowDetail: (show: boolean) => void
  setEditing: (id: string | null) => void
  setDraft: (qid: string | null, fieldId: string, value: string) => void
  resetDraft: (qid: string | null) => void
  setTranscriptOpen: (open: boolean) => void
  dismiss: (id: string | null) => void
}

export const useTriage = create<TriageState>((set) => ({
  selected: 'effectiveDate',
  filter: 'all',
  letterOpen: false,
  showDetail: false,
  editing: null,
  draft: { qid: null, values: {} },
  transcriptOpen: false,
  dismissed: 'm2',
  select: (id, opts) => set((s) => ({ selected: id, editing: s.selected === id ? s.editing : null, showDetail: opts?.detail ?? s.showDetail })),
  setFilter: (filter) => set({ filter }),
  setLetterOpen: (letterOpen) => set({ letterOpen }),
  setShowDetail: (showDetail) => set({ showDetail }),
  setEditing: (editing) => set({ editing }),
  setDraft: (qid, fieldId, value) => set((s) => ({ draft: { qid, values: { ...(s.draft.qid === qid ? s.draft.values : {}), [fieldId]: value } } })),
  resetDraft: (qid) => set({ draft: { qid, values: {} } }),
  setTranscriptOpen: (transcriptOpen) => set({ transcriptOpen }),
  dismiss: (dismissed) => set({ dismissed })
}))

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatch(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return match
}

/** True when keyboard shortcuts should stay out of the way (typing, dialogs). */
export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')
}

/** Brief "just changed" wash, keyed off the shared store's flash stamps. */
export function useJustChanged(stamp: number | undefined, ms = 1400) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!stamp || Date.now() - stamp > ms) return
    setOn(true)
    const t = setTimeout(() => setOn(false), ms)
    return () => clearTimeout(t)
  }, [stamp, ms])
  return on
}
