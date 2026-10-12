import { toast } from 'sonner'
import type { Candidate, QuestionSet } from '../../../../shared/protocol'
import { submitAnswers } from '@/lib/agent'
import { summarize, useApp } from '@/lib/store'
import { canApprove, emailOk, items, statusOf, visibleOrder } from './model'
import { useTriage } from './state'

// Reviewer actions shared by buttons and keyboard shortcuts.

/** Focus an element once it has mounted (items animate in, so it may not exist yet). */
const focusLater = (id: string, delay = 0) =>
  setTimeout(() => {
    const until = Date.now() + 1200
    const tick = () => {
      const el = document.getElementById(id)
      if (el && el.offsetParent !== null) el.focus()
      else if (Date.now() < until) requestAnimationFrame(tick)
    }
    tick()
  }, delay)

export function move(step: 1 | -1) {
  const { fields, rates } = useApp.getState()
  const { filter, selected, select } = useTriage.getState()
  const order = visibleOrder(fields, rates, filter)
  if (!order.length) return
  const i = order.findIndex((x) => x.id === selected)
  const next = order[i < 0 ? 0 : Math.min(order.length - 1, Math.max(0, i + step))]
  select(next.id)
}

/** Approve the item, then move to the next one that still needs a look. */
export function approveAndAdvance(id: string) {
  const app = useApp.getState()
  const status = statusOf(id, app.fields, app.rates)
  if (status === 'approved') return
  if (!canApprove(status)) {
    const why =
      status === 'conflict'
        ? 'Pick one of the two dates first.'
        : status === 'missing'
          ? 'Enter a value first.'
          : 'The agent is still working on this one.'
    toast(why)
    return
  }
  const { filter, select } = useTriage.getState()
  const order = visibleOrder(app.fields, app.rates, filter)
  app.approveField(id)

  const after = useApp.getState()
  const from = order.findIndex((x) => x.id === id)
  for (let k = 1; k < order.length; k++) {
    const candidate = order[(from + k) % order.length]
    if (statusOf(candidate.id, after.fields, after.rates) !== 'approved') {
      select(candidate.id)
      return
    }
  }
  const { counts, total } = summarize(after.fields, after.rates)
  if (counts.approved === total) toast.success(`All ${total} reviewed`, { description: 'Export the letter when you’re ready.' })
}

export function startEdit(id: string) {
  useTriage.getState().setEditing(id)
  focusLater('triage-edit')
}

export function focusAsk() {
  focusLater('triage-ask')
}

/** Pick one side of a conflict: into the answer draft, or straight to the field if the question was skipped. */
export function chooseCandidate(fieldId: string, candidate: Candidate, question: QuestionSet | null) {
  const qItem = question?.items.find((i) => i.fieldId === fieldId)
  if (!question || !qItem) {
    useApp.getState().editField(fieldId, candidate.display)
    toast.success(`Effective date set to ${candidate.display}`)
    return
  }
  const t = useTriage.getState()
  t.setDraft(question.id, fieldId, String(candidate.value))
  // The remaining step is the next unanswered item in the same question set.
  const values = useTriage.getState().draft.values
  const nextItem = question.items.find((i) => i.fieldId !== fieldId && !values[i.fieldId]?.trim())
  if (nextItem) {
    setTimeout(() => useTriage.getState().select(nextItem.fieldId), 380)
    focusLater(`triage-answer-${nextItem.fieldId}`, 420)
  } else {
    focusLater('triage-send', 60)
  }
}

export function draftFor(question: QuestionSet | null) {
  const { draft } = useTriage.getState()
  return question && draft.qid === question.id ? draft.values : {}
}

export function answerState(question: QuestionSet, values: Record<string, string>) {
  const missingChoice = question.items.find((i) => i.kind === 'choice' && !values[i.fieldId])
  const badEmail = question.items.find((i) => i.inputType === 'email' && values[i.fieldId]?.trim() && !emailOk(values[i.fieldId]))
  const count = question.items.filter((i) => values[i.fieldId]?.trim()).length
  return { missingChoice, badEmail, count, ready: !missingChoice && !badEmail }
}

export function sendDraft(question: QuestionSet) {
  const values = draftFor(question)
  const { missingChoice, badEmail } = answerState(question, values)
  if (missingChoice) {
    useTriage.getState().select(missingChoice.fieldId, { detail: true })
    toast(`Answer “${missingChoice.label}” first. The agent needs it to continue.`)
    return false
  }
  if (badEmail) {
    useTriage.getState().select(badEmail.fieldId, { detail: true })
    focusLater(`triage-answer-${badEmail.fieldId}`)
    return false
  }
  submitAnswers(question, values)
  // The agent writes the dependent value next; follow it.
  const { fields, rates } = useApp.getState()
  const waiting = items.find((i) => statusOf(i.id, fields, rates) === 'empty')
  if (waiting) useTriage.getState().select(waiting.id)
  return true
}

export const itemCount = items.length
