import { useEffect, useState } from 'react'
import { create } from 'zustand'

// UI state local to the Tray prototype. Fill state, answers and the chat stay
// in the shared store; this only tracks the tray, the sources rail and what
// the user is pointing at.

export type TrayPhase = 'idle' | 'applying' | 'done'

interface TrayState {
  /** The Needs-you tray is expanded. */
  expanded: boolean
  /** Field whose question should take focus when the tray opens. */
  focus: string | null
  /** Bumped on every open request so the same field can be focused twice. */
  focusNonce: number
  /** Unsent answers, per question set. */
  drafts: Record<string, Record<string, string>>
  /** After "Send answers": the agent applying them, then a short confirmation. */
  phase: TrayPhase
  phaseSince: number
  /** Field ids the answers changed, shown in the confirmation. */
  updated: string[]
  /** Document under the pointer in a citation chip (lights it up in the rail). */
  hoverDoc: string | null
  /** Sources stay open as a real column instead of a rail. */
  pinned: boolean

  openTray: (fieldId?: string | null) => void
  foldTray: () => void
  setDraft: (qid: string, fieldId: string, value: string) => void
  startApplying: () => void
  finishApplying: (updated: string[]) => void
  settle: () => void
  setHoverDoc: (docId: string | null) => void
  setPinned: (pinned: boolean) => void
}

const PIN_KEY = 'ftt-tray-sources-pinned'

function readPinned() {
  try {
    return localStorage.getItem(PIN_KEY) === '1'
  } catch {
    return false
  }
}

export const useTray = create<TrayState>((set) => ({
  expanded: false,
  focus: null,
  focusNonce: 0,
  drafts: {},
  phase: 'idle',
  phaseSince: 0,
  updated: [],
  hoverDoc: null,
  pinned: readPinned(),

  openTray: (fieldId = null) => set((s) => ({ expanded: true, focus: fieldId, focusNonce: s.focusNonce + 1 })),
  foldTray: () => set({ expanded: false, focus: null }),
  setDraft: (qid, fieldId, value) => set((s) => ({ drafts: { ...s.drafts, [qid]: { ...s.drafts[qid], [fieldId]: value } } })),
  startApplying: () => set({ phase: 'applying', phaseSince: Date.now(), expanded: false, focus: null, updated: [] }),
  finishApplying: (updated) => set({ phase: 'done', updated }),
  settle: () => set({ phase: 'idle', updated: [] }),
  setHoverDoc: (hoverDoc) => set((s) => (s.hoverDoc === hoverDoc ? s : { hoverDoc })),
  setPinned: (pinned) => {
    try {
      localStorage.setItem(PIN_KEY, pinned ? '1' : '0')
    } catch {
      /* storage unavailable: the choice lasts for this session */
    }
    set({ pinned })
  }
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

export function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return false
  if (el.isContentEditable) return true
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="combobox"]')
}

/** The doc id inside a shared CitationChip (its first mono span), if the element is in one. */
export function citedDocAt(target: EventTarget | null): string | null {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return null
  const chip = el.closest<HTMLElement>('[data-cite-doc], button.group\\/cite')
  if (!chip) return null
  return chip.dataset.citeDoc ?? chip.querySelector('span')?.textContent?.trim() ?? null
}
