import { Check, ChevronLeft, ChevronRight, CircleCheck, Download, FileText, ListChecks, Pencil, Undo2 } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { questionsIn, useAgent, useSummary } from '@/lib/agent'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { exportLetter, type Stage } from './Fields'
import { ApplyingLine, askAbout, DoneLine, QuestionTray, usePhaseController, useQuestionState } from './NeedsYouTray'
import { canEditInPlace, labelOf, review, sectionOf, useReview, type ReviewItem, type ReviewModel } from './review'
import { useTray } from './state'

const ease = [0.22, 1, 0.36, 1] as const

/** Which stage of the job the tray is on. */
export function useStage(model: ReviewModel): Stage {
  const { question, skipped, pending } = useQuestionState()
  const phase = useTray((s) => s.phase)
  const { busy } = useAgent()
  const asking = !!question && !skipped && pending.length > 0
  if (asking || phase !== 'idle') return 'questions'
  if (busy && model.items.some((i) => i.status === 'empty' || i.status === 'drafting')) return 'working'
  if (model.toReview > 0) return 'review'
  if (model.items.some((i) => i.reviewable)) return 'ready'
  return 'working'
}

/**
 * The one "what's next for you" surface, pinned under the progress strip:
 * questions, then a review pass over every value, then export.
 * Hidden only while the agent fills the letter from scratch.
 */
