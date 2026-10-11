import { ArrowLeft, ArrowRight, Check, ChevronDown, Circle, CircleCheck, LoaderCircle, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { fieldDefs, sections, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState, QuestionSet } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { useSummary } from '@/lib/agent'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Quote, sectionStats, SourceChip, StatusPill, StepIntro, useJustChanged, useLatestTurn, where } from './parts'
import { StepFooter } from './StepFooter'

// ---------------------------------------------------------------------------
// Fill progress: which part of a fresh run the agent has reached.
// ---------------------------------------------------------------------------

const phases: { activity: string; label: string; section?: string }[] = [
  { activity: 'Building document catalog', label: 'Reading your documents' },
  { activity: 'Extracting Parties', label: 'Parties', section: 'parties' },
  { activity: 'Extracting Engagement', label: 'Engagement', section: 'engagement' },
  { activity: 'Extracting Fees', label: 'Fees and rates', section: 'fees' },
  { activity: 'Extracting Scope', label: 'Scope', section: 'scope' },
  { activity: 'Checking conflicts', label: 'Checking for conflicts and gaps' }
]

export function useFillProgress() {
  const turn = useLatestTurn()
  const activity = useApp((s) => s.activity)
  const running = turn.busy && turn.mode === 'fill'
  const [reached, setReached] = useState(-1)
  const [seen, setSeen] = useState(false)

  useEffect(() => {
    if (!running) return
    setReached(-1)
    setSeen(true)
  }, [running])

  useEffect(() => {
    if (!running) return
    const i = phases.findIndex((p) => p.activity === activity)
    if (i >= 0) setReached((r) => Math.max(r, i))
  }, [activity, running])

  return { running, reached, seen, turn, dismiss: () => setSeen(false) }
}

export type FillProgress = ReturnType<typeof useFillProgress>

// ---------------------------------------------------------------------------

export function StepFound({
  progress,
  question,
  onBack,
  onNext,
  onResolve,
  onRunFill
}: {
  progress: FillProgress
  question: QuestionSet | null
  onBack: () => void
  onNext: () => void
  onResolve: (fieldId: string) => void
  onRunFill: () => void
}) {
  const { counts, total, done } = useSummary()
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const activity = useApp((s) => s.activity)
  const attention = counts.conflict + counts.missing
  const [open, setOpen] = useState<string[]>(() => {
    const flagged = sections.filter((s) => sectionStats(s, fields, rates).attention > 0).map((s) => s.id)
    return flagged.length ? flagged : [sections[0].id]
  })
  const otherWork = progress.turn.busy && progress.turn.mode !== 'fill'
  const asks = question?.items.length ?? 0

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[1080px] flex-1 px-4 pt-8 pb-12 sm:px-8 sm:pt-12">
        <StepIntro step={2} title="Here’s what we found">
          We matched your documents to the {total} items in the engagement letter. Open a section to see each value and the line it came from.
        </StepIntro>

        <AnimatePresence initial={false}>
          {(progress.running || progress.seen) && <LiveChecklist progress={progress} question={question} onAnswer={onNext} />}
        </AnimatePresence>

        {/* Overall progress */}
        <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-5">
          <div className="flex items-baseline gap-2.5">
            <span className="steps-display text-[52px] leading-none text-ink tabular-nums">{done}</span>
            <span className="text-[16px] text-ink-2">of {total} filled</span>
          </div>
          <div className="min-w-[220px] flex-1">
            <SegmentBar counts={counts} total={total} />
            <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13.5px] text-ink-2">
              <Legend tone="bg-ok" label={`${done} filled`} />
              {counts.conflict > 0 && <Legend tone="bg-warn" label={`${counts.conflict} with two values`} />}
              {counts.missing > 0 && <Legend tone="bg-bad" label={`${counts.missing} missing`} />}
              {counts.empty + counts.drafting > 0 && <Legend tone="bg-ink-3/30" label={`${counts.empty + counts.drafting} waiting`} />}
            </ul>
          </div>
          {otherWork && (
            <Shimmer as="p" className="text-[14px] font-medium" duration={1.6}>{`${activity ?? 'Working'}…`}</Shimmer>
          )}
        </div>

        {attention > 0 && !progress.running && (
          <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl bg-warn-soft px-5 py-3.5">
            <p className="min-w-0 flex-1 text-[15px] text-ink">
              <span className="font-semibold">{attention === 1 ? 'One item needs you.' : `${attention} items need you.`}</span>{' '}
              <span className="text-ink-2">{question ? 'Answer a couple of quick questions and we’ll finish the rest.' : 'Fix them in review before you export.'}</span>
            </p>
            <button type="button" onClick={onNext} className="flex shrink-0 items-center gap-1.5 rounded-full px-1 text-[15px] font-semibold text-ink underline decoration-ink-3/50 underline-offset-4 hover:decoration-ink">
              {question ? 'Answer now' : 'Go to review'} <ArrowRight className="size-4" />
            </button>
          </div>
        )}

        {/* Sections */}
        <div className="mt-8 divide-y divide-rule overflow-hidden rounded-2xl border border-rule bg-panel">
          {sections.map((section) => (
            <SectionSummary
              key={section.id}
              section={section}
              open={open.includes(section.id)}
              onOpenChange={(o) => setOpen((s) => (o ? [...s, section.id] : s.filter((x) => x !== section.id)))}
              onResolve={onResolve}
            />
          ))}
        </div>
      </div>

      <StepFooter
        back={
          <Button variant="ghost" className="h-11 gap-2 rounded-full px-4 text-[15px] text-ink-2" onClick={onBack}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
        hint={progress.running ? 'The agent is still working. You can look around.' : undefined}
        secondary={
          <Button variant="ghost" className="h-11 gap-2 rounded-full px-4 text-[15px] text-ink-2" onClick={onRunFill} disabled={progress.turn.busy}>
            <RotateCcw className="size-4" /> <span className="hidden sm:inline">Fill again</span>
            <span className="sr-only sm:hidden">Fill again</span>
          </Button>
        }
        primary={
          <Button className="h-11 gap-2 rounded-full px-6 text-[15px] font-semibold" onClick={onNext}>
            {question ? `Answer ${asks} question${asks === 1 ? '' : 's'}` : 'Review and export'} <ArrowRight className="size-4" />
          </Button>
        }
      />
    </div>
  )
}

