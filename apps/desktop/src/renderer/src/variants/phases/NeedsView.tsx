import { ArrowRight, Check, CircleCheck, LoaderCircle, Minus } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { QuestionItem, QuestionSet } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { StatusChip } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { questionsIn, skipQuestion, submitAnswers, useOpenQuestion } from '@/lib/agent'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { QuoteSource, ViewHeader, plural } from './bits'
import { answerField, liveItems, useColumn, useNewestQuestion, useTurn } from './state'

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
const words = ['No', 'One', 'Two', 'Three', 'Four', 'Five']

export function NeedsView() {
  const open = useOpenQuestion()
  const { busy, mode } = useTurn()
  const sending = useColumn((s) => s.sending)
  const reduce = useReducedMotion()
  const writing = (busy && mode === 'answer') || sending
  const which = open && !sending ? 'ask' : writing ? 'writing' : 'idle'

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={which}
        className="flex h-full min-h-0 flex-col"
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {which === 'ask' && open ? <QuestionPanel question={open} /> : which === 'writing' ? <WritingPanel /> : <IdlePanel />}
      </motion.div>
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Needs you: the open question set, moved out of the chat
// ---------------------------------------------------------------------------

function QuestionPanel({ question }: { question: QuestionSet }) {
  const fields = useApp((s) => s.fields)
  const items = liveItems(question, fields)
  const draft = useColumn((s) => s.drafts[question.id])
  const setDraft = useColumn((s) => s.setDraft)
  const markSent = useColumn((s) => s.markSent)
  const focus = useColumn((s) => s.focus)
  const { busy } = useTurn()
  const [touched, setTouched] = useState(false)
  const [glow, setGlow] = useState<string | null>(null)
  const values = draft ?? {}

  const conflicts = items.filter((i) => fields[i.fieldId]?.status === 'conflict').length
  const missing = items.length - conflicts
  const reason = [conflicts && plural(conflicts, 'conflict'), missing && plural(missing, 'missing value')].filter(Boolean).join(' and ')
  const unchosen = items.filter((i) => i.kind === 'choice' && !values[i.fieldId])
  const emailItem = items.find((i) => i.inputType === 'email')
  const emailInvalid = !!emailItem && (values[emailItem.fieldId] ?? '').trim() !== '' && !emailOk(values[emailItem.fieldId] ?? '')

  // Command menu and field-row links land on a specific question.
  useEffect(() => {
    if (!focus || Date.now() - focus.at > 1500) return
    const el = document.getElementById(`needs-${focus.fieldId}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setGlow(focus.fieldId)
    const t = setTimeout(() => setGlow(null), 1600)
    return () => clearTimeout(t)
  }, [focus])

  const submit = () => {
    setTouched(true)
    if (unchosen.length || emailInvalid || busy) return
    const answers = Object.fromEntries(items.map((i) => [i.fieldId, (values[i.fieldId] ?? '').trim()]).filter(([, v]) => v))
    markSent(question.id, items.map((i) => i.fieldId))
    submitAnswers({ ...question, items }, answers)
  }

  return (
    <form
      className="flex h-full min-h-0 flex-col"
      aria-label="Questions from the agent"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <ViewHeader eyebrow="Needs you" title={`${words[items.length] ?? items.length} answer${items.length === 1 ? '' : 's'} needed`} sub={`${reason}. The agent writes the scope summary once you answer.`} />

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-6 px-4 pt-1 pb-6">
          {items.map((item, n) => (
            <section
              key={item.fieldId}
              id={`needs-${item.fieldId}`}
              aria-labelledby={`needs-${item.fieldId}-q`}
              className={cn('-mx-2 scroll-mt-3 rounded-xl px-2 py-1 transition-colors duration-500', glow === item.fieldId && 'bg-cobalt-soft/60')}
            >
              <div className="mb-2.5 flex items-start gap-2.5">
                <span className="num mt-px grid size-5 shrink-0 place-items-center rounded-full border border-rule bg-panel font-mono text-[11px] text-ink-2">{n + 1}</span>
                <div className="min-w-0">
                  <p className="text-[11.5px] text-ink-3">
                    {fieldDefs[item.fieldId]?.label}
                    <span className={cn('ml-1.5 font-medium', fields[item.fieldId]?.status === 'conflict' ? 'text-warn' : 'text-bad')}>
                      {fields[item.fieldId]?.status === 'conflict' ? 'Documents disagree' : 'Not in any document'}
                    </span>
                  </p>
                  <h3 id={`needs-${item.fieldId}-q`} className="mt-0.5 text-[14px] leading-snug font-semibold text-ink">
                    {item.label}
                  </h3>
                  {item.help && <p className="mt-0.5 text-[12px] leading-snug text-ink-3">{item.help}</p>}
                </div>
              </div>
              {item.kind === 'choice' ? (
                <ChoiceTiles
                  item={item}
                  questionId={question.id}
                  value={values[item.fieldId] ?? ''}
                  onChange={(v) => setDraft(question.id, item.fieldId, v)}
                  error={touched && !values[item.fieldId]}
                />
              ) : (
                <TextAnswer
                  item={item}
                  questionId={question.id}
                  value={values[item.fieldId] ?? ''}
                  onChange={(v) => setDraft(question.id, item.fieldId, v)}
                  invalid={emailInvalid && item.inputType === 'email'}
                />
              )}
            </section>
          ))}
        </div>
      </ScrollArea>

      <div className="flex flex-col gap-2 border-t border-rule bg-ground px-4 py-3">
        {busy && <p className="text-[12px] text-ink-3">The agent is replying. You can send once it’s done.</p>}
        {touched && unchosen.length > 0 && (
          <p role="alert" className="text-[12px] text-bad">
            Choose one option for “{fieldDefs[unchosen[0].fieldId]?.label}” to send.
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2.5 text-[13px] text-ink-2" onClick={() => skipQuestion(question)}>
            Skip for now
          </Button>
          <Button type="submit" size="sm" className="h-8 gap-1.5 px-3 text-[13px]" disabled={busy}>
            Send answers <ArrowRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </form>
  )
}

function ChoiceTiles({ item, questionId, value, onChange, error }: { item: QuestionItem; questionId: string; value: string; onChange: (v: string) => void; error: boolean }) {
  return (
    <RadioGroup value={value} onValueChange={onChange} aria-labelledby={`needs-${item.fieldId}-q`} aria-invalid={error || undefined} className="gap-2">
      {item.options?.map((o) => {
        const id = `${questionId}-${item.fieldId}-${o.value}`
        return (
          <div
            key={o.value}
            className={cn(
              'relative rounded-lg border bg-panel px-3 py-2.5 transition-colors',
              'has-[[data-state=checked]]:border-cobalt/60 has-[[data-state=checked]]:bg-cobalt-soft/50 has-[[data-state=checked]]:shadow-[0_0_0_1px_color-mix(in_srgb,var(--cobalt)_40%,transparent)]',
              error ? 'border-bad/40' : 'border-rule hover:border-ink-3/50'
            )}
          >
            <div className="flex items-start gap-2.5">
              <RadioGroupItem value={o.value} id={id} className="mt-0.5 bg-panel" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                {/* The label covers the tile so the whole tile picks the option; source chips sit above it. */}
                <Label htmlFor={id} className="cursor-pointer text-[14px] leading-tight font-semibold text-ink after:absolute after:inset-0 after:rounded-lg">
                  {o.display}
                </Label>
                {o.sources.map((s, i) => (
                  <QuoteSource key={i} source={s} className="relative z-10 w-fit max-w-full" />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </RadioGroup>
  )
}

function TextAnswer({ item, questionId, value, onChange, invalid }: { item: QuestionItem; questionId: string; value: string; onChange: (v: string) => void; invalid: boolean }) {
  const field = useApp((s) => s.fields[item.fieldId])
  const mention = field?.sources[0]
  const id = `${questionId}-${item.fieldId}`
  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        type={item.inputType ?? 'text'}
        inputMode={item.inputType === 'email' ? 'email' : undefined}
        autoComplete="off"
        placeholder={item.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-labelledby={`needs-${item.fieldId}-q`}
        aria-describedby={`${id}-hint`}
        aria-invalid={invalid || undefined}
        className="h-9 bg-panel text-[13px] dark:bg-panel"
      />
      <p id={`${id}-hint`} className={cn('text-[12px]', invalid ? 'text-bad' : 'text-ink-3')}>
        {invalid ? 'Enter an address like name@acmeholdings.com, or leave it blank.' : 'Optional. Leave it blank and the letter keeps a placeholder.'}
      </p>
      {mention && (
        <div className="mt-1 rounded-lg border border-dashed border-ink-3/35 px-3 py-2.5">
          <p className="eyebrow mb-1.5">Closest mention</p>
          <QuoteSource source={mention} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Writing: what the agent does with the answers
// ---------------------------------------------------------------------------

function WritingPanel() {
  const activity = useApp((s) => s.activity)
  const fields = useApp((s) => s.fields)
  const sent = useColumn((s) => s.sent)
  const { answer, messages } = useTurn()
  const questionId = answer?.questionId ?? sent?.questionId
  const question = questionsIn(messages).find((q) => q.id === questionId)
  const ids = sent && sent.questionId === questionId ? sent.fieldIds : (question?.items.map((i) => i.fieldId) ?? [])
  const answers = answer?.answers ?? {}
  const scope = fields.scopeSummary
  const scopeText = typeof scope?.value === 'string' ? scope.value : ''
  const reduce = useReducedMotion()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        live
        eyebrow="Writing"
        title={
          <Shimmer as="span" className="text-[15px] font-semibold" duration={1.8}>
            {`Now: ${activity ?? 'Applying your answers'}…`}
          </Shimmer>
        }
        sub="Your answers go into the letter, then the scope summary is written from your documents."
      />
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-5 px-4 pt-1 pb-6">
          <section aria-labelledby="writing-answers">
            <h3 id="writing-answers" className="eyebrow mb-2">
              Your answers
            </h3>
            <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-panel">
              {ids.map((fieldId) => {
                const item = question?.items.find((i) => i.fieldId === fieldId)
                const given = answers[fieldId]?.trim()
                const shown = item?.options?.find((o) => o.value === given)?.display ?? given
                const f = fields[fieldId]
                const applied = !!given && f?.by === 'user' && (f.status === 'user_answered' || f.status === 'approved')
                return (
                  <li key={fieldId} className="flex items-center gap-2.5 px-3 py-2.5">
                    <span className="grid size-4 shrink-0 place-items-center" aria-hidden>
                      {!given ? (
                        <Minus className="size-3.5 text-ink-3" />
                      ) : applied ? (
                        <motion.span initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                          <Check className="size-4 text-ok" strokeWidth={2.5} />
                        </motion.span>
                      ) : (
                        <LoaderCircle className="size-3.5 animate-spin text-ink-3" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12px] text-ink-3">{fieldDefs[fieldId]?.label}</span>
                      <span className={cn('block truncate text-[13px]', given ? 'text-ink' : 'text-ink-3 italic')}>{shown || 'Left blank. It stays flagged.'}</span>
                    </span>
                    <span className="sr-only">{!given ? 'Not set' : applied ? 'Set in the letter' : 'Setting'}</span>
                  </li>
                )
              })}
            </ul>
          </section>

          <section aria-labelledby="writing-scope" aria-live="off">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 id="writing-scope" className="eyebrow">
                Scope of engagement
              </h3>
              {scope && scope.status !== 'empty' && <StatusChip status={scope.status} className="h-5 text-[11px]" />}
            </div>
            <div className="rounded-lg border border-rule bg-panel px-3.5 py-3 text-[13px] leading-relaxed text-ink">
              {scopeText ? (
                <div className="flex flex-col gap-2">
                  {scopeText.split('\n\n').map((p, i, all) => (
                    <p key={i} className={cn(scope?.status === 'drafting' && i === all.length - 1 && 'caret')}>
                      {p}
                    </p>
                  ))}
                </div>
              ) : (
                <Shimmer as="span" className="text-[13px]" duration={1.6}>
                  Collecting quotes from your documents…
                </Shimmer>
              )}
            </div>
            {scope && scope.sources.length > 0 && (
              <div className="mt-4">
                <h4 className="eyebrow mb-2">Drawing on</h4>
                <ul className="flex flex-col gap-3">
                  {scope.sources.map((s, i) => (
                    <motion.li key={i} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
                      <QuoteSource source={s} />
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        </div>
      </ScrollArea>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Nothing to answer
// ---------------------------------------------------------------------------

function IdlePanel() {
  const phase = useColumn((s) => s.phase)
  const fields = useApp((s) => s.fields)
  const answered = useApp((s) => s.answered)
  const focusField = useApp((s) => s.focusField)
  const newest = useNewestQuestion()
  const state = newest ? answered[newest.id] : undefined
  const pending = liveItems(newest, fields)
  const history = newest && state && state !== 'skipped' ? newest.items.filter((i) => fields[i.fieldId]?.by === 'user') : []

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        eyebrow="Needs you"
        title={pending.length && state ? `${plural(pending.length, 'question')} left unanswered` : 'Nothing needs you right now'}
        sub={
          phase === 'reading'
            ? 'The agent is still reading. Questions show up here when documents disagree or a value is missing.'
            : 'Questions show up here when documents disagree or a value is missing.'
        }
      />
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-5 px-4 pt-1 pb-6">
          {pending.length > 0 && state && newest && (
            <div className="rounded-lg border border-warn/30 bg-warn-soft/50 px-3 py-3">
              <ul className="mb-3 flex flex-col gap-1 text-[13px]">
                {pending.map((i) => (
                  <li key={i.fieldId} className="flex items-baseline justify-between gap-3">
                    <span className="text-ink">{fieldDefs[i.fieldId]?.label}</span>
                    <span className="shrink-0 text-[12px] text-warn">{fields[i.fieldId]?.status === 'conflict' ? 'Documents disagree' : 'Missing'}</span>
                  </li>
                ))}
              </ul>
              <Button size="sm" className="h-8 text-[13px]" onClick={() => answerField(pending[0].fieldId)}>
                Answer now
              </Button>
            </div>
          )}
          {!pending.length && (
            <div className="flex items-center gap-2.5 rounded-lg border border-rule bg-panel px-3 py-3 text-[13px] text-ink-2">
              <CircleCheck className="size-4 shrink-0 text-ok" />
              {phase === 'reading' ? 'No questions yet.' : 'Every question is answered.'}
            </div>
          )}
          {history.length > 0 && (
            <section aria-labelledby="needs-history">
              <h3 id="needs-history" className="eyebrow mb-2">
                Your answers
              </h3>
              <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-panel">
                {history.map((i) => (
                  <li key={i.fieldId}>
                    <button
                      type="button"
                      onClick={() => focusField(i.fieldId)}
                      className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-panel-2/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12px] text-ink-3">{fieldDefs[i.fieldId]?.label}</span>
                        <span className="block truncate text-[13px] text-ink">{displayValue(fields[i.fieldId])}</span>
                      </span>
                      <StatusChip status={fields[i.fieldId]?.status ?? 'empty'} className="h-5 text-[11px]" />
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-ink-3">To change an answer, edit the value in the field list.</p>
            </section>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
