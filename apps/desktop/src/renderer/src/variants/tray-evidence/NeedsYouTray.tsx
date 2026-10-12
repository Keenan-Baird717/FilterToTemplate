import { Check, ChevronUp, ScanSearch } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { QuestionItem, QuestionSet, SourceRef } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import type { FieldRowOptions } from '@/components/FillPane'
import { CitationChip } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { questionsIn, skipQuestion, submitAnswers, useAgent, useOpenQuestion } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { focusRow, labelOf, useTray } from './state'

const NEEDS = ['conflict', 'missing']
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
const ease = [0.22, 1, 0.36, 1] as const

/**
 * The newest question set and where it stands: open (asking), skipped but
 * still unresolved (can be reopened), or nothing to answer.
 */
export function useQuestionState() {
  const open = useOpenQuestion()
  const { messages } = useAgent()
  const answered = useApp((s) => s.answered)
  const fields = useApp((s) => s.fields)
  return useMemo(() => {
    const newest = questionsIn(messages).at(-1) ?? null
    const pendingIn = (q: QuestionSet | null) => (q ? q.items.filter((i) => NEEDS.includes(fields[i.fieldId]?.status ?? '')) : [])
    const skipped = newest && answered[newest.id] === 'skipped' && pendingIn(newest).length ? newest : null
    const question = open ?? skipped
    return { open, skipped, question, pending: pendingIn(question) }
  }, [open, messages, answered, fields])
}

/** Open the tray on a question, reopening a skipped set first. */
export function askAbout(fieldId: string | null, question: QuestionSet | null, skipped: boolean) {
  if (!question) return
  if (skipped) useApp.getState().reopenQuestion(question.id)
  useTray.getState().openTray(fieldId)
}

// ---------------------------------------------------------------------------
// Row hooks: conflict and missing rows point at the tray instead of the chat.
// ---------------------------------------------------------------------------

/** Set by the layout on click capture, so a click on a chip or button inside a row doesn't also select the row. */
export const clickGuard = { onControl: false }

/**
 * Rows select a field (its evidence opens on the left); conflict and missing
 * rows still point at the tray for the answer.
 */
export function useTrayRowOptions(): FieldRowOptions {
  const { question, skipped, pending } = useQuestionState()
  const expanded = useTray((s) => s.expanded)
  const focus = useTray((s) => s.focus)
  const selected = useTray((s) => s.selected)

  return useMemo(() => {
    const isPending = (fieldId: string) => pending.some((i) => i.fieldId === fieldId)
    const linkText = skipped ? 'Answer now' : 'Answer above'
    const conflictItem = pending.find((i) => i.kind === 'choice') ?? pending[0]
    const link = (fieldId: string | null) => (
      <button
        type="button"
        data-te-link
        onClick={(e) => {
          e.stopPropagation()
          askAbout(fieldId, question, !!skipped)
        }}
        className="font-medium text-cobalt-ink underline-offset-2 hover:underline"
      >
        {linkText}
      </button>
    )

    return {
      conflictNote: question ? (
        <>Two documents disagree. {link(conflictItem?.fieldId ?? null)}</>
      ) : (
        'Two documents disagree. The agent will ask you which to use.'
      ),
      renderExtra: (fieldId, field) => {
        const answerLink = field?.status === 'missing' && isPending(fieldId) ? <span className="text-[12px]">{link(fieldId)}</span> : null
        if (selected !== fieldId) return answerLink
        return (
          <>
            {answerLink}
            {/* Phones: the evidence lives in a bottom sheet, opened from the selected row. */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-fit gap-1.5 border-cobalt/30 bg-panel text-[12px] text-cobalt-ink lg:hidden"
              onClick={(e) => {
                e.stopPropagation()
                useTray.getState().setSheetOpen(true)
              }}
            >
              <ScanSearch className="size-3.5" /> Show evidence
            </Button>
          </>
        )
      },
      selectedId: selected ?? (expanded ? (focus ?? null) : null),
      onSelect: (fieldId) => {
        if (clickGuard.onControl) return
        // Selecting text inside a row shouldn't count as a click on it.
        if (window.getSelection()?.toString()) return
        useTray.getState().select(fieldId)
        // Focus lands on the row so ↑/↓ continue from here.
        focusRow(fieldId)
      }
    }
  }, [question, skipped, pending, expanded, focus, selected])
}

// ---------------------------------------------------------------------------
// The tray
// ---------------------------------------------------------------------------

/** Pinned under the progress strip. Gone when nothing needs the user. */
export function NeedsYouTray() {
  const { question, skipped, pending } = useQuestionState()
  const { busy } = useAgent()
  const phase = useTray((s) => s.phase)
  const foldTray = useTray((s) => s.foldTray)
  const expanded = useTray((s) => s.expanded)

  usePhaseController(busy)

  const asking = !!question && !skipped && pending.length > 0
  const visible = asking || phase !== 'idle'

  // A new question set (or none) starts folded.
  useEffect(() => {
    if (!asking && expanded) foldTray()
  }, [asking, expanded, foldTray])

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="tray"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease }}
          className="shrink-0 overflow-clip"
        >
          <div className="border-b border-rule">
            {phase === 'applying' ? (
              <ApplyingLine />
            ) : phase === 'done' ? (
              <DoneLine />
            ) : question ? (
              <QuestionTray question={question} pending={pending} busy={busy} />
            ) : null}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** applying → done once the agent's turn ends; done folds away on its own. */
