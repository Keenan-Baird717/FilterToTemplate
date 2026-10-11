import { Check } from 'lucide-react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { AppUIMessage } from '../../../../shared/protocol'
import { Button } from '@/components/ui/button'
import { isMacLike } from '@/components/PrototypeBar'
import { skipQuestion, useAgent, useOpenQuestion } from '@/lib/agent'
import { cn } from '@/lib/utils'
import { answerState, sendDraft } from './actions'
import { Key, KeyOnAccent } from './bits'
import { useTriage } from './state'

/** True while the agent is running a fresh fill, which replaces any open question. */
export function isRefilling(messages: AppUIMessage[]) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === 'user') return messages[i].metadata?.command === 'run-fill'
  return false
}

/**
 * The open follow-up question, as a compact checklist of its answers.
 * It makes the remaining step obvious and sends everything at once.
 */
export function AnswerBar() {
  const question = useOpenQuestion()
  const { busy, messages } = useAgent()
  const values = useTriage((s) => (question && s.draft.qid === question.id ? s.draft.values : null)) ?? {}
  const selected = useTriage((s) => s.selected)
  const select = useTriage((s) => s.select)
  if (!question || (busy && isRefilling(messages))) return null
  const { count, ready } = answerState(question, values)
  const mod = isMacLike() ? '⌘' : 'Ctrl'

  return (
    <div className="border-t border-rule bg-panel-2/60 px-4 py-2 sm:px-8" role="region" aria-label="Answers for the agent">
      <div className="mx-auto flex max-w-[960px] flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[12px] font-medium text-ink">
          {question.items.length} answers needed
          <span className="hidden font-normal text-ink-3 lg:inline"> to finish the letter</span>
        </span>
        <ol className="order-last flex w-full min-w-0 flex-wrap items-center gap-1.5 sm:order-none sm:w-auto">
          {question.items.map((qi) => {
            const raw = values[qi.fieldId]?.trim()
            const shown = qi.options?.find((o) => o.value === raw)?.display ?? raw
            const done = !!raw
            const label = fieldDefs[qi.fieldId]?.label.replace('Billing contact email', 'Billing email') ?? qi.fieldId
            const isSel = selected === qi.fieldId
            return (
              <li key={qi.fieldId} className="min-w-0">
                <button
                  type="button"
                  onClick={() => select(qi.fieldId, { detail: true })}
                  aria-current={isSel ? 'true' : undefined}
                  className={cn(
                    'inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-[4px] border px-2 text-[12px] transition-colors',
                    isSel ? 'border-cobalt/50 bg-panel text-ink' : 'border-rule bg-panel text-ink-2 hover:text-ink'
                  )}
                >
                  {done ? (
                    <Check className="size-3 shrink-0 text-cobalt" strokeWidth={3} aria-label="Answered" />
                  ) : (
                    <span className="size-2.5 shrink-0 rounded-full border border-dashed border-ink-3" aria-label="Not answered" />
                  )}
                  <span className="shrink-0">{label}</span>
                  <span className={cn('truncate font-mono text-[11px]', done ? 'text-ink' : 'text-ink-3')}>
                    {done ? shown : qi.kind === 'choice' ? 'pick one' : 'optional'}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-7 rounded-[4px] px-2 text-[12px] text-ink-2" disabled={busy} onClick={() => skipQuestion(question)}>
            Skip for now
          </Button>
          <Button
            id="triage-send"
            size="sm"
            variant={ready ? 'default' : 'outline'}
            className="h-7 gap-2 rounded-[4px] px-2.5 text-[12px]"
            disabled={busy || !ready}
            onClick={() => sendDraft(question)}
          >
            Send {count > 1 ? `${count} answers` : 'answer'}
            {ready ? <KeyOnAccent>{mod} ↵</KeyOnAccent> : <Key touch={false}>{mod} ↵</Key>}
          </Button>
        </div>
      </div>
    </div>
  )
}
