import { ArrowUpRight, BadgeCheck, Check, ChevronDown, CircleCheck, Download, FileText, Loader2, PenLine, Undo2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fieldDefs, sections } from '../../../../agent-core/demo-data'
import type { AnswerPayload, QuestionItem, QuestionSet } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { CitationChip, StatusChip } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ScrollArea } from '@/components/ui/scroll-area'
import { questionsIn, skipQuestion, submitAnswers, useAgent, useOpenQuestion } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { displayValue, summarize, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { SourceTag, isOpen, isReady, reviewItems, type ReviewItem } from './bits'
import { lastUserMessage, useSidekick } from './state'

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
const scrollFix = '[&_[data-slot=scroll-area-viewport]>div]:!block'

/**
 * The "Needs you" tab: the open question as a calm form; then the agent
 * applying the answers; otherwise a review queue of values to approve.
 */
export function NeedsYou() {
  const { messages, busy } = useAgent()
  const open = useOpenQuestion()
  const [pending, setPending] = useState<AnswerPayload | null>(null)
  const lastUser = lastUserMessage(messages)
  const sent = lastUser?.metadata?.answer
  const waiting = !!sent && (busy || messages.at(-1)?.role === 'user')
  const applying = open ? null : (pending ?? (waiting ? sent : null))

  // The pending copy only bridges the moment between answering and the message landing.
  useEffect(() => {
    if (pending && sent?.questionId === pending.questionId) setPending(null)
  }, [pending, sent])

  // When the agent finishes applying answers, keep a short note in the review queue.
  const last = useRef<AnswerPayload | null>(null)
  useEffect(() => {
    if (last.current && !applying) useSidekick.getState().setApplied(last.current)
    last.current = applying ?? null
  }, [applying])

  const view = open ? `ask-${open.id}` : applying ? 'applying' : 'review'

  return (
    <div className="relative h-full min-h-0">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={view}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="flex h-full min-h-0 flex-col"
        >
          {open ? (
            <AskForm question={open} disabled={busy} onSent={setPending} />
          ) : applying ? (
            <Applying answer={applying} />
          ) : (
            <ReviewQueue />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The open question
// ---------------------------------------------------------------------------

function AskForm({ question, disabled, onSent }: { question: QuestionSet; disabled: boolean; onSent: (a: AnswerPayload) => void }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const [touched, setTouched] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const missingChoice = question.items.find((i) => i.kind === 'choice' && !values[i.fieldId])
  const emailItem = question.items.find((i) => i.inputType === 'email')
  const emailValue = emailItem ? (values[emailItem.fieldId] ?? '') : ''
  const emailInvalid = !!emailItem && emailValue.trim() !== '' && !emailOk(emailValue)
  const answeredCount = question.items.filter((i) => (values[i.fieldId] ?? '').trim()).length

  const submit = () => {
    setTouched(true)
    if (missingChoice) {
      formRef.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(missingChoice.fieldId)}"] [role=radio]`)?.focus()
      return
    }
    if (emailInvalid && emailItem) {
      document.getElementById(`sk-${question.id}-${emailItem.fieldId}`)?.focus()
      return
    }
    const answers = Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v.trim()]))
    onSent({ questionId: question.id, answers })
    submitAnswers(question, answers)
  }

  return (
    <form
      ref={formRef}
      className="flex h-full min-h-0 flex-col"
      aria-labelledby={`sk-${question.id}-title`}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <ScrollArea className={cn('min-h-0 flex-1', scrollFix)}>
        <div className="relative flex flex-col gap-8 px-5 pt-5 pb-8">
          <header className="flex flex-col gap-1">
            <h2 id={`sk-${question.id}-title`} className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-ink">
              {question.title}
            </h2>
            <p className="text-[13px] text-ink-2">{question.reason}. Your answers go straight into the letter.</p>
          </header>

          {question.items.map((item) =>
            item.kind === 'choice' ? (
              <ChoiceItem
                key={item.fieldId}
                qid={question.id}
                item={item}
                value={values[item.fieldId] ?? ''}
                onChange={(v) => setValues((s) => ({ ...s, [item.fieldId]: v }))}
                disabled={disabled}
                error={touched && !values[item.fieldId] ? 'Choose a date to continue.' : null}
              />
            ) : (
              <TextItem
                key={item.fieldId}
                qid={question.id}
                item={item}
                value={values[item.fieldId] ?? ''}
                onChange={(v) => setValues((s) => ({ ...s, [item.fieldId]: v }))}
                disabled={disabled}
                invalid={emailInvalid && item.inputType === 'email'}
              />
            )
          )}
        </div>
      </ScrollArea>

      <footer className="flex items-center gap-2 border-t border-rule bg-panel px-5 py-3">
        <span className="num mr-auto text-[12px] text-ink-3" aria-live="polite">
          {answeredCount} of {question.items.length} answered
        </span>
        <Button type="button" variant="ghost" size="sm" className="h-8 text-[13px]" disabled={disabled} onClick={() => skipQuestion(question)}>
          Skip for now
        </Button>
        <Button type="submit" size="sm" className="h-8 text-[13px]" disabled={disabled}>
          Send answers
        </Button>
      </footer>
    </form>
  )
}

function ItemHeader({ item, status }: { item: QuestionItem; status: 'conflict' | 'missing' }) {
  const label = fieldDefs[item.fieldId]?.label ?? item.fieldId
  return (
    <div className="flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => useApp.getState().revealField(item.fieldId)}
        className="group/eyebrow eyebrow flex min-w-0 items-center gap-1 rounded-sm transition-colors hover:text-ink-2"
        aria-label={`Show ${label} in the fields`}
      >
        <span className="truncate">{label}</span>
        <ArrowUpRight className="size-3 opacity-0 transition-opacity group-hover/eyebrow:opacity-100 group-focus-visible/eyebrow:opacity-100" />
      </button>
      <span className={cn('shrink-0 text-[11px] font-medium', status === 'conflict' ? 'text-warn' : 'text-bad')}>
        {status === 'conflict' ? 'Documents disagree' : 'Not in any document'}
      </span>
    </div>
  )
}

function ChoiceItem({
  qid,
  item,
  value,
  onChange,
  disabled,
  error
}: {
  qid: string
  item: QuestionItem
  value: string
  onChange: (v: string) => void
  disabled: boolean
  error: string | null
}) {
  const labelId = `sk-${qid}-${item.fieldId}-label`
  return (
    <div className="flex min-w-0 flex-col gap-3" data-item={item.fieldId}>
      <div className="flex flex-col gap-1">
        <ItemHeader item={item} status="conflict" />
        <h3 id={labelId} className="text-[15px] leading-snug font-medium text-ink">
          {item.label}
        </h3>
        {item.help && <p className="text-[13px] text-ink-3">{item.help}</p>}
      </div>
      <RadioGroup value={value} onValueChange={onChange} className="gap-2" disabled={disabled} aria-labelledby={labelId} aria-invalid={!!error}>
        {item.options?.map((o) => {
          const id = `sk-${qid}-${item.fieldId}-${o.value}`
          const checked = value === o.value
          return (
            <div
              key={o.value}
              onClick={() => !disabled && onChange(o.value)}
              className={cn(
                'flex min-w-0 cursor-pointer items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors',
                checked ? 'border-cobalt/60 bg-cobalt-soft/50' : 'border-rule hover:border-ink-3/50 hover:bg-panel-2/60',
                disabled && 'cursor-default opacity-70'
              )}
            >
              <RadioGroupItem value={o.value} id={id} className="mt-1 border-ink-3/60 data-[state=checked]:border-cobalt" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Label htmlFor={id} className="cursor-pointer text-[15px] leading-snug font-semibold text-ink">
                  {o.display}
                </Label>
                {o.sources.map((s, i) => (
                  <div key={i} className="flex min-w-0 flex-col items-start gap-2">
                    <blockquote className="font-serif text-[14px] leading-snug text-ink-2">“{s.quote}”</blockquote>
                    <span onClick={(e) => e.stopPropagation()} className="max-w-full min-w-0">
                      <CitationChip source={s} />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </RadioGroup>
      {error && <p className="text-[12px] text-bad">{error}</p>}
    </div>
  )
}

function TextItem({
  qid,
  item,
  value,
  onChange,
  disabled,
  invalid
}: {
  qid: string
  item: QuestionItem
  value: string
  onChange: (v: string) => void
  disabled: boolean
  invalid: boolean
}) {
  const closest = useApp((s) => s.fields[item.fieldId]?.sources[0])
  const id = `sk-${qid}-${item.fieldId}`
  return (
    <div className="flex min-w-0 flex-col gap-3" data-item={item.fieldId}>
      <div className="flex flex-col gap-1">
        <ItemHeader item={item} status="missing" />
        <Label htmlFor={id} className="text-[15px] leading-snug font-medium text-ink">
          {item.label}
        </Label>
        {item.help && <p className="text-[13px] text-ink-3">{item.help}</p>}
      </div>
      <div className="flex flex-col gap-1.5">
        <Input
          id={id}
          type={item.inputType ?? 'text'}
          inputMode={item.inputType === 'email' ? 'email' : undefined}
          autoComplete="off"
          placeholder={item.placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={invalid}
          aria-describedby={`${id}-hint`}
          className="h-9 text-[14px]"
        />
        <p id={`${id}-hint`} className={cn('text-[12px]', invalid ? 'text-bad' : 'text-ink-3')}>
          {invalid ? 'Enter an address like name@acmeholdings.com, or leave it blank.' : 'Optional. Leave it blank to keep the field flagged.'}
        </p>
      </div>
      {closest && (
        <div className="flex flex-col items-start gap-2 rounded-lg bg-panel-2 px-3.5 py-3">
          <span className="eyebrow">Closest mention</span>
          <blockquote className="font-serif text-[14px] leading-snug text-ink-2">“{closest.quote}”</blockquote>
          <CitationChip source={closest} />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// The agent applying the answers
// ---------------------------------------------------------------------------

function Applying({ answer }: { answer: AnswerPayload }) {
  const { messages } = useAgent()
  const fields = useApp((s) => s.fields)
  const flash = useApp((s) => s.flash)
  const activity = useApp((s) => s.activity)
  const [since] = useState(() => Date.now() - 500)
  const question = questionsIn(messages).find((q) => q.id === answer.questionId)
  const answerIds = new Set(question?.items.map((i) => i.fieldId) ?? [])

  // Other values that land while the agent works (e.g. the scope summary it writes next).
  const others = Object.keys(fieldDefs)
    .filter((id) => !answerIds.has(id) && (fields[id]?.status === 'drafting' || (flash[id] ?? 0) >= since))
    .sort((a, b) => (flash[a] ?? Infinity) - (flash[b] ?? Infinity))

  return (
    <ScrollArea className={cn('h-full', scrollFix)}>
      <div className="relative flex flex-col gap-5 px-5 pt-5 pb-8" aria-live="polite">
        <header className="flex flex-col gap-1">
          <h2 className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-ink">Applying your answers</h2>
          <Shimmer className="text-[13px]" duration={1.6}>{`${activity ?? 'Updating the letter'}…`}</Shimmer>
        </header>

        <ol className="flex flex-col divide-y divide-rule rounded-lg border border-rule">
          {question?.items.map((item) => {
            const given = answer.answers[item.fieldId]?.trim()
            const shown = item.options?.find((o) => o.value === given)?.display ?? given
            const f = fields[item.fieldId]
            const landed = !!given && f?.status === 'user_answered'
            return (
              <LandingRow
                key={item.fieldId}
                label={fieldDefs[item.fieldId]?.label ?? item.fieldId}
                state={!given ? 'skipped' : landed ? 'done' : 'working'}
                value={given ? (shown ?? '') : 'Skipped. The field stays flagged.'}
                note={landed ? 'From you' : undefined}
              />
            )
          })}
          <AnimatePresence initial={false}>
            {others.map((id) => {
              const f = fields[id]
              const drafting = f?.status === 'drafting'
              return (
                <LandingRow
                  key={id}
                  label={fieldDefs[id]?.label ?? id}
                  state={drafting ? 'writing' : 'done'}
                  value={displayValue(f) ?? ''}
                  note={drafting ? `${(displayValue(f) ?? '').split(/\s+/).filter(Boolean).length} words` : f?.status === 'verified' ? 'Checked against sources' : undefined}
                  long
                />
              )
            })}
          </AnimatePresence>
        </ol>
      </div>
    </ScrollArea>
  )
}

function LandingRow({
  label,
  state,
  value,
  note,
  long
}: {
  label: string
  state: 'working' | 'writing' | 'done' | 'skipped'
  value: string
  note?: string
  long?: boolean
}) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex min-w-0 gap-3 px-3.5 py-3"
    >
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center">
        {state === 'done' ? (
          <motion.span initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 600, damping: 22 }}>
            <CircleCheck className="size-4 text-ok" aria-label="Done" />
          </motion.span>
        ) : state === 'writing' ? (
          <PenLine className="size-4 animate-pulse text-cobalt-ink" aria-label="Writing" />
        ) : state === 'working' ? (
          <Loader2 className="size-4 animate-spin text-ink-3" aria-label="Setting" />
        ) : (
          <span className="size-1.5 rounded-full bg-ink-3" aria-hidden />
        )}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[12px] text-ink-3">{label}</span>
          {note && <span className="shrink-0 text-[11px] text-ink-3">{note}</span>}
        </div>
        <span
          className={cn(
            'min-w-0 text-[14px] break-words',
            state === 'skipped' ? 'text-ink-3' : 'text-ink',
            long && 'line-clamp-4 text-[13px] leading-relaxed',
            state === 'writing' && 'caret'
          )}
        >
          {value || (state === 'working' ? 'Setting…' : '')}
        </span>
      </div>
    </motion.li>
  )
}

// ---------------------------------------------------------------------------
// Review queue (nothing needs an answer)
// ---------------------------------------------------------------------------

function ReviewQueue() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveField = useApp((s) => s.approveField)
  const approveSection = useApp((s) => s.approveSection)
  const activity = useApp((s) => s.activity)
  const answered = useApp((s) => s.answered)
  const applied = useSidekick((s) => s.applied)
  const setApplied = useSidekick((s) => s.setApplied)
  const { messages, busy } = useAgent()
  const groups = useMemo(() => reviewItems(fields, rates), [fields, rates])
  const { total } = summarize(fields, rates)
  const all = groups.flatMap((g) => g.items)
  const ready = all.filter((i) => isReady(i.status))
  const approved = all.filter((i) => i.status === 'approved')
  const open = all.filter((i) => isOpen(i.status))
  const filling = all.filter((i) => i.status === 'empty' || i.status === 'drafting').length
  const newest = questionsIn(messages).at(-1)
  const skipped = newest && answered[newest.id] === 'skipped' ? newest : null
  const allApproved = approved.length === total

  const approveAll = () => {
    sections.forEach((s) => approveSection(s.id))
    toast.success(`Approved ${ready.length} value${ready.length === 1 ? '' : 's'}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-3 border-b border-rule px-5 pt-5 pb-4">
        {busy && filling > 0 ? (
          <div className="flex flex-col gap-1">
            <h2 className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-ink">Nothing needs you yet</h2>
            <p className="text-[13px] text-ink-2">The agent is filling the letter. Values show up here to approve as they land.</p>
            <Shimmer className="mt-1 text-[12px] font-medium" duration={1.6}>{`${activity ?? 'Working'}…`}</Shimmer>
          </div>
        ) : allApproved ? (
          <div className="flex flex-col gap-1">
            <h2 className="flex items-center gap-2 text-[17px] leading-snug font-semibold tracking-[-0.01em] text-ink">
              <BadgeCheck className="size-5 text-ok" /> Ready to export
            </h2>
            <p className="text-[13px] text-ink-2">All {total} values are approved.</p>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h2 className="text-[17px] leading-snug font-semibold tracking-[-0.01em] text-ink">
                {ready.length ? 'Ready to approve' : open.length ? 'Still open' : 'Review'}
              </h2>
              <p className="num text-[13px] text-ink-2">
                {ready.length} to approve · {approved.length} of {total} approved
              </p>
            </div>
            {ready.length > 1 && (
              <Button size="sm" variant="outline" className="h-8 shrink-0 gap-1.5 text-[13px]" onClick={approveAll}>
                <Check className="size-3.5" /> Approve all {ready.length}
              </Button>
            )}
          </div>
        )}
        <ApprovalMeter approved={approved.length} ready={ready.length} total={total} />
      </header>

      <ScrollArea className={cn('min-h-0 flex-1', scrollFix)}>
        <div className="relative flex flex-col gap-6 px-5 pt-4 pb-10">
          <AnimatePresence initial={false}>
            {applied && !busy && !allApproved && (
              <motion.div
                key="applied"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <AppliedNote applied={applied} onDismiss={() => setApplied(null)} />
              </motion.div>
            )}
          </AnimatePresence>

          {allApproved && (
            <div className="flex flex-col gap-2">
              <Button className="h-9 gap-1.5" onClick={() => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))}>
                <Download className="size-4" /> Export .docx
              </Button>
              <Button variant="ghost" className="h-9 gap-1.5 text-ink-2" onClick={() => useApp.getState().setView('preview')}>
                <FileText className="size-4" /> Preview the letter
              </Button>
            </div>
          )}

          {open.length > 0 && !busy && (
            <section className="flex flex-col gap-2" aria-label="Still open">
              <h3 className="eyebrow">Still open</h3>
              <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule">
                {open.map((item) => (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2.5">
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => useApp.getState().revealField(item.id)}>
                      <span className="block truncate text-[13px] font-medium text-ink">{item.label}</span>
                    </button>
                    <StatusChip status={item.status} className="h-5 text-[11px]" />
                    {skipped?.items.some((q) => q.fieldId === item.id) ? (
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[12px]" onClick={() => useApp.getState().reopenQuestion(skipped.id)}>
                        Answer now
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {groups.map(({ section, items }) => {
            const rows = items.filter((i) => isReady(i.status))
            if (!rows.length) return null
            return (
              <section key={section.id} className="flex flex-col gap-2" aria-label={section.title}>
                <div className="flex items-center gap-2">
                  <h3 className="eyebrow">{section.title}</h3>
                  <span className="num text-[11px] text-ink-3">{rows.length}</span>
                  <div className="h-px flex-1 bg-rule" />
                  {rows.length > 1 && (
                    <button
                      type="button"
                      className="rounded-sm text-[12px] font-medium text-ink-2 hover:text-ink"
                      onClick={() => {
                        approveSection(section.id)
                        toast.success(`${section.title} approved`)
                      }}
                    >
                      Approve section
                    </button>
                  )}
                </div>
                <ul className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-panel">
                  <AnimatePresence initial={false}>
                    {rows.map((item) => (
                      <ReadyRow key={item.id} item={item} onApprove={() => approveField(item.id)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            )
          })}

          {!ready.length && !open.length && !allApproved && !busy && (
            <p className="text-[13px] text-ink-3">Nothing to approve right now.</p>
          )}

          {approved.length > 0 && <ApprovedList items={approved} />}
        </div>
      </ScrollArea>
    </div>
  )
}

function ApprovalMeter({ approved, ready, total }: { approved: number; ready: number; total: number }) {
  return (
    <div
      className="flex h-1 overflow-hidden rounded-full bg-rule"
      role="progressbar"
      aria-label="Values approved"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={approved}
    >
      <span className="h-full bg-ok transition-[width] duration-500" style={{ width: `${(approved / total) * 100}%` }} />
      <span className="h-full bg-ok/30 transition-[width] duration-500" style={{ width: `${(ready / total) * 100}%` }} />
    </div>
  )
}

function ReadyRow({ item, onApprove }: { item: ReviewItem; onApprove: () => void }) {
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 24, transition: { duration: 0.16 } }}
      className="group/row flex min-w-0 items-center gap-3 px-3 py-2.5"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            className="truncate rounded-sm text-left text-[12px] text-ink-3 hover:text-ink-2"
            onClick={() => useApp.getState().revealField(item.id)}
            title="Show in the fields"
          >
            {item.label}
          </button>
          {item.byUser ? (
            <span className="text-[11px] font-medium text-cobalt-ink">From you</span>
          ) : (
            item.sources.slice(0, 2).map((s) => <SourceTag key={s.docId} source={s} />)
          )}
        </div>
        <span className={cn('min-w-0 text-[14px] break-words text-ink', item.narrative && 'line-clamp-2 text-[13px] leading-relaxed')}>{item.value}</span>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-7 shrink-0 gap-1 px-2 text-[12px] hover:border-ok/50 hover:bg-ok-soft hover:text-ok"
        onClick={onApprove}
        aria-label={`Approve ${item.label}`}
      >
        <Check className="size-3.5" /> Approve
      </Button>
    </motion.li>
  )
}

function ApprovedList({ items }: { items: ReviewItem[] }) {
  const [open, setOpen] = useState(false)
  const unapprove = useApp((s) => s.unapproveField)
  return (
    <section className="flex flex-col gap-2" aria-label="Approved">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-sm text-left"
      >
        <span className="eyebrow">Approved</span>
        <span className="num text-[11px] text-ink-3">{items.length}</span>
        <span className="h-px flex-1 bg-rule" aria-hidden />
        <ChevronDown className={cn('size-3.5 text-ink-3 transition-transform', open && 'rotate-180')} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex flex-col overflow-hidden"
          >
            {items.map((item) => (
              <li key={item.id} className="flex min-w-0 items-center gap-2.5 py-1.5">
                <BadgeCheck className="size-3.5 shrink-0 text-ok" aria-hidden />
                <span className="w-32 shrink-0 truncate text-[12px] text-ink-3">{item.label}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] text-ink">{item.value}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 shrink-0 gap-1 px-1.5 text-[11px] text-ink-3"
                  onClick={() => unapprove(item.id)}
                  aria-label={`Undo approval of ${item.label}`}
                >
                  <Undo2 className="size-3" /> Undo
                </Button>
              </li>
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </section>
  )
}

function AppliedNote({ applied, onDismiss }: { applied: AnswerPayload; onDismiss: () => void }) {
  const { messages } = useAgent()
  const question = questionsIn(messages).find((q) => q.id === applied.questionId)
  const set = question?.items.filter((i) => applied.answers[i.fieldId]?.trim()) ?? []
  return (
    <div className="flex items-start gap-3 rounded-lg bg-ok-soft px-3.5 py-3">
      <CircleCheck className="mt-0.5 size-4 shrink-0 text-ok" />
      <div className="min-w-0 flex-1 text-[13px] text-ink">
        <p className="font-medium">Your answers are in</p>
        <p className="text-ink-2">
          {set.length
            ? `${set.map((i) => (fieldDefs[i.fieldId]?.label ?? i.fieldId).toLowerCase()).join(' and ')} ${set.length === 1 ? 'is' : 'are'} set. Approve the rest below, then export.`.replace(/^./, (c) => c.toUpperCase())
            : 'The agent kept going without them. Those fields stay flagged.'}
        </p>
      </div>
      <button type="button" onClick={onDismiss} className="rounded-sm p-0.5 text-ink-3 hover:text-ink" aria-label="Dismiss">
        <X className="size-3.5" />
      </button>
    </div>
  )
}