export function JobTray({ stage, model }: { stage: Stage; model: ReviewModel }) {
  const { question, skipped, pending } = useQuestionState()
  const { busy } = useAgent()
  const phase = useTray((s) => s.phase)
  const expanded = useTray((s) => s.expanded)
  const foldTray = useTray((s) => s.foldTray)

  usePhaseController(busy)

  const asking = !!question && !skipped && pending.length > 0
  useEffect(() => {
    if (!asking && expanded) foldTray()
  }, [asking, expanded, foldTray])

  // Review mode only makes sense while there's something to review.
  useEffect(() => {
    if (stage !== 'review' && useReview.getState().active) review.leave()
  }, [stage])

  const key = stage === 'questions' ? `questions-${phase}` : stage

  return (
    <AnimatePresence initial={false}>
      {stage !== 'working' && (
        <motion.div
          key="tray"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease }}
          className="shrink-0 overflow-clip"
        >
          <div className="border-b border-rule">
            <motion.div key={key} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.22 }}>
              {stage === 'questions' ? (
                phase === 'applying' ? (
                  <ApplyingLine />
                ) : phase === 'done' ? (
                  <DoneLine />
                ) : question ? (
                  <QuestionTray question={question} pending={pending} busy={busy} />
                ) : null
              ) : stage === 'review' ? (
                <ReviewStrip model={model} />
              ) : (
                <ReadyBar model={model} />
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function K({ children, onPrimary }: { children: ReactNode; onPrimary?: boolean }) {
  return (
    <Kbd className={cn('hidden h-[18px] min-w-[18px] px-1 text-[10px] sm:pointer-fine:inline-flex', onPrimary ? 'bg-on-cobalt/15 text-on-cobalt' : 'bg-panel-2 text-ink-3')}>
      {children}
    </Kbd>
  )
}

// ---------------------------------------------------------------------------
// Stage 2: review
// ---------------------------------------------------------------------------

function ReviewStrip({ model }: { model: ReviewModel }) {
  const active = useReview((s) => s.active)
  const cursor = useReview((s) => s.cursor)
  const dropped = useReview((s) => s.dropped)
  const { question, skipped } = useQuestionState()
  const startRef = useRef<HTMLButtonElement>(null)
  const regionRef = useRef<HTMLDivElement>(null)
  const wasActive = useRef(active)

  const n = model.toReview
  const item = model.queue.find((i) => i.id === cursor)
  const pos = item ? model.queue.indexOf(item) + 1 : 0
  const changed = Object.keys(dropped).filter((id) => model.queue.some((i) => i.id === id && !i.approved))
  const resumable = !!item && !active && model.approved > 0
  const leftovers = model.leftovers.filter((i) => i.status === 'missing' || i.status === 'conflict')

  // Leaving review hands focus back to the button that resumes it.
  useEffect(() => {
    if (wasActive.current && !active) {
      const el = document.activeElement
      if (!el || el === document.body || regionRef.current?.contains(el)) startRef.current?.focus({ preventScroll: true })
    }
    wasActive.current = active
  }, [active])

  return (
    <div ref={regionRef} role="region" aria-label="Review">
      <div className={cn('flex min-h-11 flex-wrap items-center gap-x-4 gap-y-1.5 px-5 py-1.5 transition-colors sm:px-6', active ? 'bg-cobalt-soft/55' : 'bg-cobalt-soft/30')}>
        <div className="flex min-w-0 items-center gap-2.5 text-[13px]">
          {changed.length && !active ? (
            <Undo2 className="size-4 shrink-0 text-warn" aria-hidden />
          ) : (
            <ListChecks className="size-4 shrink-0 text-cobalt-ink" aria-hidden />
          )}
          {active ? (
            <p className="num min-w-0 truncate">
              <span className="font-medium text-ink">
                Value {pos} of {model.queue.length}
              </span>
              <span className="text-ink-3"> · {model.approved} approved</span>
            </p>
          ) : changed.length ? (
            <p className="min-w-0 text-ink-2">
              <span className="font-medium text-ink">{labelOf(changed[0])}</span> changed after you approved it
              {changed.length > 1 && <span className="text-ink-3"> (and {changed.length - 1} more)</span>}
            </p>
          ) : (
            <p className="num min-w-0 truncate">
              <span className="font-medium text-ink">
                Review {n} value{n === 1 ? '' : 's'}
              </span>
              <span className="text-ink-3"> · {model.approved} approved</span>
            </p>
          )}
        </div>

        <SectionTicks model={model} cursor={cursor} active={active} className="order-last basis-full pb-1 sm:order-none sm:basis-auto sm:pb-0 md:min-w-[180px] md:flex-1" />

        <div className="ml-auto flex shrink-0 items-center gap-2 sm:ml-0">
          {active ? (
            <Button type="button" variant="ghost" size="sm" className="-mr-2 h-8 gap-2 px-2.5 text-[12px] text-ink-2 sm:mr-0" onClick={review.leave}>
              Leave review <K>Esc</K>
            </Button>
          ) : (
            <Button
              ref={startRef}
              type="button"
              size="sm"
              className="h-8 gap-1.5 px-3 text-[12px]"
              onClick={() => review.start(changed[0])}
              title={resumable && item ? `Picks up at ${item.label}` : undefined}
            >
              {changed.length ? 'Review it again' : resumable ? 'Resume review' : 'Start review'}
              <ChevronRight className="size-3.5" />
            </Button>
          )}
        </div>
      </div>

      {!active && leftovers.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 border-t border-rule bg-panel px-5 py-1.5 text-[12px] text-ink-2 sm:px-6">
          <span className="size-1.5 rounded-full bg-warn" aria-hidden />
          <span>
            {leftovers.map((i) => i.label).join(' and ')} still {leftovers.length === 1 ? 'needs' : 'need'} you.
          </span>
          <button
            type="button"
            onClick={() => fixLeftover(leftovers[0], question, !!skipped)}
            className="font-medium text-cobalt-ink underline-offset-2 hover:underline"
          >
            {question ? 'Answer now' : 'Add it'}
          </button>
        </p>
      )}

      <AnimatePresence initial={false}>{active && item && <ReviewControls key="controls" model={model} item={item} />}</AnimatePresence>

      <p className="sr-only" aria-live="polite">
        {active && item ? `${item.label}, ${pos} of ${model.queue.length}${item.approved ? ', approved' : ''}` : ''}
      </p>
    </div>
  )
}

function fixLeftover(item: ReviewItem, question: ReturnType<typeof useQuestionState>['question'], skipped: boolean) {
  if (question && question.items.some((q) => q.fieldId === item.id)) return askAbout(item.id, question, skipped)
  useApp.getState().focusField(item.id)
  if (canEditInPlace(item.id)) review.edit(item.id)
}

/** Every value as a tick, grouped by section. Click a tick to jump to that value. */
function SectionTicks({ model, cursor, active, className }: { model: ReviewModel; cursor: string | null; active: boolean; className?: string }) {
  const dropped = useReview((s) => s.dropped)
  const summary = model.bySection.map((b) => `${b.section.title} ${b.items.filter((i) => i.approved).length} of ${b.items.length} approved`).join(', ')
  return (
    <div className={cn('flex min-w-0 items-center gap-2.5', className)} role="img" aria-label={summary}>
      {model.bySection.map(({ section, items }) => {
        const done = items.filter((i) => i.approved).length
        return (
          <Tooltip key={section.id}>
            <TooltipTrigger asChild>
              <div className="flex h-4 min-w-0 items-center gap-[3px]" style={{ flex: `${items.length} 1 0` }}>
                {items.map((it) => {
                  const here = it.id === cursor
                  return (
                    <span
                      key={it.id}
                      onClick={it.inQueue ? () => review.start(it.id) : undefined}
                      className={cn(
                        'h-1.5 min-w-1 flex-1 rounded-full transition-[height,background-color] duration-300',
                        here && active
                          ? 'h-3 bg-cobalt'
                          : dropped[it.id] && !it.approved
                            ? 'bg-warn'
                            : it.approved
                              ? 'bg-ok'
                              : here
                                ? 'bg-cobalt/55'
                                : it.skipped
                                  ? 'bg-transparent shadow-[inset_0_0_0_1px_var(--ink-3)]'
                                  : it.reviewable
                                    ? 'bg-ink-3/35'
                                    : it.status === 'missing' || it.status === 'conflict'
                                      ? 'bg-warn/45'
                                      : 'bg-rule',
                        it.inQueue && !here && 'cursor-pointer hover:opacity-70'
                      )}
                    />
                  )
                })}
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {section.title} · {done} of {items.length} approved
            </TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

function ReviewControls({ model, item }: { model: ReviewModel; item: ReviewItem }) {
  const notice = useReview((s) => s.notice)
  const primaryRef = useRef<HTMLButtonElement>(null)
  const section = sectionOf(item.id)
  const rest = model.queue.filter((i) => i.sectionId === section?.id && !i.approved)
  const editable = canEditInPlace(item.id)
  const cursor = item.id

  // Starting review puts the keyboard on Approve.
  useEffect(() => {
    const t = setTimeout(() => primaryRef.current?.focus({ preventScroll: true }), 60)
    return () => clearTimeout(t)
  }, [])

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.22, ease }}
      className="overflow-clip"
    >
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-t border-cobalt/15 bg-panel px-5 py-2.5 sm:px-6">
        {item.approved ? (
          <>
            <Button
              ref={primaryRef}
              data-review-primary
              type="button"
              size="sm"
              variant="secondary"
              aria-disabled
              className="h-8 flex-1 cursor-default gap-1.5 px-3 text-[12px] text-ok hover:bg-secondary sm:flex-none"
            >
              <Check className="size-3.5" strokeWidth={2.5} /> Approved
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-8 px-2.5 text-[12px] text-ink-2" onClick={review.undoApproval}>
              Undo approval
            </Button>
          </>
        ) : (
          <Button ref={primaryRef} data-review-primary type="button" size="sm" className="h-8 flex-1 gap-1.5 px-3 text-[12px] sm:flex-none" onClick={review.approve}>
            <Check className="size-3.5" strokeWidth={2.5} /> Approve <K onPrimary>A</K>
          </Button>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button type="button" size="sm" variant="outline" className="h-8 gap-1.5 px-2.5 text-[12px]" onClick={() => review.edit()}>
              <Pencil className="size-3.5" /> Edit <K>E</K>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{editable ? 'Retype this value' : 'Tell the agent what to change'}</TooltipContent>
        </Tooltip>
        {!item.approved && (
          <Button type="button" size="sm" variant="ghost" className="h-8 gap-2 px-2.5 text-[12px] text-ink-2" onClick={review.skip}>
            Skip <K>S</K>
          </Button>
        )}
        <span className="mx-1 hidden h-5 w-px bg-rule sm:block" aria-hidden />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="Previous value"
              aria-keyshortcuts="K ArrowLeft"
              disabled={!review.canStep(model, cursor, -1)}
              onClick={() => review.step(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Previous <span className="ml-1 opacity-70">K or ←</span>
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="size-8"
              aria-label="Next value"
              aria-keyshortcuts="J ArrowRight"
              disabled={!review.canStep(model, cursor, 1)}
              onClick={() => review.step(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            Next <span className="ml-1 opacity-70">J or →</span>
          </TooltipContent>
        </Tooltip>

        <div className="flex min-w-0 basis-full flex-wrap items-center justify-between gap-x-3 gap-y-1 empty:hidden sm:ml-auto sm:basis-auto sm:justify-end">
          <AnimatePresence initial={false}>
            {notice && (
              <motion.span key={notice} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-[12px] text-ink-3">
                {notice}
              </motion.span>
            )}
          </AnimatePresence>
          {section && rest.length > 1 && (
            <Button type="button" size="sm" variant="ghost" className="h-8 gap-2 px-2.5 text-[12px] text-ink-2" onClick={review.approveRestOfSection}>
              Approve rest of {section.title} <span className="num text-ink-3">({rest.length})</span>
              <K>⇧A</K>
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Stage 3: ready
// ---------------------------------------------------------------------------

function ReadyBar({ model }: { model: ReviewModel }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const answered = useApp((s) => s.answered)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const { messages } = useAgent()
  const { done } = useSummary()
  const { question, skipped } = useQuestionState()

  const stats = useMemo(() => {
    const docs = Object.keys(citationsByDoc(fields, rates)).length
    const fromAnswers = new Set<string>()
    for (const q of questionsIn(messages)) {
      const a = answered[q.id]
      if (!a || a === 'skipped') continue
      for (const [id, v] of Object.entries(a)) if (v?.trim() && fields[id]?.by === 'user') fromAnswers.add(id)
    }
    const edited = Object.values(fields).filter((f) => f.by === 'user' && f.note?.startsWith('Edited')).length
    return { docs, answered: fromAnswers.size, edited }
  }, [fields, rates, answered, messages])

  const blanks = model.leftovers.filter((i) => i.status === 'missing' || i.status === 'conflict')
  const parts = [
    `${done} value${done === 1 ? '' : 's'}`,
    `${stats.docs} document${stats.docs === 1 ? '' : 's'} cited`,
    stats.answered ? `${stats.answered} answered by you` : null,
    stats.edited ? `${stats.edited} edited by you` : null
  ].filter(Boolean)

  return (
    <div role="region" aria-label="Ready to export">
      <div className="flex min-h-12 flex-wrap items-center gap-x-4 gap-y-2 bg-ok-soft/50 px-5 py-2 sm:px-6">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="flex items-center gap-2 self-center text-[13px] font-medium text-ink">
            <motion.span initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 18 }}>
              <CircleCheck className="size-4 text-ok" strokeWidth={2.25} aria-hidden />
            </motion.span>
            {blanks.length ? 'Ready to export with a blank' : 'Ready to export'}
          </span>
          <span className="num min-w-0 text-[12px] text-ink-2">{parts.join(' · ')}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5 px-2.5 text-[12px]" onClick={() => setView(view === 'preview' ? 'fields' : 'preview')}>
            {view === 'preview' ? (
              <>
                <ListChecks className="size-3.5" /> Show the fields
              </>
            ) : (
              <>
                <FileText className="size-3.5" /> Preview the letter
              </>
            )}
          </Button>
          <Button type="button" size="sm" className="h-8 gap-1.5 px-3 text-[12px]" onClick={exportLetter}>
            <Download className="size-3.5" /> Export .docx
          </Button>
        </div>
      </div>
      {blanks.length > 0 && (
        <p className="flex flex-wrap items-center gap-x-2 border-t border-rule bg-panel px-5 py-1.5 text-[12px] text-ink-2 sm:px-6">
          <span className="size-1.5 rounded-full bg-warn" aria-hidden />
          <span>
            {blanks.map((i) => i.label).join(' and ')} {blanks.length === 1 ? 'is' : 'are'} blank, so the letter shows a placeholder.
          </span>
          <button
            type="button"
            onClick={() => fixLeftover(blanks[0], question, !!skipped)}
            className="font-medium text-cobalt-ink underline-offset-2 hover:underline"
          >
            {question ? 'Answer now' : 'Add it'}
          </button>
        </p>
      )}
    </div>
  )
}
