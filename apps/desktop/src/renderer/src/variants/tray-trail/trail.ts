import { useEffect, useMemo, useState } from 'react'
import { create } from 'zustand'
import { fieldDefs, sections } from '../../../../agent-core/demo-data'
import type { AppUIMessage, FieldState, RatesState, SourceRef } from '../../../../shared/protocol'
import { useAgent } from '@/lib/agent'
import { chat } from '@/lib/chat'
import { displayValue, useApp } from '@/lib/store'

// The activity trail: a local log of what the agent and the user did, built
// from the chat's tool calls and from changes to the shared fill state. Each
// entry has a time, an actor and (where it applies) the field and sources it
// touched, so the rail can show a timeline and every row a history.

export type Actor = 'agent' | 'you'
export type TrailKind =
  | 'read' // a tool call that read documents
  | 'set' // the agent set (or wrote) a value
  | 'draft' // the agent is writing a value (live)
  | 'flag' // the agent found conflicting values
  | 'missing' // the agent found no value
  | 'clear' // the agent cleared a value to start over
  | 'answer' // your answer, applied by the agent
  | 'edit' // you edited a value in the list
  | 'restore' // you undid an edit
  | 'approve'
  | 'unapprove'
  | 'ask' // the agent asked you questions
  | 'asked' // you asked the agent something
  | 'skip' // you skipped questions

export interface TrailEvent {
  id: string
  turn: string
  at: number
  actor: Actor
  kind: TrailKind
  fieldId?: string
  /** Display value after the change. */
  value?: string | null
  /** Display value before the change (or the options you didn't pick). */
  prev?: string | null
  /** Field state before the change, for undo. */
  prevField?: FieldState
  sources?: SourceRef[]
  /** Documents a read touched. */
  docs?: string[]
  page?: number
  locator?: string
  title?: string
  live?: boolean
  /** Consecutive events with the same key read as one trail entry. */
  batch?: string
  verb?: 'wrote' | 'chose'
  questionId?: string
  fieldIds?: string[]
}

export type TurnKind = 'fill' | 'answers' | 'chat' | 'you'
export interface TrailTurn {
  id: string
  at: number
  kind: TurnKind
}

interface TrailState {
  turns: TrailTurn[]
  events: TrailEvent[]
  /** Everything up to this time has been seen in the trail. */
  seenAt: number
  /** Field id → when it changed while the user wasn't looking. */
  newFields: Record<string, number>
  away: boolean
  seeded: boolean
}

export const useTrail = create<TrailState>(() => ({
  turns: [],
  events: [],
  seenAt: 0,
  newFields: {},
  away: false,
  seeded: false
}))

const labelOf = (fieldId: string) => (fieldId === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[fieldId]?.label ?? fieldId))
export { labelOf }

// ---------------------------------------------------------------------------
// Store writes
// ---------------------------------------------------------------------------

