import { useChat } from '@ai-sdk/react'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { create } from 'zustand'
import type { AppUIMessage, QuestionItem, QuestionSet } from '../../../../shared/protocol'
import { questionsIn, useOpenQuestion } from '@/lib/agent'
import { chat } from '@/lib/chat'
import { useApp } from '@/lib/store'

// The context column follows the job. The phase is derived from agent and
// fill state; the column auto-switches only when the phase changes, and a
// view the user picks by hand holds until the next change.

export type Phase = 'reading' | 'needs' | 'writing' | 'review'
export type View = 'sources' | 'needs' | 'review'

export const phaseLabel: Record<Phase, string> = { reading: 'Reading', needs: 'Needs you', writing: 'Writing', review: 'Review' }
export const viewLabel: Record<View, string> = { sources: 'Sources', needs: 'Needs you', review: 'Review' }
/** Writing stays on the Needs-you view: the answers you just sent turn into what the agent does with them. */
export const viewForPhase: Record<Phase, View> = { reading: 'sources', needs: 'needs', writing: 'needs', review: 'review' }
export const viewOrder: View[] = ['sources', 'needs', 'review']

export type TurnMode = 'fill' | 'answer' | 'chat' | null

/** What the agent's current (or last) turn is about. */
export function useTurn() {
  const { messages, status } = useChat({ chat })
  const busy = status === 'submitted' || status === 'streaming'
  return useMemo(() => {
    let lastUser: AppUIMessage | undefined
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUser = messages[i]
        break
      }
    }
    const mode: TurnMode = !lastUser ? null : lastUser.metadata?.command === 'run-fill' ? 'fill' : lastUser.metadata?.answer ? 'answer' : 'chat'
    const last = messages.at(-1)
    return { busy, mode, answer: lastUser?.metadata?.answer ?? null, messages, lastAssistant: last?.role === 'assistant' ? last : undefined }
  }, [messages, busy])
}

/** The phase right now, before settling. */
export function useRawPhase(): Phase {
  const { busy, mode } = useTurn()
  const open = useOpenQuestion()
  if (busy && mode === 'fill') return 'reading'
  if (busy && mode === 'answer') return 'writing'
  if (open) return 'needs'
  return 'review'
}

const NEEDS = ['conflict', 'missing']

/** Items of a question set whose fields still need an answer. */
export function liveItems(question: QuestionSet | null | undefined, fields = useApp.getState().fields): QuestionItem[] {
  return question ? question.items.filter((i) => NEEDS.includes(fields[i.fieldId]?.status ?? '')) : []
}

/** The newest question set, answered or not (for "Answer now" after a skip). */
export function useNewestQuestion(): QuestionSet | null {
  const { messages } = useChat({ chat })
  return useMemo(() => questionsIn(messages).at(-1) ?? null, [messages])
}

interface ColumnState {
  phase: Phase | null
  view: View
  /** Set when the column switched itself; shown as a short inline label. */
  notice: { view: View; from: View; phase: Phase; at: number } | null
  /** Last phase the user saw on phones (the tab badge clears when they look). */
  seen: Phase | null
  /** A question field to bring into view in the Needs-you panel. */
  focus: { fieldId: string; at: number } | null
  /** Unsent answers, per question set, so switching views never loses them. */
  drafts: Record<string, Record<string, string>>
  /** The last answers sent from this column. */
  sent: { questionId: string; fieldIds: string[] } | null
  /** True from Send until the agent's answer turn starts. */
  sending: boolean
  syncPhase: (phase: Phase) => void
  pick: (view: View) => void
  openNeeds: (fieldId?: string) => void
  setDraft: (questionId: string, fieldId: string, value: string) => void
  markSent: (questionId: string, fieldIds: string[]) => void
  setSending: (on: boolean) => void
  markSeen: (phase: Phase) => void
  clearNotice: () => void
}

export const useColumn = create<ColumnState>((set, get) => ({
  phase: null,
  view: 'needs',
  notice: null,
  seen: null,
  focus: null,
  drafts: {},
  sent: null,
  sending: false,

  syncPhase: (phase) => {
    const prev = get()
    if (prev.phase === phase) return
    const view = viewForPhase[phase]
    set({
      phase,
      view,
      notice: prev.phase && view !== prev.view ? { view, from: prev.view, phase, at: Date.now() } : null,
      sending: phase === 'writing' ? false : prev.sending
    })
  },
  pick: (view) => set({ view, notice: null }),
  openNeeds: (fieldId) => set({ view: 'needs', notice: null, focus: fieldId ? { fieldId, at: Date.now() } : get().focus }),
  setDraft: (questionId, fieldId, value) =>
    set((s) => ({ drafts: { ...s.drafts, [questionId]: { ...s.drafts[questionId], [fieldId]: value } } })),
  markSent: (questionId, fieldIds) =>
    set((s) => {
      const { [questionId]: _sent, ...drafts } = s.drafts
      return { sent: { questionId, fieldIds }, sending: true, drafts }
    }),
  setSending: (sending) => set({ sending }),
  markSeen: (seen) => set({ seen }),
  clearNotice: () => set({ notice: null })
}))

/**
 * Mount once: settles the raw phase (so a one-frame gap between "answers sent"
 * and "agent writing" never flips the column) and hands it to the column.
 */
export function usePhaseSync() {
  const raw = useRawPhase()
  const syncPhase = useColumn((s) => s.syncPhase)
  const first = useRef(true)
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false
      syncPhase(raw)
      return
    }
    const t = setTimeout(() => syncPhase(raw), 260)
    return () => clearTimeout(t)
  }, [raw, syncPhase])

  // A send that never turns into an answer turn (e.g. the agent was busy) shouldn't hang.
  const sending = useColumn((s) => s.sending)
  useLayoutEffect(() => {
    if (!sending) return
    const t = setTimeout(() => useColumn.getState().setSending(false), 3000)
    return () => clearTimeout(t)
  }, [sending])
}

/**
 * Send a field to wherever it gets answered: the Needs-you panel when a
 * question covers it (reopening a skipped set), else the field row.
 */
export function answerField(fieldId: string) {
  const { fields, reopenQuestion, answered } = useApp.getState()
  const newest = questionsIn(chat.messages).at(-1)
  const covered = newest && liveItems(newest, fields).some((i) => i.fieldId === fieldId)
  if (covered) {
    if (answered[newest.id]) reopenQuestion(newest.id)
    useColumn.getState().openNeeds(fieldId)
    if (!isWide()) useApp.getState().setPane('sources')
    return true
  }
  return false
}

export const isWide = () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches
