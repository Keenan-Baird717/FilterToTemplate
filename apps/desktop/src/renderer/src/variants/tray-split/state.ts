import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { useApp } from '@/lib/store'

// UI state local to the Split prototype. Fill state, answers and the chat stay
// in the shared store; this only tracks the tray, the sources rail, the agent
// drawer and which field is selected across the list and the letter.

export type TrayPhase = 'idle' | 'applying' | 'done'
/** Where a selection came from, so the other side scrolls to it (and the source side doesn't jump). */
export type SelectOrigin = 'row' | 'letter' | 'tray' | 'reveal'

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
  /** The field selected in the list and outlined in the letter. */
  selected: string | null
  selectOrigin: SelectOrigin
  selectNonce: number
  /** The agent conversation is open as a drawer over the letter. */
  agentOpen: boolean
  /** The conversation stays open as a column instead of a drawer. */
  agentPinned: boolean
  /** Bumped to put the cursor in the message box. */
  composeNonce: number

  openTray: (fieldId?: string | null) => void
  foldTray: () => void
  setDraft: (qid: string, fieldId: string, value: string) => void
  startApplying: () => void
  finishApplying: (updated: string[]) => void
  settle: () => void
  setHoverDoc: (docId: string | null) => void
  setPinned: (pinned: boolean) => void
  select: (fieldId: string | null, origin?: SelectOrigin) => void
  openAgent: (compose?: boolean) => void
  closeAgent: () => void
  setAgentPinned: (pinned: boolean) => void
}

const PIN_KEY = 'ftt-tray-split-sources-pinned'
const AGENT_PIN_KEY = 'ftt-tray-split-agent-pinned'

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

/** localStorage that never throws (for the remembered split width). */
export const safeStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value)
    } catch {
      /* storage unavailable */
    }
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
  pinned: readFlag(PIN_KEY),
  selected: null,
  selectOrigin: 'row',
  selectNonce: 0,
  agentOpen: false,
  agentPinned: readFlag(AGENT_PIN_KEY),
  composeNonce: 0,

  // Opening the tray on a field also selects it, so the letter shows where the answer goes.
  openTray: (fieldId = null) =>
    set((s) => ({
      expanded: true,
      focus: fieldId,
      focusNonce: s.focusNonce + 1,
      ...(fieldId ? { selected: fieldId, selectOrigin: 'tray' as const, selectNonce: s.selectNonce + 1 } : {})
    })),
  foldTray: () => set({ expanded: false, focus: null }),
  setDraft: (qid, fieldId, value) => set((s) => ({ drafts: { ...s.drafts, [qid]: { ...s.drafts[qid], [fieldId]: value } } })),
  startApplying: () => set({ phase: 'applying', phaseSince: Date.now(), expanded: false, focus: null, updated: [] }),
  finishApplying: (updated) => set({ phase: 'done', updated }),
  settle: () => set({ phase: 'idle', updated: [] }),
  setHoverDoc: (hoverDoc) => set((s) => (s.hoverDoc === hoverDoc ? s : { hoverDoc })),
  setPinned: (pinned) => {
    writeFlag(PIN_KEY, pinned)
    set({ pinned })
  },
  select: (selected, origin = 'row') => set((s) => ({ selected, selectOrigin: origin, selectNonce: s.selectNonce + 1 })),
  openAgent: (compose = false) => set((s) => ({ agentOpen: !s.agentPinned, composeNonce: compose ? s.composeNonce + 1 : s.composeNonce })),
  closeAgent: () => set({ agentOpen: false }),
  setAgentPinned: (agentPinned) => {
    writeFlag(AGENT_PIN_KEY, agentPinned)
    set({ agentPinned, agentOpen: false })
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

/** Scroll an element into view inside one scroll box only (never the panes around it). */
export function scrollIntoBox(
  box: HTMLElement | null | undefined,
  el: HTMLElement | null | undefined,
  { block = 'center', behavior = 'smooth', pad = 40 }: { block?: 'center' | 'nearest'; behavior?: ScrollBehavior; pad?: number } = {}
) {
  if (!box || !el) return
  const b = box.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  if (r.top >= b.top + pad && r.bottom <= b.bottom - pad) return
  let delta: number
  if (block === 'nearest') delta = r.bottom > b.bottom - pad ? r.bottom - (b.bottom - pad) : r.top - (b.top + pad)
  else if (r.height > b.height - pad * 2) delta = r.top - (b.top + pad)
  else delta = r.top - b.top - (b.height - r.height) / 2
  box.scrollTo({ top: Math.max(0, box.scrollTop + delta), behavior })
}

export const DESKTOP_QUERY = '(min-width: 1024px)'
export const WIDE_QUERY = '(min-width: 1280px)'

/** Open the conversation: the drawer on desktop, the Agent tab on phones. */
export function openConversation(compose = false) {
  if (window.matchMedia(DESKTOP_QUERY).matches) {
    useTray.getState().openAgent(compose)
    return
  }
  useApp.getState().setPane('chat')
  if (compose) useTray.setState((s) => ({ composeNonce: s.composeNonce + 1 }))
}