function Legend({ tone, label }: { tone: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={cn('size-2 rounded-full', tone)} aria-hidden />
      {label}
    </li>
  )
}

function SegmentBar({ counts, total }: { counts: ReturnType<typeof useSummary>['counts']; total: number }) {
  const parts = [
    { n: counts.approved + counts.verified + counts.user_answered, cls: 'bg-ok' },
    { n: counts.drafting, cls: 'bg-cobalt' },
    { n: counts.conflict, cls: 'bg-warn' },
    { n: counts.missing, cls: 'bg-bad' }
  ]
  const done = counts.approved + counts.verified + counts.user_answered
  return (
    <div
      className="flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-panel-2"
      role="progressbar"
      aria-label="Items filled"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={done}
    >
      {parts.map((p, i) =>
        p.n ? <span key={i} className={cn('h-full rounded-full transition-[width] duration-500', p.cls)} style={{ width: `${(p.n / total) * 100}%` }} /> : null
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------

function LiveChecklist({ progress, question, onAnswer }: { progress: FillProgress; question: QuestionSet | null; onAnswer: () => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const reduce = useReducedMotion()
  const { running, reached, turn } = progress
  const lastTool = turn.mode === 'fill' ? turn.tools[turn.tools.length - 1] : undefined

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.25 }}
      aria-live="polite"
      aria-label="Fill progress"
      className="mt-8 rounded-2xl bg-panel-2 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {running ? <LoaderCircle className="size-5 animate-spin text-ink-2" /> : <CircleCheck className="size-5 text-ok" />}
        <h2 className="text-[17px] font-semibold text-ink">{running ? 'Filling the letter from your documents' : 'Finished reading your documents'}</h2>
        {!running && (
          <button type="button" onClick={progress.dismiss} className="ml-auto rounded-full px-2 py-1 text-[13px] text-ink-3 hover:bg-panel hover:text-ink">
            Hide
          </button>
        )}
      </div>

      <ol className="mt-4 grid gap-x-8 gap-y-0.5 sm:grid-cols-2">
        {phases.map((p, i) => {
          const state = !running || i < reached ? 'done' : i === reached ? 'active' : 'todo'
          const section = p.section ? sections.find((s) => s.id === p.section) : undefined
          const stats = section ? sectionStats(section, fields, rates) : undefined
          return (
            <li key={p.activity} className="flex min-w-0 items-center gap-3 py-1.5">
              {state === 'done' ? (
                <CircleCheck className="size-[18px] shrink-0 text-ok" aria-label="Done" />
              ) : state === 'active' ? (
                <LoaderCircle className="size-[18px] shrink-0 animate-spin text-ink" aria-label="In progress" />
              ) : (
                <Circle className="size-[18px] shrink-0 text-ink-3/50" aria-label="Not started" />
              )}
              {state === 'active' ? (
                <Shimmer as="span" className="truncate text-[15px] font-medium" duration={1.8}>
                  {p.label}
                </Shimmer>
              ) : (
                <span className={cn('truncate text-[15px]', state === 'done' ? 'text-ink' : 'text-ink-3')}>{p.label}</span>
              )}
              {stats && state !== 'todo' && (
                <span className="ml-auto shrink-0 text-[13px] text-ink-3 tabular-nums">
                  {stats.found} of {stats.total}
                </span>
              )}
            </li>
          )
        })}
      </ol>

      {running && lastTool && (
        <p className="mt-4 flex min-w-0 items-center gap-2 border-t border-rule pt-3 text-[13.5px] text-ink-3">
          <span className="shrink-0 font-medium text-ink-2">Now</span>
          <span className="truncate">{lastTool.title ?? lastTool.toolName}</span>
        </p>
      )}
      {!running && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-rule pt-4">
          <p className="min-w-0 flex-1 text-[14.5px] text-ink-2">{turn.mode === 'fill' && turn.lastText ? stripMd(turn.lastText) : 'Every value below links to the line it came from.'}</p>
          {question && (
            <Button className="h-10 gap-2 rounded-full px-5 text-[14px] font-semibold" onClick={onAnswer}>
              Answer {question.items.length} questions <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      )}
    </motion.section>
  )
}

const stripMd = (s: string) => s.replace(/\*\*?([^*]+)\*\*?/g, '$1')

// ---------------------------------------------------------------------------

function SectionSummary({
  section,
  open,
  onOpenChange,
  onResolve
}: {
  section: SectionDef
  open: boolean
  onOpenChange: (open: boolean) => void
  onResolve: (fieldId: string) => void
}) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const st = sectionStats(section, fields, rates)

  return (
    <Collapsible open={open} onOpenChange={onOpenChange}>
      <CollapsibleTrigger asChild>
        <button type="button" className="group flex w-full min-w-0 items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-panel-2/60 sm:gap-4 sm:px-6">
          <span className="min-w-0">
            <span className="block text-[17px] font-semibold text-ink">{section.title}</span>
            <span className="block text-[14px] text-ink-3 tabular-nums">
              {st.found} of {st.total} found
            </span>
          </span>
          <span className="ml-auto flex shrink-0 items-center gap-3">
            {st.attention > 0 ? (
              <span className="rounded-full bg-warn-soft px-2.5 py-0.5 text-[13px] font-medium text-warn">
                {st.attention} need{st.attention === 1 ? 's' : ''} you
              </span>
            ) : st.writing ? (
              <StatusPill status="drafting" />
            ) : st.found === st.total ? (
              <span className="flex items-center gap-1 text-[13.5px] font-medium text-ok">
                <Check className="size-4" strokeWidth={2.5} /> <span className="hidden sm:inline">All found</span>
              </span>
            ) : (
              <span className="text-[13.5px] text-ink-3">Waiting</span>
            )}
            <ChevronDown className="size-5 text-ink-3 transition-transform duration-200 group-data-[state=open]:rotate-180" aria-hidden />
          </span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="overflow-hidden data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
        <ul className="divide-y divide-rule border-t border-rule bg-panel">
          {section.fields.map((id) => (
            <FoundRow key={id} fieldId={id} field={fields[id]} onResolve={onResolve} />
          ))}
          {section.hasRates && <RatesFoundRow />}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

function FoundRow({ fieldId, field, onResolve }: { fieldId: string; field: FieldState | undefined; onResolve: (fieldId: string) => void }) {
  const def = fieldDefs[fieldId]
  const wash = useJustChanged(fieldId)
  const status = field?.status ?? 'empty'
  const value = displayValue(field)
  const needs = status === 'conflict' || status === 'missing'
  const mark = needs ? (
    <Button variant="outline" className="h-8 gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold" onClick={() => onResolve(fieldId)} aria-label={`Resolve ${def.label}`}>
      Resolve <ArrowRight className="size-3.5" />
    </Button>
  ) : status === 'verified' ? (
    <span className="flex items-center text-ok" title="Found and quote checked">
      <CircleCheck className="size-[18px]" aria-hidden />
      <span className="sr-only">Found</span>
    </span>
  ) : (
    <StatusPill status={status} />
  )

  return (
    <li id={`field-${fieldId}`} className={cn('grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:px-6', wash && 'field-wash')}>
      <div className="flex min-w-0 items-center justify-between gap-3 text-[14px] text-ink-3 sm:block sm:pt-0.5">
        <span>{def.label}</span>
        <span className="shrink-0 sm:hidden">{mark}</span>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {status === 'conflict' && field?.candidates ? (
          <>
            <p className="text-[15px] text-ink">Two documents disagree.</p>
            <ul className="flex flex-col gap-2">
              {field.candidates.map((c) => (
                <li key={String(c.value)} className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-[15px] font-medium text-ink">{c.display}</span>
                  {c.sources.map((s, i) => (
                    <SourceChip key={i} source={s} />
                  ))}
                </li>
              ))}
            </ul>
          </>
        ) : status === 'missing' ? (
          <p className="text-[15px] text-ink-2">Not in any document yet.</p>
        ) : def.kind === 'narrative' ? (
          value ? (
            <div className={cn('flex flex-col gap-2 text-[15px] leading-relaxed text-ink', status === 'drafting' && 'caret')}>
              {value.split('\n\n').map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          ) : (
            <p className="text-[15px] text-ink-3">Written after you answer the questions.</p>
          )
        ) : value ? (
          <p className="text-[15px] font-medium [overflow-wrap:anywhere] text-ink">{value}</p>
        ) : (
          <p className="text-[15px] text-ink-3">Waiting</p>
        )}

        {status !== 'conflict' && field && field.sources.length > 0 && (
          <div className="flex min-w-0 flex-col gap-2">
            {def.kind !== 'narrative' && field.sources[0].quote && <Quote>{field.sources[0].quote}</Quote>}
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {dedupe(field.sources).map((s, i) => (
                <SourceChip key={i} source={s} />
              ))}
            </div>
          </div>
        )}
        {field?.note && status !== 'empty' && <p className="text-[13px] text-ink-3">{field.note}</p>}
      </div>
      <div className="hidden items-start sm:flex sm:justify-end">{mark}</div>
    </li>
  )
}

function dedupe(sources: FieldState['sources']) {
  const seen = new Set<string>()
  return sources.filter((s) => {
    const k = `${s.docId}:${where(s)}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function RatesFoundRow() {
  const rates = useApp((s) => s.rates)
  const openSource = useApp((s) => s.openSource)
  const wash = useJustChanged('hourlyRates')
  const rateMark =
    rates.status === 'verified' ? (
      <span className="flex items-center text-ok" title="Found and quote checked">
        <CircleCheck className="size-[18px]" aria-hidden />
        <span className="sr-only">Found</span>
      </span>
    ) : (
      <StatusPill status={rates.status} />
    )
  return (
    <li id="field-hourlyRates" className={cn('grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:px-6', wash && 'field-wash')}>
      <div className="flex min-w-0 items-center justify-between gap-3 text-[14px] text-ink-3 sm:block sm:pt-0.5">
        <span>Hourly rates</span>
        <span className="shrink-0 sm:hidden">{rateMark}</span>
      </div>
      <div className="min-w-0">
        {rates.rows.length ? (
          <table className="w-full max-w-[400px] text-[15px]">
            <caption className="sr-only">Hourly rates from the rate card</caption>
            <tbody>
              {rates.rows.map((r) => (
                <tr key={r.key} className="border-b border-rule last:border-b-0">
                  <th scope="row" className="py-1.5 text-left font-normal text-ink">
                    {r.role}
                  </th>
                  <td className="py-1.5 text-right font-medium text-ink tabular-nums">${r.rate}</td>
                  <td className="py-1.5 pl-4 text-right">
                    {r.source && (
                      <button
                        type="button"
                        className="rounded px-1 font-mono text-[12px] text-ink-3 hover:bg-panel-2 hover:text-ink"
                        aria-label={`Open the rate card at ${r.source.locator}`}
                        onClick={() => openSource({ docId: r.source!.docId, locator: r.source!.locator, quote: r.source!.quote })}
                      >
                        {r.source.locator?.replace(/^Rates!/, '')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-[15px] text-ink-3">Waiting</p>
        )}
        {rates.rows[0]?.source && (
          <div className="mt-2">
            <SourceChip source={{ ...rates.rows[0].source, locator: 'Rates!B2:C5', quote: '' }} />
          </div>
        )}
      </div>
      <div className="hidden items-start sm:flex sm:justify-end">{rateMark}</div>
    </li>
  )
}
