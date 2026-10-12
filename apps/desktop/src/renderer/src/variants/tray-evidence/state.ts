import { useEffect, useState } from 'react'
import { create } from 'zustand'
import { fieldDefs, sections } from '../../../../agent-core/demo-data'
import { useApp } from '@/lib/store'

// UI state local to the Evidence prototype. Fill state, answers and the chat
// stay in the shared store; this only tracks the tray, the left column (rail,
// live list or evidence), and what the user is pointing at.

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
  /** Field whose evidence the left column shows (desktop) or the row offers (phones). */
  selected: string | null
  /** Evidence card to bring forward after a citation click, bumped per request. */
  focusSource: { key: string; n: number } | null
  /** Evidence card linked to the citation chip under the pointer. */
  hoverSource: string | null
  /** Document of the evidence card under the pointer (outlines the row's chip). */
  hoverCardDoc: string | null
  /** Phones: the evidence bottom sheet is open. */
  sheetOpen: boolean

  openTray: (fieldId?: string | null) => void
  foldTray: () => void
  setDraft: (qid: string, fieldId: string, value: string) => void
  startApplying: () => void
  finishApplying: (updated: string[]) => void
  settle: () => void
  setHoverDoc: (docId: string | null) => void
  setPinned: (pinned: boolean) => void
  select: (fieldId: string | null, opts?: { source?: string }) => void
  setHoverSource: (key: string | null) => void
  setHoverCardDoc: (docId: string | null) => void
  setSheetOpen: (open: boolean) => void
}

const PIN_KEY = 'ftt-tray-evidence-sources-pinned'

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
  selected: null,
  focusSource: null,
  hoverSource: null,
  hoverCardDoc: null,
  sheetOpen: false,

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
  },
  select: (selected, opts) =>
    set((s) => ({
      selected,
      focusSource: selected && opts?.source ? { key: opts.source, n: (s.focusSource?.n ?? 0) + 1 } : null,
      hoverSource: null,
      hoverCardDoc: null,
      sheetOpen: selected ? s.sheetOpen : false
    })),
  setHoverSource: (hoverSource) => set((s) => (s.hoverSource === hoverSource ? s : { hoverSource })),
  setHoverCardDoc: (hoverCardDoc) => set((s) => (s.hoverCardDoc === hoverCardDoc ? s : { hoverCardDoc })),
  setSheetOpen: (sheetOpen) => set({ sheetOpen })
}))

// ---------------------------------------------------------------------------
// Fields in reading order (the rate table sits after the fee fields)
// ---------------------------------------------------------------------------

export const fieldOrder: string[] = sections.flatMap((s) => [...s.fields, ...(s.hasRates ? ['hourlyRates'] : [])])

export const labelOf = (fieldId: string) => (fieldId === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[fieldId]?.label ?? fieldId))

export const rowOf = (fieldId: string) => document.getElementById(`field-${fieldId}`)

/**
 * Give a row focus (rows are plain divs) without scrolling, so ↑/↓ keep
 * working from there. The ring only shows when the keyboard moved it.
 */
export function focusRow(fieldId: string, opts: { keyboard?: boolean } = {}) {
  const row = rowOf(fieldId)
  if (!row) return
  if (!row.hasAttribute('tabindex')) row.setAttribute('tabindex', '-1')
  row.toggleAttribute('data-te-kbd', !!opts.keyboard)
  row.focus({ preventScroll: true })
}

/** Select the previous or next field and bring its row into view. */
export function stepField(delta: 1 | -1, opts: { focus?: boolean } = {}) {
  const { selected, select } = useTray.getState()
  const i = selected ? fieldOrder.indexOf(selected) : -1
  const next = i < 0 ? fieldOrder[delta > 0 ? 0 : fieldOrder.length - 1] : fieldOrder[Math.min(fieldOrder.length - 1, Math.max(0, i + delta))]
  if (!next || next === selected) return
  select(next)
  if (useApp.getState().view !== 'fields') useApp.getState().setView('fields')
  requestAnimationFrame(() => {
    rowOf(next)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    if (opts.focus) focusRow(next, { keyboard: true })
  })
}

/**
 * A citation inside a field row or a question in the tray: which field it
 * belongs to, and the key of the matching evidence card ("D7|p.1").
 */
export function citeTarget(target: EventTarget | null): { fieldId: string; docId: string; key: string } | null {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return null
  const chip = el.closest<HTMLElement>('button[data-doc-id]')
  if (chip) {
    const host = chip.closest<HTMLElement>('[data-question], [id^="field-"]')
    if (!host) return null
    const fieldId = host.dataset.question ?? host.id.slice('field-'.length)
    const docId = chip.dataset.docId!
    const loc = chip.lastElementChild?.textContent?.trim() ?? ''
    return { fieldId, docId, key: `${docId}|${loc}` }
  }
  // The rate table cites cells with plain buttons.
  if (el.closest('#field-hourlyRates td button')) {
    const docId = useApp.getState().rates.rows.find((r) => r.source)?.source?.docId ?? 'D4'
    return { fieldId: 'hourlyRates', docId, key: `${docId}|rates` }
  }
  return null
}

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

/** The doc id of the shared CitationChip under an element, if any. */
export function citedDocAt(target: EventTarget | null): string | null {
  const el = target as HTMLElement | null
  if (!el || typeof el.closest !== 'function') return null
  return el.closest<HTMLElement>('button[data-doc-id]')?.dataset.docId ?? null
}
