import { useChat } from '@ai-sdk/react'
import { useEffect, useMemo, useState } from 'react'
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

/** The newest question set that hasn't been answered or skipped, or null. */
export function useOpenQuestion(): QuestionSet | null {
  const { messages } = useChat({ chat })
  const answered = useApp((s) => s.answered)
  return useMemo(() => {
    const all = questionsIn(messages)
    for (let i = all.length - 1; i >= 0; i--) if (!answered[all[i].id]) return all[i]
    return null
  }, [messages, answered])
}

/** Send answers for a question set; the agent applies them and continues. */
export function submitAnswers(question: QuestionSet, values: Record<string, string>) {
  useApp.getState().answer(question.id, values)
  const lines = question.items.map((item) => {
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
