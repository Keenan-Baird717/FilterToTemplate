import { useEffect, useLayoutEffect, useState, type RefObject } from 'react'
import { create } from 'zustand'
import { useOpenQuestion } from '@/lib/agent'
import { useApp } from '@/lib/store'

// View state for the Grid prototype. Fill data lives in the shared store; this
// only holds what the sheet shows and what the user has drafted.

export type Filter = 'all' | 'needs' | 'unreviewed' | 'approved'
export type Density = 'comfortable' | 'compact'
export type Panel = 'inspector' | 'document' | 'none'

interface Prefs {
  grouped: boolean
  density: Density
  panel: Panel
}

const PREFS_KEY = 'ftt-grid-prefs'

function readPrefs(): Prefs {
  const fallback: Prefs = { grouped: true, density: 'comfortable', panel: 'inspector' }
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (!raw) return fallback
    const p = JSON.parse(raw) as Partial<Prefs>
    return {
      grouped: typeof p.grouped === 'boolean' ? p.grouped : fallback.grouped,
      density: p.density === 'compact' ? 'compact' : 'comfortable',
      panel: p.panel === 'document' || p.panel === 'none' ? p.panel : 'inspector'
    }
  } catch {
    return fallback
  }
}

function writePrefs(p: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(p))
  } catch {
    /* storage unavailable: prefs last for this session only */
  }
}

interface GridState extends Prefs {
  active: string | null
  selected: Record<string, true>
  filter: Filter
  query: string
  collapsed: Record<string, true>
  ratesOpen: boolean
  editing: string | null
  /** Answers typed into the rows for the open question, keyed by field id. */
  draft: Record<string, string>
  draftFor: string | null
  /** Answers already sent, shown until the agent applies them. */
  sent: Record<string, string>
  /** Bumped to scroll the sheet to the active row. */
  reveal: number
  /** Field whose "Choose…" menu is open (so Enter can open it). */
  choosing: string | null
  consoleOpen: boolean
  /** Narrow screens: which side panel is open as a sheet. */
  sheet: 'inspector' | 'document' | null
  doneDismissed: boolean

  set: (patch: Partial<GridState>) => void
  setActive: (key: string | null) => void
  toggleSelected: (fieldId: string, on?: boolean) => void
  setSelected: (ids: string[], on: boolean) => void
  clearSelection: () => void
  toggleCollapsed: (sectionId: string, collapsed?: boolean) => void
  setDraft: (fieldId: string, value: string) => void
  setPref: <K extends keyof Prefs>(key: K, value: Prefs[K]) => void
  /** Make a row visible (clear filters, expand its group) and scroll to it. */
  revealRow: (key: string, sectionId?: string) => void
}

export const useGrid = create<GridState>((set, get) => ({
  ...readPrefs(),
  active: 'effectiveDate',
  selected: {},
  filter: 'all',
  query: '',
  collapsed: {},
  ratesOpen: true,
  editing: null,
  draft: {},
  draftFor: null,
  sent: {},
  reveal: 0,
  choosing: null,
  consoleOpen: false,
  sheet: null,
  doneDismissed: false,

  set: (patch) => set(patch),
  setActive: (active) => set({ active }),
  toggleSelected: (fieldId, on) =>
    set((s) => {
      const next = { ...s.selected }
      const want = on ?? !next[fieldId]
      if (want) next[fieldId] = true
      else delete next[fieldId]
      return { selected: next }
    }),
  setSelected: (ids, on) =>
    set((s) => {
      const next = { ...s.selected }
      for (const id of ids) {
        if (on) next[id] = true
        else delete next[id]
      }
      return { selected: next }
    }),
  clearSelection: () => set({ selected: {} }),
  toggleCollapsed: (sectionId, collapsed) =>
    set((s) => {
      const next = { ...s.collapsed }
      const want = collapsed ?? !next[sectionId]
      if (want) next[sectionId] = true
      else delete next[sectionId]
      return { collapsed: next }
    }),
  setDraft: (fieldId, value) => set((s) => ({ draft: { ...s.draft, [fieldId]: value } })),
  setPref: (key, value) => {
    set({ [key]: value } as Partial<GridState>)
    const { grouped, density, panel } = get()
    writePrefs({ grouped, density, panel })
  },
  revealRow: (key, sectionId) =>
    set((s) => {
      const collapsed = { ...s.collapsed }
      if (sectionId) delete collapsed[sectionId]
      return {
        active: key,
        collapsed,
        filter: 'all',
        query: '',
        ratesOpen: key.startsWith('hourlyRates:') ? true : s.ratesOpen,
        reveal: s.reveal + 1
      }
    })
}))

/** True while the media query matches. */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => (typeof window === 'undefined' ? true : window.matchMedia(query).matches))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [query])
  return matches
}

/** Width of an element, tracked with a ResizeObserver. */
export function useWidth(ref: RefObject<HTMLElement | null>, initial: number) {
  const [width, setWidth] = useState(initial)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

/** True for 1.4s after a field changes, for the "just changed" wash. */
export function useWash(key: string) {
  const stamp = useApp((s) => s.flash[key])
  const [wash, setWash] = useState(false)
  useEffect(() => {
    if (!stamp || Date.now() - stamp > 1400) return
    setWash(true)
    const t = setTimeout(() => setWash(false), 1400)
    return () => clearTimeout(t)
  }, [stamp])
  return wash
}

export const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/** Keyboard shortcuts must stay quiet while the user types. */
export function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el || !el.closest) return false
  return !!el.closest('input, textarea, select, [contenteditable="true"], [role="menu"], [role="dialog"], [role="listbox"]')
}

/**
 * The open question, but only while one of its fields still needs an answer.
 * During "Run again" the old question stays unanswered in the chat history;
 * this keeps the sheet from asking about fields that are being refilled.
 */
export function useLiveQuestion() {
  const question = useOpenQuestion()
  const fields = useApp((s) => s.fields)
  if (!question) return null
  const live = question.items.some((i) => {
    const st = fields[i.fieldId]?.status
    return st === 'conflict' || st === 'missing'
  })
  return live ? question : null
}
