import { create } from 'zustand'
import { documents as demoDocuments, fieldDefs, foundRates, initialFields, sections, type DemoDocument } from '../../../agent-core/demo-data'
import type { FieldState, FieldStatus, FillOp, RatesState, SourceRef } from '../../../shared/protocol'
import { defaultVariant, variantFromHash, variants } from '../variants/registry'

export type Theme = 'system' | 'light' | 'dark'
export type Pane = 'sources' | 'template' | 'chat'

export interface SourceTarget {
  docId: string
  page?: number
  quote?: string
  locator?: string
}

interface AppState {
  fields: Record<string, FieldState>
  rates: RatesState
  activity: string | null
  answered: Record<string, Record<string, string> | 'skipped'>
  docs: DemoDocument[]
  source: SourceTarget | null
  view: 'fields' | 'preview'
  pane: Pane
  theme: Theme
  highlight: boolean
  flash: Record<string, number>
  commandOpen: boolean
  variant: string

  apply: (op: FillOp) => void
  answer: (questionId: string, answers: Record<string, string> | 'skipped') => void
  editField: (fieldId: string, value: string) => void
  approveSection: (sectionId: string) => void
  /** Mark one verified or user-answered field (or 'hourlyRates') as approved. */
  approveField: (fieldId: string) => void
  /** Undo an approval: back to verified, or to user_answered for values the user set. */
  unapproveField: (fieldId: string) => void
  /** Let a skipped or answered question set be answered again. */
  reopenQuestion: (questionId: string) => void
  /** Ask the current prototype to bring a field into view (command menu, links). */
  reveal: { fieldId: string; at: number } | null
  revealField: (fieldId: string) => void
  openSource: (target: SourceTarget) => void
  closeSource: () => void
  setView: (view: AppState['view']) => void
  setPane: (pane: Pane) => void
  setTheme: (theme: Theme) => void
  setHighlight: (on: boolean) => void
  setCommandOpen: (open: boolean) => void
  focusField: (fieldId: string) => void
  reset: () => void
  setVariant: (id: string) => void
  addFiles: (files: { name: string }[]) => string[]
  advanceParsing: () => string[]
}