let seq = 0
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`

function addTurn(turn: TrailTurn) {
  useTrail.setState((s) => (s.turns.some((t) => t.id === turn.id) ? s : { turns: [...s.turns, turn].sort((a, b) => a.at - b.at) }))
  return turn.id
}

function addEvent(e: Omit<TrailEvent, 'id'> & { id?: string }) {
  const ev = { ...e, id: e.id ?? uid('e') } as TrailEvent
  useTrail.setState((s) => ({ events: [...s.events, ev] }))
  return ev
}

function patchEvent(id: string, patch: Partial<TrailEvent>) {
  useTrail.setState((s) => ({ events: s.events.map((e) => (e.id === id ? { ...e, ...patch } : e)) }))
}

export function markTrailSeen(at = Date.now()) {
  useTrail.setState((s) => (s.seenAt >= at ? s : { seenAt: at }))
}

export function clearNew(fieldId: string) {
  useTrail.setState((s) => {
    if (!(fieldId in s.newFields)) return s
    const { [fieldId]: _gone, ...rest } = s.newFields
    return { newFields: rest }
  })
}

function markNew(fieldId: string, at: number) {
  useTrail.setState((s) => ({ newFields: { ...s.newFields, [fieldId]: at } }))
}

// ---------------------------------------------------------------------------
// Presence: is the user looking at a given row right now?
// ---------------------------------------------------------------------------

const IDLE_MS = 60_000
let lastInteraction = Date.now()

function watching(fieldId: string) {
  if (useTrail.getState().away) return false
  if (Date.now() - lastInteraction > IDLE_MS) return false
  if (useApp.getState().view !== 'fields') return false
  const el = document.getElementById(`field-${fieldId}`)
  if (!el || el.offsetParent === null) return false
  const r = el.getBoundingClientRect()
  const box = el.closest('[data-slot=scroll-area-viewport]')?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight }
  return r.bottom > box.top + 24 && r.top < box.bottom - 24
}

function usePresence() {
  useEffect(() => {
    const setAway = (away: boolean) => useTrail.setState((s) => (s.away === away ? s : { away }))
    const touch = () => {
      lastInteraction = Date.now()
      setAway(document.visibilityState !== 'visible')
    }
    const onVis = () => setAway(document.visibilityState !== 'visible')
    const onBlur = () => setAway(true)
    const onFocus = () => touch()
    setAway(document.visibilityState !== 'visible')
    window.addEventListener('pointerdown', touch, true)
    window.addEventListener('keydown', touch, true)
    window.addEventListener('wheel', touch, { passive: true, capture: true })
    window.addEventListener('pointermove', touch, { passive: true, capture: true })
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('pointerdown', touch, true)
      window.removeEventListener('keydown', touch, true)
      window.removeEventListener('wheel', touch, true)
      window.removeEventListener('pointermove', touch, true)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [])
}

// ---------------------------------------------------------------------------
// Turns: each user message starts one; your own edits between agent turns
// collect in a "Your changes" group.
// ---------------------------------------------------------------------------

/** Timestamps come from here so the opening history can be laid out in the past. */
let fakeClock: (() => number) | null = null
const clock = () => (fakeClock ? fakeClock() : Date.now())

function textOf(m: AppUIMessage) {
  return m.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim()
}

function turnKindOf(m: AppUIMessage): TurnKind {
  if (m.metadata?.command === 'run-fill') return 'fill'
  if (m.metadata?.answer) return 'answers'
  if (/^(fill|run|start)\b/i.test(textOf(m))) return 'fill'
  return 'chat'
}

function ensureTurnFor(m: AppUIMessage, at: number) {
  const kind = turnKindOf(m)
  if (!useTrail.getState().turns.some((t) => t.id === m.id)) {
    addTurn({ id: m.id, at, kind })
    if (kind === 'chat') addEvent({ id: `asked-${m.id}`, turn: m.id, at, actor: 'you', kind: 'asked', title: textOf(m) })
  }
  return m.id
}

function agentBusy() {
  return chat.status === 'submitted' || chat.status === 'streaming'
}

function currentTurn(at: number) {
  if (agentBusy()) {
    const lastUser = chat.messages.findLast((m) => m.role === 'user')
    if (lastUser) return ensureTurnFor(lastUser, at)
  }
  const { turns, events } = useTrail.getState()
  const last = turns.at(-1)
  if (last?.kind === 'you') {
    const lastAt = Math.max(last.at, ...events.filter((e) => e.turn === last.id).map((e) => e.at))
    if (at - lastAt < 10 * 60_000) return last.id
  }
  return addTurn({ id: uid('you'), at, kind: 'you' })
}

// ---------------------------------------------------------------------------
// Chat → read and ask entries
// ---------------------------------------------------------------------------

/** Tool calls that change fields: the field changes themselves are logged instead. */
const FIELD_TOOLS = new Set(['set_field', 'flag_conflict', 'mark_missing', 'set_narrative'])

const strings = (v: unknown) => (Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : [])

function recordMessages(messages: AppUIMessage[], opts: { skipAsk?: boolean } = {}) {
  const busy = agentBusy()
  let turn: string | null = null
  messages.forEach((m, mi) => {
    if (m.role === 'user') {
      turn = ensureTurnFor(m, clock())
      return
    }
    if (m.role !== 'assistant' || !turn) return
    const isLast = mi === messages.length - 1
    for (const part of m.parts) {
      if (part.type === 'dynamic-tool') {
        if (FIELD_TOOLS.has(part.toolName)) continue
        const id = `tool-${part.toolCallId}`
        const input = (part.input ?? {}) as Record<string, unknown>
        const output = (part.state === 'output-available' ? (part.output ?? {}) : {}) as Record<string, unknown>
        const docs = [...new Set([...(typeof input.docId === 'string' ? [input.docId] : []), ...strings(input.documents), ...strings(output.documents)])]
        const live = busy && isLast && part.state === 'input-available'
        const existing = useTrail.getState().events.find((e) => e.id === id)
        if (!existing) {
          addEvent({
            id,
            turn,
            at: clock(),
            actor: 'agent',
            kind: 'read',
            title: part.title ?? part.toolName,
            docs,
            page: Array.isArray(input.pages) && input.pages.length ? Number(input.pages[0]) : undefined,
            locator: typeof input.sheet === 'string' && typeof input.range === 'string' ? `${input.sheet}!${input.range}` : undefined,
            live
          })
        } else if (existing.live !== live || existing.docs?.length !== docs.length) {
          patchEvent(id, { live, docs })
        }
      } else if (part.type === 'data-question' && !opts.skipAsk) {
        const id = `ask-${part.data.id}`
        if (useTrail.getState().events.some((e) => e.id === id)) continue
        addEvent({
          id,
          turn,
          at: clock(),
          actor: 'agent',
          kind: 'ask',
          questionId: part.data.id,
          fieldIds: part.data.items.map((i) => i.fieldId)
        })
      }
    }
  })
}

// ---------------------------------------------------------------------------
// Fill state → field entries
// ---------------------------------------------------------------------------

/** Set while this prototype restores a value, so the change reads as yours. */
let restoring: string | null = null

export function restoreField(fieldId: string, field: FieldState) {
  restoring = fieldId
  try {
    useApp.getState().apply({ op: 'set', fieldId, field: structuredClone(field) })
  } finally {
    restoring = null
  }
}

const sameField = (a: FieldState | undefined, b: FieldState | undefined) =>
  !!a &&
  !!b &&
  a.status === b.status &&
  displayValue(a) === displayValue(b) &&
  JSON.stringify(a.sources) === JSON.stringify(b.sources) &&
  JSON.stringify(a.candidates ?? null) === JSON.stringify(b.candidates ?? null)

const shown = (f: FieldState | undefined) => {
  if (!f) return null
  if (f.status === 'conflict') return null
  return displayValue(f)
}

/** Combine per-row sheet ranges ("Rates!B2:C2" … "Rates!B5:C5") into one source. */
function ratesSource(rates: RatesState): SourceRef[] {
  const refs = rates.rows.flatMap((r) => (r.source ? [r.source] : []))
  if (!refs.length) return []
  const parse = (l?: string) => l?.match(/^(.+)!([A-Z]+\d+):([A-Z]+\d+)$/)
  const first = parse(refs[0].locator)
  const last = parse(refs.at(-1)!.locator)
  if (first && last && refs.every((r) => r.docId === refs[0].docId)) {
    return [{ docId: refs[0].docId, locator: `${first[1]}!${first[2]}:${last[3]}`, quote: refs[0].quote }]
  }
  return refs
}

const VALUE_KINDS: TrailKind[] = ['set', 'flag', 'missing', 'answer', 'restore']

function noteNew(e: TrailEvent) {
  if (!e.fieldId) return
  if (e.kind === 'clear' || e.kind === 'draft') {
    clearNew(e.fieldId)
    return
  }
  if (!VALUE_KINDS.includes(e.kind)) return
  if (!watching(e.fieldId)) markNew(e.fieldId, e.at)
}

function diffField(id: string, a: FieldState | undefined, b: FieldState | undefined, at: number, ctx: { turn: () => string; approvals: number }) {
  if (!b || sameField(a, b)) return
  const prev = shown(a)
  const value = shown(b)
  const base = { turn: ctx.turn(), at, fieldId: id }
  const { events } = useTrail.getState()

  if (restoring === id) {
    noteNew(addEvent({ ...base, actor: 'you', kind: 'restore', value, prev: prev !== value ? prev : null, sources: b.sources, prevField: a }))
    return
  }
  switch (b.status) {
    case 'empty':
      if (a && a.status !== 'empty') {
        noteNew(addEvent({ ...base, actor: 'agent', kind: 'clear', prev, prevField: a, batch: `clear-${base.turn}` }))
      }
      return
    case 'drafting': {
      const open = events.findLast((e) => e.fieldId === id && e.kind === 'draft' && e.live)
      if (open) patchEvent(open.id, { value })
      else noteNew(addEvent({ ...base, actor: 'agent', kind: 'draft', value, prev, sources: b.sources, live: true }))
      return
    }
    case 'conflict': {
      const cands = b.candidates ?? []
      noteNew(
        addEvent({ ...base, actor: 'agent', kind: 'flag', value: cands.map((c) => c.display).join(' or '), prev, prevField: a, sources: cands.flatMap((c) => c.sources) })
      )
      return
    }
    case 'missing':
      if (b.by === 'user') noteNew(addEvent({ ...base, actor: 'you', kind: 'edit', value: null, prev, prevField: a }))
      else noteNew(addEvent({ ...base, actor: 'agent', kind: 'missing', value: null, prev, prevField: a, sources: b.sources }))
      return
    case 'approved':
      if (a?.status !== 'approved' && displayValue(a) === displayValue(b)) {
        addEvent({ ...base, actor: 'you', kind: 'approve', value, batch: ctx.approvals > 1 ? `approve-${at}` : undefined })
      } else {
        noteNew(addEvent({ ...base, actor: b.by === 'user' ? 'you' : 'agent', kind: b.by === 'user' ? 'edit' : 'set', value, prev: prev !== value ? prev : null, prevField: a, sources: b.sources }))
      }
      return
    case 'verified':
    case 'user_answered': {
      if (a?.status === 'approved' && displayValue(a) === displayValue(b)) {
        addEvent({ ...base, actor: 'you', kind: 'unapprove', value })
        return
      }
      if (b.status === 'user_answered' && b.by === 'user') {
        if (b.note?.startsWith('Edited by you')) {
          noteNew(addEvent({ ...base, actor: 'you', kind: 'edit', value, prev: prev !== value ? prev : null, prevField: a }))
        } else {
          const others = a?.status === 'conflict' ? (a.candidates ?? []).filter((c) => c.display !== value).map((c) => c.display) : []
          noteNew(
            addEvent({
              ...base,
              actor: 'you',
              kind: 'answer',
              verb: others.length ? 'chose' : undefined,
              value,
              prev: others.length ? others.join(', ') : prev !== value ? prev : null,
              prevField: a,
              sources: b.sources
            })
          )
        }
        return
      }
      const draft = a?.status === 'drafting' ? events.findLast((e) => e.fieldId === id && e.kind === 'draft' && e.live) : undefined
      if (draft) {
        patchEvent(draft.id, { kind: 'set', verb: 'wrote', live: false, value, sources: b.sources, at })
        noteNew({ ...draft, kind: 'set', at })
        return
      }
      noteNew(addEvent({ ...base, actor: 'agent', kind: 'set', value, prev: prev !== value ? prev : null, prevField: a, sources: b.sources }))
      return
    }
  }
}

function diffRates(a: RatesState, b: RatesState, at: number, ctx: { turn: () => string; approvals: number }) {
  if (a === b) return
  const base = { turn: ctx.turn(), at, fieldId: 'hourlyRates' }
  const summary = (r: RatesState) => (r.rows.length ? `${r.rows.length} roles` : null)
  if (!b.rows.length && a.rows.length) {
    noteNew(addEvent({ ...base, actor: 'agent', kind: 'clear', prev: summary(a), batch: `clear-${base.turn}` }))
  } else if (b.status === 'approved' && a.status !== 'approved') {
    addEvent({ ...base, actor: 'you', kind: 'approve', value: summary(b), batch: ctx.approvals > 1 ? `approve-${at}` : undefined })
  } else if (a.status === 'approved' && b.status === 'verified' && a.rows.length === b.rows.length) {
    addEvent({ ...base, actor: 'you', kind: 'unapprove', value: summary(b) })
  } else if (b.rows.length && JSON.stringify(a.rows) !== JSON.stringify(b.rows)) {
    noteNew(addEvent({ ...base, actor: 'agent', kind: 'set', value: summary(b), sources: ratesSource(b) }))
  }
}

type Snapshot = { fields: Record<string, FieldState>; rates: RatesState; answered: Record<string, unknown> }
let snapshot: Snapshot | null = null

function diffApp(next: Snapshot) {
  const prev = snapshot
  snapshot = next
  if (!prev) return
  const at = clock()
  let turnId: string | null = null
  const ids = Object.keys(fieldDefs)
  const approvals =
    ids.filter((id) => next.fields[id]?.status === 'approved' && prev.fields[id]?.status !== 'approved').length +
    (next.rates.status === 'approved' && prev.rates.status !== 'approved' ? 1 : 0)
  const ctx = { turn: () => (turnId ??= currentTurn(at)), approvals }
  if (next.fields !== prev.fields) for (const id of ids) if (next.fields[id] !== prev.fields[id]) diffField(id, prev.fields[id], next.fields[id], at, ctx)
  if (next.rates !== prev.rates) diffRates(prev.rates, next.rates, at, ctx)
  if (next.answered !== prev.answered) {
    for (const [qid, v] of Object.entries(next.answered)) {
      if (v === 'skipped' && prev.answered[qid] !== 'skipped') {
        const q = chat.messages.flatMap((m) => m.parts).find((p) => p.type === 'data-question' && p.data.id === qid)
        addEvent({ turn: ctx.turn(), at, actor: 'you', kind: 'skip', questionId: qid, fieldIds: q?.type === 'data-question' ? q.data.items.map((i) => i.fieldId) : [] })
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Opening history: the store opens mid-run, so lay out what already happened.
// ---------------------------------------------------------------------------

function seed() {
  const { fields, rates } = useApp.getState()
  const messages = chat.messages
  let t = Date.now() - 4 * 60_000 - 20_000

  // Values you set before the fill (the firm signatory) come first.
  const yours = Object.keys(fieldDefs).filter((id) => fields[id]?.by === 'user' && fields[id]?.value)
  if (yours.length) {
    const turn = addTurn({ id: 'you-earlier', at: t - 90_000, kind: 'you' })
    let u = t - 90_000
    for (const id of yours) {
      const f = fields[id]
      addEvent({ turn, at: (u += 2000), actor: 'you', kind: 'edit', fieldId: id, value: displayValue(f) })
      if (f.status === 'approved') addEvent({ turn, at: (u += 1500), actor: 'you', kind: 'approve', fieldId: id, value: displayValue(f) })
    }
  }

  fakeClock = () => (t += 1100)
  try {
    recordMessages(messages, { skipAsk: true })
    const fillTurn = useTrail.getState().turns.findLast((x) => x.kind === 'fill') ?? useTrail.getState().turns.at(-1)
    if (fillTurn) {
      fakeClock = () => (t += 380)
      const ordered = sections.flatMap((s) => [...s.fields, ...(s.hasRates ? ['hourlyRates'] : [])])
      const later: string[] = []
      for (const id of ordered) {
        if (id === 'hourlyRates') {
          if (rates.rows.length) addEvent({ turn: fillTurn.id, at: clock(), actor: 'agent', kind: 'set', fieldId: id, value: `${rates.rows.length} roles`, sources: ratesSource(rates) })
          continue
        }
        const f = fields[id]
        if (!f || f.by === 'user' || f.status === 'empty') continue
        if (f.status === 'conflict' || f.status === 'missing') {
          later.push(id)
          continue
        }
        addEvent({ turn: fillTurn.id, at: clock(), actor: 'agent', kind: 'set', fieldId: id, value: displayValue(f), sources: f.sources })
      }
      for (const id of later) {
        const f = fields[id]
        if (f.status === 'conflict') {
          const cands = f.candidates ?? []
          addEvent({ turn: fillTurn.id, at: clock(), actor: 'agent', kind: 'flag', fieldId: id, value: cands.map((c) => c.display).join(' or '), sources: cands.flatMap((c) => c.sources) })
        } else {
          addEvent({ turn: fillTurn.id, at: clock(), actor: 'agent', kind: 'missing', fieldId: id, value: null, sources: f.sources })
        }
      }
    }
    fakeClock = () => (t += 900)
    recordMessages(messages)
  } finally {
    fakeClock = null
  }
  useTrail.setState({ seeded: true, seenAt: Date.now() })
}

/** Mount once: keeps the trail in step with the chat and the fill state. */
export function useTrailRecorder() {
  const { messages } = useAgent()
  usePresence()

  useEffect(() => {
    if (!useTrail.getState().seeded) seed()
    const take = (): Snapshot => {
      const s = useApp.getState()
      return { fields: s.fields, rates: s.rates, answered: s.answered }
    }
    // Back from another prototype: log what changed meanwhile.
    diffApp(take())
    return useApp.subscribe((s, p) => {
      if (s.fields !== p.fields || s.rates !== p.rates || s.answered !== p.answered) diffApp(take())
    })
  }, [])

  useEffect(() => {
    if (useTrail.getState().seeded) recordMessages(messages)
  }, [messages])
}

// ---------------------------------------------------------------------------
// Reading the trail
// ---------------------------------------------------------------------------

export function useFieldHistory(fieldId: string) {
  const events = useTrail((s) => s.events)
  return useMemo(() => events.filter((e) => e.fieldId === fieldId).sort((a, b) => b.at - a.at), [events, fieldId])
}

/** One line in the trail: a single event, or a run of batched ones. */
export interface TrailEntry {
  key: string
  events: TrailEvent[]
  head: TrailEvent
}

export function entriesOf(events: TrailEvent[]): TrailEntry[] {
  const out: TrailEntry[] = []
  for (const e of events) {
    const last = out.at(-1)
    if (e.batch && last?.head.batch === e.batch) last.events.push(e)
    else out.push({ key: e.id, events: [e], head: e })
  }
  return out
}

export function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(t)
  }, [ms])
  return now
}

export function ago(at: number, now = Date.now()) {
  const s = Math.max(0, (now - at) / 1000)
  if (s < 45) return 'just now'
  if (s < 90) return '1 min ago'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

export const clockTime = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })

export const turnLabel: Record<TurnKind, string> = {
  fill: 'Fill',
  answers: 'Your answers',
  chat: 'Your question',
  you: 'Your changes'
}

export function sectionOf(fieldId: string) {
  return sections.find((s) => s.fields.includes(fieldId) || (fieldId === 'hourlyRates' && s.hasRates))
}
