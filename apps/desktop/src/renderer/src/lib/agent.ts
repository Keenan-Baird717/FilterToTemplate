import { useChat } from '@ai-sdk/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { initialMessages } from '../../../agent-core/demo-data'
import type { AppUIMessage, QuestionSet } from '../../../shared/protocol'
import { getAgent } from './agent-client'
import { chat, runFill } from './chat'
import { summarize, useApp } from './store'

// Shared hooks and actions every prototype uses to talk to the agent.

/** Chat messages, status and controls (AI SDK useChat bound to the app's chat). */
export function useAgent() {
  const helpers = useChat({ chat })
  const busy = helpers.status === 'submitted' || helpers.status === 'streaming'
  const activity = useApp((s) => s.activity)
  return { ...helpers, busy, activity }
}

/** "Simulated agent · utility process" in Electron, "· in page" in a browser. */
export function useEngineName() {
  const [engine, setEngine] = useState('Connecting…')
  useEffect(() => {
    getAgent().then((a) => setEngine(a.engine))
  }, [])
  return engine
}

/** Filled / total counts and per-status counts for progress UI. */
export function useSummary() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  return useMemo(() => summarize(fields, rates), [fields, rates])
}

/** Every question set the agent has asked, newest last, with its answer state. */
export function questionsIn(messages: AppUIMessage[]): QuestionSet[] {
  const out: QuestionSet[] = []
  for (const m of messages) for (const p of m.parts) if (p.type === 'data-question') out.push(p.data)
  return out
}

/**
 * The open question set, or null. Only the newest set counts (a fresh fill
 * supersedes older ones), and only while one of its fields still needs an
 * answer, so nothing is asked while the agent is refilling.
 */
export function useOpenQuestion(): QuestionSet | null {
  const { messages } = useChat({ chat })
  const answered = useApp((s) => s.answered)
  const fields = useApp((s) => s.fields)
  return useMemo(() => {
    const newest = questionsIn(messages).at(-1)
    if (!newest || answered[newest.id]) return null
    const live = newest.items.some((i) => ['conflict', 'missing'].includes(fields[i.fieldId]?.status ?? ''))
    return live ? newest : null
  }, [messages, answered, fields])
}

/**
 * Which documents are in play right now: the ones the agent's running tool
 * calls touch, and the sources of fields that changed in the last few seconds.
 * Lets a sources panel wake up when it matters.
 */
export function useLiveSources(windowMs = 4000) {
  const { messages, status } = useChat({ chat })
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const flash = useApp((s) => s.flash)
  const flashKind = useApp((s) => s.flashKind)
  const [now, setNow] = useState(() => Date.now())
  const recentStamp = Math.max(0, ...Object.values(flash))
  useEffect(() => {
    if (Date.now() - recentStamp > windowMs) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [recentStamp, windowMs])

  return useMemo(() => {
    const reading = new Set<string>()
    const busy = status === 'submitted' || status === 'streaming'
    const last = messages.at(-1)
    if (busy && last?.role === 'assistant') {
      for (const p of last.parts) {
        if (p.type !== 'dynamic-tool') continue
        const input = (p.input ?? {}) as { docId?: unknown; documents?: unknown }
        const output = (p.state === 'output-available' ? (p.output ?? {}) : {}) as { documents?: unknown }
        const ids = (v: unknown) => (Array.isArray(v) ? v.filter((d): d is string => typeof d === 'string') : [])
        if (p.state === 'input-available' && typeof input.docId === 'string') reading.add(input.docId)
        if (p.state === 'input-available') ids(input.documents).forEach((d) => reading.add(d))
        if (p === last.parts.at(-1)) ids(output.documents).forEach((d) => reading.add(d))
      }
    }
    const recent = new Map<string, number>()
    for (const [fieldId, at] of Object.entries(flash)) {
      // Approvals and reveals aren't new citations.
      if (now - at > windowMs || (flashKind[fieldId] && flashKind[fieldId] !== 'value')) continue
      const refs = fieldId === 'hourlyRates' ? rates.rows.flatMap((r) => (r.source ? [r.source] : [])) : (fields[fieldId]?.sources ?? [])
      for (const ref of refs) recent.set(ref.docId, Math.max(recent.get(ref.docId) ?? 0, at))
    }
    return { reading, recent, busy }
  }, [messages, status, flash, flashKind, fields, rates, now, windowMs])
}

/** Advances simulated parsing for files added in the prototype. Mount once per layout. */
export function useParsingTicker() {
  const parsing = useApp((s) => s.docs.some((d) => d.status === 'parsing' && d.id !== 'D8'))
  useEffect(() => {
    if (!parsing) return
    const t = setInterval(() => {
      const done = useApp.getState().advanceParsing()
      if (done.length) toast.success(done.length === 1 ? `Indexed ${done[0]}` : `Indexed ${done.length} files`)
    }, 450)
    return () => clearInterval(t)
  }, [parsing])
}

/** Send answers for a question set; the agent applies them and continues. */
export function submitAnswers(question: QuestionSet, values: Record<string, string>) {
  const { fields, answer } = useApp.getState()
  answer(question.id, values)
  // After a reopen, items already settled shouldn't read as "skipped".
  const relevant = question.items.filter((i) => values[i.fieldId]?.trim() || ['conflict', 'missing'].includes(fields[i.fieldId]?.status ?? ''))
  const lines = (relevant.length ? relevant : question.items).map((item) => {
    const v = values[item.fieldId]?.trim()
    const shown = item.options?.find((o) => o.value === v)?.display ?? v
    return `${item.label.replace(/\?$/, '')}: ${shown || 'skipped'}`
  })
  void chat.sendMessage({ text: lines.join('\n'), metadata: { answer: { questionId: question.id, answers: values } } })
}

export function skipQuestion(question: QuestionSet) {
  useApp.getState().answer(question.id, 'skipped')
}

/** Send a free-text message, routing "run it again" to a fresh fill. */
export function sendPrompt(text: string) {
  const t = text.trim()
  if (!t) return
  if (/^(run|fill|start).*(again|scratch|over)/i.test(t)) runFill()
  else void chat.sendMessage({ text: t })
}

/** Put the example project back to its opening state (fields, answers, chat). */
export function resetExample() {
  void chat.stop()
  chat.messages = structuredClone(initialMessages)
  useApp.getState().reset()
}

export { runFill }
