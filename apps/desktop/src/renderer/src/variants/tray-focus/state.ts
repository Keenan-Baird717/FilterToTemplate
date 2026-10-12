import { useEffect, useState } from 'react'
import { create } from 'zustand'

// UI state local to the Focus prototype. Fill state, answers and the chat stay
// in the shared store; useTray tracks the tray, the sources rail and what the
// user is pointing at (as in Tray); useFocus tracks folded sections and the
// floating agent.

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

const PIN_KEY = 'ftt-tray-focus-sources-pinned'

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

// ---------------------------------------------------------------------------
// Focus: folded sections and the floating agent
// ---------------------------------------------------------------------------

const SHOW_ALL_KEY = 'ftt-tray-focus-show-all'
const AGENT_PIN_KEY = 'ftt-tray-focus-agent-pinned'

function readFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeFlag(key: string, on: boolean) {
  try {
    localStorage.setItem(key, on ? '1' : '0')
  } catch {
    /* storage unavailable: the choice lasts for this session */
  }
}

const without = <T,>(rec: Record<string, T>, key: string) => {
  if (!(key in rec)) return rec
  const { [key]: _gone, ...rest } = rec
  return rest
}

interface FocusState {
  /** Every section expanded, finished or not. */
  showAll: boolean
  /** Finished sections the user chose to keep open (cleared when the section reopens for work). */
  opened: Record<string, true>
  /** Finished sections shown briefly after the agent changed them: open until this time. */
  peek: Record<string, number>
  /** The pointer is over a peeking section, so it waits before folding. */
  held: Record<string, true>

  /** Floating conversation (desktop) or full-screen sheet (phone). */
  agentOpen: boolean
  /** Desktop: the conversation sits in a side column instead of floating. */
  agentPinned: boolean
  /** Unsent message, kept while the panel is closed. */
  draft: string
  /** Bumped to move focus into the composer. */
  composerNonce: number
  /** Newest agent reply the user has seen (drives the pill's "New reply"). */
  seenReply: string | null

  setShowAll: (on: boolean) => void
  openSection: (id: string) => void
  foldSection: (id: string) => void
  forgetOpened: (id: string) => void
  peekSection: (id: string, until: number) => void
  holdSection: (id: string, on: boolean) => void

  openAgent: () => void
  closeAgent: () => void
  setAgentPinned: (on: boolean) => void
  setDraft: (draft: string) => void
  markSeen: (id: string) => void
}

export const useFocus = create<FocusState>((set) => ({
  showAll: readFlag(SHOW_ALL_KEY),
  opened: {},
  peek: {},
  held: {},
  agentOpen: false,
  agentPinned: readFlag(AGENT_PIN_KEY),
  draft: '',
  composerNonce: 0,
  seenReply: null,

  setShowAll: (showAll) => {
    writeFlag(SHOW_ALL_KEY, showAll)
    set({ showAll })
  },
  openSection: (id) => set((s) => ({ opened: { ...s.opened, [id]: true }, peek: without(s.peek, id), held: without(s.held, id) })),
  foldSection: (id) => set((s) => ({ opened: without(s.opened, id), peek: without(s.peek, id), held: without(s.held, id) })),
  forgetOpened: (id) => set((s) => (id in s.opened || id in s.held ? { opened: without(s.opened, id), held: without(s.held, id) } : s)),
  peekSection: (id, until) => set((s) => ({ peek: { ...s.peek, [id]: Math.max(until, s.peek[id] ?? 0) } })),
  holdSection: (id, on) => set((s) => (on === !!s.held[id] ? s : { held: on ? { ...s.held, [id]: true } : without(s.held, id) })),

  openAgent: () => set((s) => ({ agentOpen: true, composerNonce: s.composerNonce + 1 })),
  closeAgent: () => set({ agentOpen: false }),
  setAgentPinned: (agentPinned) => {
    writeFlag(AGENT_PIN_KEY, agentPinned)
    set((s) => ({ agentPinned, agentOpen: false, composerNonce: agentPinned ? s.composerNonce + 1 : s.composerNonce }))
  },
  setDraft: (draft) => set({ draft }),
  markSeen: (seenReply) => set((s) => (s.seenReply === seenReply ? s : { seenReply }))
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
