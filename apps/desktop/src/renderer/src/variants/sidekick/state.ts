import { useEffect, useState } from 'react'
import { create } from 'zustand'
import type { AnswerPayload, AppUIMessage } from '../../../../shared/protocol'

// UI state for the Sidekick layout: which side-panel tab is showing, whether
// the panel is collapsed, and the small bits of cross-pane coordination
// (hovered citation, selected row, the last answers the agent applied).

export type PanelTab = 'needs' | 'agent' | 'sources'

const read = (key: string) => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: the choice lasts for this session */
  }
}

interface SidekickState {
  tab: PanelTab
  collapsed: boolean
  /** Phones show one pane at a time: the fields, or the side panel's current tab. */
  phonePane: 'fields' | 'panel'
  /** The user picked a tab themselves; auto-switching holds off until the current turn ends. */
  manual: boolean
  /** A tab that wanted focus while we held back (its badge pulses instead). */
  attention: PanelTab | null
  /** Document under the pointer in a citation chip (lights it up in Sources). */
  hoverDoc: string | null
  /** Field row selected in the list or the document (side-by-side mode). */
  selectedId: string | null
  /** Show the letter beside the fields on very wide screens. */
  split: boolean
  /** The answers the agent finished applying, for the "your answers are in" note. */
  applied: AnswerPayload | null

  /** A tab the user chose (click, link, shortcut). */
  choose: (tab: PanelTab) => void
  /** A tab the app would like to show; respects a manual choice made this turn. */
  auto: (tab: PanelTab) => void
  endTurn: () => void
  setCollapsed: (collapsed: boolean) => void
  expand: () => void
  showFields: (fieldId?: string) => void
  setHoverDoc: (docId: string | null) => void
  select: (fieldId: string | null) => void
  setSplit: (split: boolean) => void
  setApplied: (applied: AnswerPayload | null) => void
  clearAttention: (tab: PanelTab) => void
}

export const useSidekick = create<SidekickState>((set) => ({
  tab: 'needs',
  collapsed: read('sidekick-collapsed') === '1',
  phonePane: 'fields',
  manual: false,
  attention: null,
  hoverDoc: null,
  selectedId: null,
  split: read('sidekick-split') === '1',
  applied: null,

  choose: (tab) =>
    set((s) => ({
      tab,
      collapsed: false,
      phonePane: 'panel',
      manual: true,
      attention: s.attention === tab ? null : s.attention
    })),

  auto: (tab) =>
    set((s) => {
      if (s.tab === tab && !s.collapsed) return s.attention === tab ? { attention: null } : {}
      // Agent activity already shows as a dot; only the Needs-you tab asks for attention.
      if (s.manual || s.collapsed) return tab === 'needs' ? { attention: tab } : {}
      return { tab, attention: s.attention === tab ? null : s.attention }
    }),

  endTurn: () => set({ manual: false }),

  setCollapsed: (collapsed) => {
    write('sidekick-collapsed', collapsed ? '1' : '0')
    set({ collapsed })
  },

  expand: () => {
    write('sidekick-collapsed', '0')
    set((s) => ({ collapsed: false, tab: s.attention ?? s.tab, attention: null, manual: true }))
  },

  showFields: (fieldId) => set((s) => ({ phonePane: 'fields', selectedId: fieldId ?? s.selectedId })),
  setHoverDoc: (hoverDoc) => set((s) => (s.hoverDoc === hoverDoc ? {} : { hoverDoc })),
  select: (selectedId) => set({ selectedId }),
  setSplit: (split) => {
    write('sidekick-split', split ? '1' : '0')
    set({ split })
  },
  setApplied: (applied) => set({ applied }),
  clearAttention: (tab) => set((s) => (s.attention === tab ? { attention: null } : {}))
}))

export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

export function lastUserMessage(messages: AppUIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return messages[i]
  return undefined
}

/** True while focus is in a text field, so single-key shortcuts stay out of the way. */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

/**
 * Scroll an element to the middle of its own scroll container only. Unlike
 * scrollIntoView, this never nudges overflow-hidden ancestors (the app shell).
 */
export function scrollToCenter(el: Element | null, behavior: ScrollBehavior = 'smooth') {
  if (!el) return
  let box = el.parentElement
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  if (!box) return
  const r = el.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  box.scrollTo({ top: box.scrollTop + (r.top - b.top) - (b.height - Math.min(r.height, b.height)) / 2, behavior })
}

/** Scroll an element just into view inside its own scroll container. */
export function scrollToNearest(el: Element | null) {
  if (!el) return
  let box = el.parentElement
  while (box && !/(auto|scroll)/.test(getComputedStyle(box).overflowY)) box = box.parentElement
  if (!box) return
  const r = el.getBoundingClientRect()
  const b = box.getBoundingClientRect()
  if (r.top < b.top) box.scrollTo({ top: box.scrollTop - (b.top - r.top) - 8, behavior: 'smooth' })
  else if (r.bottom > b.bottom) box.scrollTo({ top: box.scrollTop + (r.bottom - b.bottom) + 8, behavior: 'smooth' })
}