function usePhaseController(busy: boolean) {
  const phase = useTray((s) => s.phase)
  const sawBusy = useRef(false)

  useEffect(() => {
    if (phase !== 'applying') {
      sawBusy.current = false
      return
    }
    const finish = () => {
      const since = useTray.getState().phaseSince
      const flash = useApp.getState().flash
      const updated = Object.entries(flash)
        .filter(([id, at]) => at >= since && (id in fieldDefs || id === 'hourlyRates'))
        .sort((a, b) => a[1] - b[1])
        .map(([id]) => id)
      useTray.getState().finishApplying(updated)
    }
    if (busy) {
      sawBusy.current = true
      return
    }
    if (sawBusy.current) {
      finish()
      return
    }
    // The turn never started (e.g. the agent was unreachable): don't hang.
    const t = setTimeout(finish, 5000)
    return () => clearTimeout(t)
  }, [phase, busy])

  useEffect(() => {
    if (phase !== 'done') return
    const t = setTimeout(() => useTray.getState().settle(), 2800)
    return () => clearTimeout(t)
  }, [phase])
}

function Dot({ tone, live }: { tone: 'warn' | 'cobalt'; live?: boolean }) {
  return (
    <span className="relative flex size-2 shrink-0" aria-hidden>
      {live && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', tone === 'warn' ? 'bg-warn' : 'bg-cobalt')} />}
      <span className={cn('relative size-2 rounded-full', tone === 'warn' ? 'bg-warn' : 'bg-cobalt')} />
    </span>
  )
}

function QuestionTray({ question, pending, busy }: { question: QuestionSet; pending: QuestionItem[]; busy: boolean }) {
  const expanded = useTray((s) => s.expanded)
  const focus = useTray((s) => s.focus)
  const focusNonce = useTray((s) => s.focusNonce)
  const openTray = useTray((s) => s.openTray)
  const foldTray = useTray((s) => s.foldTray)
  const draft = useTray((s) => s.drafts[question.id])
  const setDraft = useTray((s) => s.setDraft)
  const values = useMemo(() => draft ?? {}, [draft])
  const [touched, setTouched] = useState(false)
  const [glow, setGlow] = useState<{ id: string; n: number } | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const toggleRef = useRef<HTMLButtonElement>(null)
  // A new question set pings its dot for a few seconds, then sits still.
  const [fresh, setFresh] = useState(true)
  useEffect(() => {
    setFresh(true)
    const t = setTimeout(() => setFresh(false), 4500)
    return () => clearTimeout(t)
  }, [question.id])

  const choiceMissing = pending.filter((i) => i.kind === 'choice' && !values[i.fieldId])
  const emailItem = pending.find((i) => i.inputType === 'email')
  const emailValue = emailItem ? (values[emailItem.fieldId] ?? '') : ''
  const emailInvalid = !!emailItem && emailValue.trim() !== '' && !emailOk(emailValue)

  // Bring the requested question into view and give it focus once the tray has opened.
  useEffect(() => {
    if (!expanded) return
    const target = focus && pending.some((i) => i.fieldId === focus) ? focus : pending[0]?.fieldId
    if (!target) return
    const t = setTimeout(() => {
      const block = bodyRef.current?.querySelector<HTMLElement>(`[data-question="${CSS.escape(target)}"]`)
      if (!block) return
      // Scroll only the tray's own box: scrollIntoView would also shift the
      // overflow-hidden panes around it while the tray is still opening.
      const box = bodyRef.current!
      const above = block.getBoundingClientRect().top - box.getBoundingClientRect().top
      const below = block.getBoundingClientRect().bottom - box.getBoundingClientRect().bottom
      if (above < 0) box.scrollTo({ top: box.scrollTop + above - 12, behavior: 'smooth' })
      else if (below > 0) box.scrollTo({ top: box.scrollTop + Math.min(below + 12, above - 12), behavior: 'smooth' })
      const control = block.querySelector<HTMLElement>('[role="radio"][data-state="checked"]') ?? block.querySelector<HTMLElement>('[role="radio"], input')
      control?.focus({ preventScroll: true })
      if (focus) setGlow({ id: target, n: focusNonce })
    }, 240)
    return () => clearTimeout(t)
    // pending only matters for which block exists; re-run on explicit requests
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, focusNonce])

  const submit = () => {
    setTouched(true)
    if (choiceMissing.length || emailInvalid || busy) return
    useTray.getState().startApplying()
    submitAnswers(question, values)
  }

  const skip = () => {
    foldTray()
    skipQuestion(question)
    toast('Skipped for now', {
      description: 'The fields stay flagged in the list.',
      action: { label: 'Undo', onClick: () => useApp.getState().reopenQuestion(question.id) }
    })
  }

  const count = pending.length

  return (
    <div
      role="region"
      aria-label="Questions for you"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && expanded) {
          e.stopPropagation()
          foldTray()
          toggleRef.current?.focus()
        }
      }}
    >
      {/* The calm line: always visible while something needs the user. */}
      <div className={cn('flex min-h-11 items-center gap-3 px-5 py-1.5 sm:px-6', expanded ? 'bg-warn-soft/55' : 'bg-warn-soft/40')}>
        <Dot tone="warn" live={fresh && !expanded} />
        <p className="min-w-0 flex-1 text-[13px] text-ink-2 sm:truncate">
          <span className="font-medium text-ink">
            {count} need{count === 1 ? 's' : ''} you:
          </span>{' '}
          {pending.map((item, i) => (
            <Fragment key={item.fieldId}>
              {i > 0 && <span className="px-1 text-ink-3">·</span>}
              <button type="button" onClick={() => openTray(item.fieldId)} className="rounded-sm underline-offset-2 hover:text-ink hover:underline">
                {labelOf(item.fieldId)}
              </button>
            </Fragment>
          ))}
        </p>
        {expanded ? (
          <Button
            ref={toggleRef}
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1 px-2 text-[12px] text-ink-2"
            onClick={foldTray}
            aria-expanded
            aria-controls="te-tray-body"
          >
            <ChevronUp className="size-3.5" /> Hide
          </Button>
        ) : (
          <Button
            ref={toggleRef}
            type="button"
            size="sm"
            variant="outline"
            className="h-7 border-warn/35 bg-panel px-3 text-[12px] font-medium hover:bg-panel"
            onClick={() => openTray()}
            aria-expanded={false}
            aria-controls="te-tray-body"
          >
            Answer
          </Button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            id="te-tray-body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.26, ease }}
            className="overflow-clip"
          >
            <form
              className="flex max-h-[min(58vh,560px)] flex-col border-t border-warn/15 bg-panel"
              onSubmit={(e) => {
                e.preventDefault()
                submit()
              }}
            >
              <div ref={bodyRef} className="@container min-h-0 overflow-y-auto">
                <div
                  className={cn(
                    'mx-auto grid max-w-[880px] gap-x-8 gap-y-6 px-5 pt-4 pb-5 sm:px-6',
                    count > 1 && '@2xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]'
                  )}
                >
                  {pending.map((item) => (
                    <QuestionBlock key={item.fieldId} glow={glow?.id === item.fieldId ? glow.n : undefined}>
                      {item.kind === 'choice' ? (
                        <ChoiceQuestion
                          qid={question.id}
                          item={item}
                          value={values[item.fieldId] ?? ''}
                          onChange={(v) => setDraft(question.id, item.fieldId, v)}
                          invalid={touched && !values[item.fieldId]}
                          disabled={busy}
                        />
                      ) : (
                        <TextQuestion
                          qid={question.id}
                          item={item}
                          value={values[item.fieldId] ?? ''}
                          onChange={(v) => setDraft(question.id, item.fieldId, v)}
                          invalid={item.inputType === 'email' && emailInvalid}
                          disabled={busy}
                        />
                      )}
                    </QuestionBlock>
                  ))}
                </div>
              </div>
              <div className="shrink-0 border-t border-rule bg-panel-2/50">
                <div className="mx-auto flex max-w-[880px] flex-wrap items-center justify-end gap-x-3 gap-y-2 px-5 py-2.5 sm:px-6">
                  <p className={cn('mr-auto min-w-0 text-[12px]', touched && choiceMissing.length ? 'text-bad' : 'text-ink-3')} aria-live="polite">
                    {busy
                      ? 'The agent is busy. Send when it finishes.'
                      : touched && choiceMissing.length
                        ? `Choose ${choiceMissing.map((i) => labelOf(i.fieldId).toLowerCase()).join(' and ')} to continue.`
                        : 'The agent applies your answers, then finishes the letter.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="ghost" size="sm" className="h-8 text-[12px]" onClick={skip}>
                      Skip for now
                    </Button>
                    <Button type="submit" size="sm" className="h-8 text-[12px]" disabled={busy}>
                      Send answers
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function QuestionBlock({ glow, children }: { glow?: number; children: ReactNode }) {
  return (
    <div className="relative isolate min-w-0">
      {glow !== undefined && <span key={glow} className="te-question-glow pointer-events-none absolute -inset-2 -z-10 rounded-lg" aria-hidden />}
      {children}
    </div>
  )
}

/** The sentence a quote sits in, with the quoted words emphasised. */
function QuoteLine({ source, className }: { source: SourceRef; className?: string }) {
  const doc = useApp((s) => s.docs.find((d) => d.id === source.docId))
  const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase()
  const page = doc?.content.find((p) => p.n === source.page) ?? doc?.content[0]
  const block = page?.blocks.find((b) => norm(b).includes(norm(source.quote)))
  let body: ReactNode = <span className="text-ink">{source.quote}</span>
  if (block) {
    const i = norm(block).indexOf(norm(source.quote))
    body = (
      <>
        {block.slice(0, i)}
        <span className="font-medium text-ink">{block.slice(i, i + source.quote.length)}</span>
        {block.slice(i + source.quote.length)}
      </>
    )
  }
  return <p className={cn('text-[12px] leading-snug text-ink-3', className)}>“{body}”</p>
}

function ChoiceQuestion({
  qid,
  item,
  value,
  onChange,
  invalid,
  disabled
}: {
  qid: string
  item: QuestionItem
  value: string
  onChange: (v: string) => void
  invalid: boolean
  disabled: boolean
}) {
  return (
    <fieldset data-question={item.fieldId} className="min-w-0">
      <legend className="text-[13px] font-medium text-ink">{item.label}</legend>
      {item.help && <p className="mt-0.5 text-[12px] text-ink-3">{item.help}</p>}
      <RadioGroup
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        aria-label={item.label}
        aria-invalid={invalid || undefined}
        className="mt-2.5 grid grid-cols-1 gap-2"
      >
        {item.options?.map((o) => {
          const id = `te-${qid}-${item.fieldId}-${o.value}`
          return (
            <div
              key={o.value}
              className={cn(
                'relative flex min-w-0 items-start gap-3 rounded-lg border bg-panel px-3 py-2.5 transition-colors',
                'hover:border-cobalt/40 has-[[data-state=checked]]:border-cobalt/60 has-[[data-state=checked]]:bg-cobalt-soft/45',
                'has-[:focus-visible]:border-cobalt/60',
                invalid ? 'border-bad/45' : 'border-rule'
              )}
            >
              <RadioGroupItem value={o.value} id={id} className="mt-[3px]" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                  {/* The label stretches over the tile so the whole tile picks the option. */}
                  <Label
                    htmlFor={id}
                    className="cursor-pointer text-[14px] leading-tight font-medium after:absolute after:inset-0 after:rounded-lg after:content-['']"
                  >
                    {o.display}
                  </Label>
                  <div className="relative z-10 ml-auto flex min-w-0 flex-wrap gap-1">
                    {o.sources.map((s, i) => (
                      <CitationChip key={i} source={s} className="h-5 text-[11px]" />
                    ))}
                  </div>
                </div>
                {o.sources.map((s, i) => (
                  <QuoteLine key={i} source={s} className="line-clamp-2" />
                ))}
              </div>
            </div>
          )
        })}
      </RadioGroup>
    </fieldset>
  )
}

function TextQuestion({
  qid,
  item,
  value,
  onChange,
  invalid,
  disabled
}: {
  qid: string
  item: QuestionItem
  value: string
  onChange: (v: string) => void
  invalid: boolean
  disabled: boolean
}) {
  const mention = useApp((s) => s.fields[item.fieldId]?.sources[0])
  const id = `te-${qid}-${item.fieldId}`
  return (
    <fieldset data-question={item.fieldId} className="min-w-0">
      <legend className="flex w-full items-baseline gap-2 text-[13px] font-medium text-ink">
        <label htmlFor={id}>{item.label}</label>
        <span className="text-[11px] font-normal text-ink-3">Optional</span>
      </legend>
      {item.help && <p className="mt-0.5 text-[12px] text-ink-3">{item.help}</p>}
      <Input
        id={id}
        type={item.inputType ?? 'text'}
        inputMode={item.inputType === 'email' ? 'email' : undefined}
        autoComplete="off"
        placeholder={item.placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? `${id}-error` : undefined}
        className="mt-2.5 h-8 bg-panel text-[13px]"
      />
      {invalid && (
        <p id={`${id}-error`} className="mt-1.5 text-[12px] text-bad">
          Enter an address like name@acmeholdings.com, or leave it blank.
        </p>
      )}
      {mention && (
        <div className="mt-3 flex min-w-0 flex-col gap-1.5 border-l-0">
          <span className="eyebrow text-[10px]">Closest mention</span>
          <QuoteLine source={mention} />
          <div className="flex">
            <CitationChip source={mention} className="h-5 text-[11px]" />
          </div>
        </div>
      )}
    </fieldset>
  )
}

// ---------------------------------------------------------------------------
// While the agent applies the answers, then a short confirmation.
// ---------------------------------------------------------------------------

function ApplyingLine() {
  const activity = useApp((s) => s.activity)
  const fields = useApp((s) => s.fields)
  const flash = useApp((s) => s.flash)
  const since = useTray((s) => s.phaseSince)
  const focusField = useApp((s) => s.focusField)

  const changed = Object.entries(flash)
    .filter(([id, at]) => at >= since && id in fieldDefs)
    .sort((a, b) => b[1] - a[1])
  const drafting = Object.keys(fieldDefs).find((id) => fields[id]?.status === 'drafting')
  const writing = drafting ?? changed[0]?.[0]

  return (
    <div className="flex min-h-11 items-center gap-3 bg-cobalt-soft/40 px-5 py-1.5 sm:px-6" role="status" aria-live="polite">
      <Dot tone="cobalt" live />
      <div className="flex min-w-0 flex-1 items-baseline gap-2 text-[13px]">
        <Shimmer as="span" className="shrink-0 text-[13px] font-medium" duration={1.6}>{`${activity ?? 'Applying your answers'}…`}</Shimmer>
        {writing && (
          <>
            <span className="text-ink-3" aria-hidden>
              ·
            </span>
            <button type="button" onClick={() => focusField(writing)} className="min-w-0 truncate text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              {labelOf(writing)}
            </button>
          </>
        )}
      </div>
      {changed.length > 0 && <span className="num shrink-0 text-[12px] text-ink-3">{changed.length} updated</span>}
    </div>
  )
}

function DoneLine() {
  const updated = useTray((s) => s.updated)
  const n = updated.length
  return (
    <div className="flex min-h-11 items-center gap-2.5 bg-ok-soft/55 px-5 py-1.5 text-[13px] sm:px-6" role="status" aria-live="polite">
      <Check className="size-4 shrink-0 text-ok" strokeWidth={2.5} aria-hidden />
      <span className="shrink-0 font-medium text-ink">{n ? `Done: ${n} value${n === 1 ? '' : 's'} updated` : 'Done'}</span>
      {n > 0 && <span className="min-w-0 truncate text-ink-3">{updated.map(labelOf).join(', ')}</span>}
    </div>
  )
}