function readTheme(): Theme {
  try {
    const t = localStorage.getItem('ftt-theme')
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(theme: Theme) {
  const root = document.documentElement
  if (theme === 'system') delete root.dataset.theme
  else root.dataset.theme = theme
  window.ftt?.setTheme(theme)
  try {
    localStorage.setItem('ftt-theme', theme)
  } catch {
    /* storage unavailable: theme still applies for this session */
  }
}

const kindOf = (name: string): DemoDocument['kind'] => {
  const ext = name.split('.').pop()?.toLowerCase()
  if (ext === 'docx' || ext === 'doc') return 'docx'
  if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') return 'xlsx'
  if (ext === 'eml' || ext === 'msg') return 'eml'
  return 'pdf'
}

export const useApp = create<AppState>((set, get) => ({
  fields: initialFields(),
  rates: structuredClone(foundRates),
  activity: null,
  answered: {},
  docs: structuredClone(demoDocuments),
  source: null,
  view: 'fields',
  pane: 'template',
  theme: readTheme(),
  highlight: true,
  flash: {},
  commandOpen: false,
  variant: variantFromHash(typeof location === 'undefined' ? '' : location.hash).id,

  apply: (op) => {
    switch (op.op) {
      case 'reset':
        // Earlier question sets stay answered in history; useOpenQuestion only looks at the newest.
        set({ activity: null })
        return
      case 'set':
        set((s) => ({
          fields: { ...s.fields, [op.fieldId]: op.field },
          flash: op.field.status === 'drafting' ? s.flash : { ...s.flash, [op.fieldId]: Date.now() }
        }))
        return
      case 'rates':
        set((s) => ({ rates: op.rates, flash: { ...s.flash, hourlyRates: Date.now() } }))
        return
      case 'activity':
        set({ activity: op.label })
        return
    }
  },

  answer: (questionId, answers) => set((s) => ({ answered: { ...s.answered, [questionId]: answers } })),

  editField: (fieldId, value) => {
    const trimmed = value.trim()
    set((s) => ({
      fields: {
        ...s.fields,
        [fieldId]: {
          value: trimmed || null,
          status: trimmed ? 'user_answered' : 'missing',
          sources: s.fields[fieldId]?.sources ?? [],
          by: 'user',
          note: trimmed ? 'Edited by you · the agent won’t overwrite it' : undefined
        }
      },
      flash: { ...s.flash, [fieldId]: Date.now() }
    }))
  },

  approveSection: (sectionId) => {
    const section = sections.find((x) => x.id === sectionId)
    if (!section) return
    set((s) => {
      const fields = { ...s.fields }
      const flash = { ...s.flash }
      for (const id of section.fields) {
        const f = fields[id]
        if (f && (f.status === 'verified' || f.status === 'user_answered')) {
          fields[id] = { ...f, status: 'approved' }
          flash[id] = Date.now()
        }
      }
      const rates: RatesState =
        section.hasRates && s.rates.status === 'verified' ? { ...s.rates, status: 'approved' } : s.rates
      return { fields, flash, rates }
    })
  },

  approveField: (fieldId) =>
    set((s) => {
      if (fieldId === 'hourlyRates') {
        return s.rates.status === 'verified' ? { rates: { ...s.rates, status: 'approved' }, flash: { ...s.flash, hourlyRates: Date.now() } } : {}
      }
      const f = s.fields[fieldId]
      if (!f || (f.status !== 'verified' && f.status !== 'user_answered')) return {}
      return { fields: { ...s.fields, [fieldId]: { ...f, status: 'approved' } }, flash: { ...s.flash, [fieldId]: Date.now() } }
    }),

  unapproveField: (fieldId) =>
    set((s) => {
      if (fieldId === 'hourlyRates') return s.rates.status === 'approved' ? { rates: { ...s.rates, status: 'verified' } } : {}
      const f = s.fields[fieldId]
      if (!f || f.status !== 'approved') return {}
      return { fields: { ...s.fields, [fieldId]: { ...f, status: f.by === 'user' ? 'user_answered' : 'verified' } } }
    }),

  reopenQuestion: (questionId) =>
    set((s) => {
      const { [questionId]: _removed, ...rest } = s.answered
      return { answered: rest }
    }),

  reveal: null,
  revealField: (fieldId) => {
    set((s) => ({ reveal: { fieldId, at: Date.now() }, flash: { ...s.flash, [fieldId]: Date.now() } }))
    // Generic fallback for layouts that render rows with id="field-<id>".
    requestAnimationFrame(() => document.getElementById(`field-${fieldId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  },

  openSource: (target) => set({ source: target }),
  closeSource: () => set({ source: null }),
  setView: (view) => set({ view }),
  setPane: (pane) => set({ pane }),
  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },
  setHighlight: (highlight) => set({ highlight }),
  setCommandOpen: (commandOpen) => set({ commandOpen }),
  focusField: (fieldId) => {
    set({ view: 'fields', pane: 'template' })
    requestAnimationFrame(() => {
      document.getElementById(`field-${fieldId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      set((st) => ({ flash: { ...st.flash, [fieldId]: Date.now() } }))
    })
  },

  reset: () =>
    set({
      fields: initialFields(),
      rates: structuredClone(foundRates),
      activity: null,
      answered: {},
      docs: structuredClone(demoDocuments),
      source: null,
      view: 'fields',
      flash: {},
      reveal: null
    }),

  setVariant: (id) => {
    const v = variants.find((x) => x.id === id) ?? defaultVariant
    if (typeof history !== 'undefined') history.replaceState(null, '', v.id === defaultVariant.id ? location.pathname + location.search : `#${v.id}`)
    document.documentElement.dataset.variant = v.id
    set({ variant: v.id, source: null })
  },

  addFiles: (files) => {
    const start = get().docs.length
    const added: DemoDocument[] = files.map((f, i) => ({
      id: `D${start + i + 1}`,
      name: f.name,
      kind: kindOf(f.name),
      pages: 1 + ((f.name.length * 7) % 18),
      parser: kindOf(f.name) === 'pdf' ? 'text-layer' : kindOf(f.name) === 'docx' ? 'word' : kindOf(f.name) === 'xlsx' ? 'sheet' : 'email',
      status: 'parsing',
      progress: 4,
      added: 'Just now',
      content: []
    }))
    set((s) => ({ docs: [...s.docs, ...added] }))
    return added.map((d) => d.id)
  },

  advanceParsing: () => {
    const finished: string[] = []
    set((s) => ({
      docs: s.docs.map((d) => {
        if (d.status !== 'parsing' || d.id === 'D8') return d
        const progress = Math.min(100, (d.progress ?? 0) + 9 + Math.round(Math.random() * 12))
        if (progress >= 100) {
          finished.push(d.name)
          return { ...d, status: 'indexed', progress: undefined }
        }
        return { ...d, progress }
      })
    }))
    return finished
  }
}))

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

export const DONE: FieldStatus[] = ['verified', 'user_answered', 'approved']

export function summarize(fields: Record<string, FieldState>, rates: RatesState) {
  const counts: Record<FieldStatus, number> = {
    empty: 0,
    verified: 0,
    conflict: 0,
    missing: 0,
    drafting: 0,
    user_answered: 0,
    approved: 0
  }
  for (const id of Object.keys(fieldDefs)) counts[fields[id]?.status ?? 'empty']++
  counts[rates.status]++
  const total = Object.keys(fieldDefs).length + 1
  const done = counts.verified + counts.user_answered + counts.approved
  return { counts, total, done }
}

export function citationsByDoc(fields: Record<string, FieldState>, rates: RatesState) {
  const out: Record<string, { fieldId: string; source: SourceRef }[]> = {}
  for (const [fieldId, f] of Object.entries(fields)) {
    const refs = f.status === 'conflict' ? (f.candidates ?? []).flatMap((c) => c.sources) : f.sources
    for (const source of refs) (out[source.docId] ??= []).push({ fieldId, source })
  }
  for (const row of rates.rows) if (row.source) (out[row.source.docId] ??= []).push({ fieldId: 'hourlyRates', source: row.source })
  return out
}

export function displayValue(f: FieldState | undefined): string | null {
  if (!f || f.value === null || f.value === '') return null
  if (f.display) return f.display
  if (typeof f.value === 'boolean') return f.value ? 'Yes' : 'No'
  return String(f.value)
}
