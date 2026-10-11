import { CircleHelp, Check } from 'lucide-react'
import { useState } from 'react'
import type { QuestionSet } from '../../../shared/protocol'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { chat } from '@/lib/chat'
import { useApp } from '@/lib/store'
import { CitationChip } from './status'

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/**
 * A batched follow-up form. Questions come from fields the app can see are
 * conflicting or missing; answers go back through the same chat transport.
 */
export function QuestionCard({ question, disabled }: { question: QuestionSet; disabled: boolean }) {
  const answered = useApp((s) => s.answered[question.id])
  const answer = useApp((s) => s.answer)
  const [values, setValues] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState(false)

  if (answered) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rule bg-panel-2/50 px-3 py-2 text-[12px] text-ink-2">
        <Check className="size-3.5 text-ok" />
        {answered === 'skipped' ? 'Skipped for now. The fields stay flagged.' : 'Answered. The letter has been updated.'}
      </div>
    )
  }

  const choiceItems = question.items.filter((i) => i.kind === 'choice')
  const ready = choiceItems.every((i) => values[i.fieldId])
  const emailItem = question.items.find((i) => i.inputType === 'email')
  const emailValue = emailItem ? (values[emailItem.fieldId] ?? '') : ''
  const emailInvalid = !!emailItem && emailValue.trim() !== '' && !emailOk(emailValue)

  const submit = () => {
    setTouched(true)
    if (!ready || emailInvalid) return
    answer(question.id, values)
    const lines = question.items.map((item) => {
      const v = values[item.fieldId]?.trim()
      const shown = item.options?.find((o) => o.value === v)?.display ?? v
      return `${item.label.replace(/\?$/, '')}: ${shown || 'skipped'}`
    })
    void chat.sendMessage({ text: lines.join('\n'), metadata: { answer: { questionId: question.id, answers: values } } })
  }

  return (
    <form
      className="overflow-hidden rounded-xl border border-cobalt/30 bg-panel"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <div className="flex items-center gap-2 border-b border-cobalt/20 bg-cobalt-soft px-3.5 py-2.5">
        <CircleHelp className="size-4 text-cobalt" />
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-ink">{question.title}</div>
          <div className="text-[11px] text-ink-2">{question.reason}</div>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-3.5">
        {question.items.map((item) => (
          <fieldset key={item.fieldId} className="flex min-w-0 flex-col gap-2">
            <legend className="mb-1 text-[13px] font-medium text-ink">{item.label}</legend>
            {item.help && <p className="-mt-1 text-[12px] text-ink-3">{item.help}</p>}
            {item.kind === 'choice' ? (
              <RadioGroup
                value={values[item.fieldId] ?? ''}
                onValueChange={(v) => setValues((s) => ({ ...s, [item.fieldId]: v }))}
                className="gap-1.5"
                disabled={disabled}
              >
                {item.options?.map((o) => {
                  const id = `${question.id}-${item.fieldId}-${o.value}`
                  return (
                    <div
                      key={o.value}
                      className="flex min-w-0 items-start gap-2.5 rounded-lg border border-rule px-2.5 py-2 has-[[data-state=checked]]:border-cobalt/50 has-[[data-state=checked]]:bg-cobalt-soft/50"
                    >
                      <RadioGroupItem value={o.value} id={id} className="mt-0.5" />
                      <div className="flex min-w-0 flex-col gap-1.5">
                        <Label htmlFor={id} className="cursor-pointer text-[13px] font-medium">
                          {o.display}
                        </Label>
                        <div className="flex flex-wrap gap-1">
                          {o.sources.map((s, i) => (
                            <CitationChip key={i} source={s} className="h-5 text-[11px]" />
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </RadioGroup>
            ) : (
              <>
                <Input
                  id={`${question.id}-${item.fieldId}`}
                  type={item.inputType ?? 'text'}
                  placeholder={item.placeholder}
                  value={values[item.fieldId] ?? ''}
                  onChange={(e) => setValues((s) => ({ ...s, [item.fieldId]: e.target.value }))}
                  disabled={disabled}
                  aria-label={item.label}
                  aria-invalid={emailInvalid && item.inputType === 'email'}
                  className="h-8 text-[13px]"
                />
                {emailInvalid && item.inputType === 'email' && (
                  <p className="text-[12px] text-bad">Enter an address like name@acmeholdings.com, or leave it blank to skip.</p>
                )}
              </>
            )}
          </fieldset>
        ))}
        {touched && !ready && <p className="text-[12px] text-bad">Choose an option for each question to continue.</p>}
        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 text-[12px]" disabled={disabled} onClick={() => answer(question.id, 'skipped')}>
            Skip for now
          </Button>
          <Button type="submit" size="sm" className="h-8 text-[12px]" disabled={disabled}>
            Send answers
          </Button>
        </div>
      </div>
    </form>
  )
}
