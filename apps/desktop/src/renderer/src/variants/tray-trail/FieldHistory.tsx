import { Bot, Clock3, Undo2, UserRound } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { SourceRef } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { CitationChip } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useMediaQuery } from './state'
import { ago, clockTime, labelOf, restoreField, useFieldHistory, useNow, useTrail, type TrailEvent } from './trail'

/** "New" next to a value that changed while you weren't looking. */
export function NewMark({ fieldId, className }: { fieldId: string; className?: string }) {
  const isNew = useTrail((s) => fieldId in s.newFields)
  return (
    <AnimatePresence initial={false}>
      {isNew && (
        <motion.span
          key="new"
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.35 } }}
          transition={{ duration: 0.2 }}
          className={cn(
            'inline-flex h-[18px] shrink-0 items-center gap-1 rounded-full bg-cobalt-soft pr-1.5 pl-1 align-[1px] text-[10px] font-semibold tracking-wide text-cobalt-ink uppercase',
            className
          )}
          title="Changed while you were away"
        >
          <span className="size-1.5 rounded-full bg-cobalt" aria-hidden />
          New
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/** The small clock under a row's status: opens that value's history. */
export function HistoryButton({ fieldId, status }: { fieldId: string; status?: string }) {
  const history = useFieldHistory(fieldId)
  const now = useNow(30_000)
  const phone = useMediaQuery('(max-width: 639px)')
  const [open, setOpen] = useState(false)
  if (!history.length) return null
  const n = history.length
  const label = labelOf(fieldId)
  const live = history[0].live
  // Only say more than the clock when there's something to look at: your
  // own changes, or a value that changed from an earlier one.
  const notable = history.some((e) => e.actor === 'you' || (e.kind === 'set' && !!e.prev))
  const text = live ? 'Writing' : notable && status !== 'empty' ? `${n} changes` : null

  const trigger = (
    <button
      type="button"
      data-history-trigger
      aria-label={`History of ${label}: ${n} change${n === 1 ? '' : 's'}, last ${ago(history[0].at, now)}`}
      title={text ? undefined : `History · ${ago(history[0].at, now)}`}
      className={cn(
        'no-drag inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[11px] whitespace-nowrap text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink-2 data-[state=open]:bg-panel-2 data-[state=open]:text-ink',
        history[0].actor === 'you' && !live && 'text-ink-2'
      )}
    >
      <Clock3 className="size-3 shrink-0" aria-hidden />
      {text && <span className="num">{text}</span>}
    </button>
  )

  if (phone) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent side="bottom" className="max-h-[78vh] gap-0 rounded-t-xl border-rule bg-panel p-0">
          <SheetHeader className="border-b border-rule px-4 pt-4 pb-3">
            <SheetTitle className="text-[15px]">{label}</SheetTitle>
            <SheetDescription className="text-[12px]">
              History · {n === 1 ? '1 change' : `${n} changes, newest first`}
            </SheetDescription>
          </SheetHeader>
          <div className="min-h-0 overflow-y-auto px-4 pt-3.5 pb-6">
            <HistoryList fieldId={fieldId} events={history} now={now} onDone={() => setOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} collisionPadding={12} className="w-[340px] border-rule p-0">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule px-4 pt-3 pb-2.5">
          <p className="min-w-0 truncate text-[13px] font-semibold text-ink">{label}</p>
          <p className="num shrink-0 text-[11px] text-ink-3">
            {n} change{n === 1 ? '' : 's'}
          </p>
        </div>
        <div className="max-h-[min(420px,60vh)] overflow-y-auto px-4 pt-3 pb-3.5">
          <HistoryList fieldId={fieldId} events={history} now={now} onDone={() => setOpen(false)} />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function useCurrent(fieldId: string) {
  const field = useApp((s) => (fieldId === 'hourlyRates' ? undefined : s.fields[fieldId]))
  const rates = useApp((s) => s.rates)
  if (fieldId === 'hourlyRates') return { status: rates.status, value: rates.rows.length ? `${rates.rows.length} roles` : null }
  return { status: field?.status ?? 'empty', value: displayValue(field) }
}

function HistoryList({ fieldId, events, now, onDone }: { fieldId: string; events: TrailEvent[]; now: number; onDone: () => void }) {
  const current = useCurrent(fieldId)
  const label = labelOf(fieldId)

  // What can be undone: your latest edit (while it's still the value) and the latest approval.
  const latestValue = events.find((e) => e.kind !== 'approve' && e.kind !== 'unapprove')
  const undoEdit = latestValue?.kind === 'edit' && latestValue.prevField && current.value === (latestValue.value ?? null) ? latestValue : null
  const latestApproval = events.find((e) => e.kind === 'approve' || e.kind === 'unapprove')
  const undoApproval = latestApproval?.kind === 'approve' && current.status === 'approved' ? latestApproval : null

  return (
    <ol className="flex flex-col" aria-label={`History of ${label}`}>
      {events.map((e, i) => (
        <li key={e.id} className="relative grid grid-cols-[20px_minmax(0,1fr)] gap-x-2.5 pb-4 last:pb-0">
          {i < events.length - 1 && <span className="absolute top-6 bottom-1 left-[9.5px] w-px bg-rule" aria-hidden />}
          <ActorBadge actor={e.actor} />
          <div className="min-w-0">
            <p className="text-[12px] leading-5 text-ink-2">
              <span className="font-medium text-ink">{e.actor === 'you' ? 'You' : 'Agent'}</span> {historyVerb(e)}{' '}
              <time className="text-ink-3" dateTime={new Date(e.at).toISOString()} title={clockTime(e.at)}>
                · {ago(e.at, now)}
              </time>
            </p>
            <ValueLine e={e} />
            {e.sources && e.sources.length > 0 && e.kind !== 'clear' && (
              <div className="mt-1.5 flex min-w-0 flex-col items-start gap-1">
                {e.kind === 'missing' && <span className="text-[11px] text-ink-3">Closest mention</span>}
                {dedupe(e.sources).map((s, k) => (
                  <CitationChip key={k} source={s} className="h-5 max-w-full text-[11px]" />
                ))}
              </div>
            )}
            {e === undoEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 gap-1.5 px-2.5 text-[12px]"
                onClick={() => {
                  restoreField(fieldId, e.prevField!)
                  toast(`Restored ${label}`, { description: e.prev ? `Back to ${e.prev}` : undefined })
                  onDone()
                }}
              >
                <Undo2 className="size-3.5" /> Undo my edit
              </Button>
            )}
            {e === undoApproval && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 h-7 gap-1.5 px-2.5 text-[12px]"
                onClick={() => {
                  useApp.getState().unapproveField(fieldId)
                  toast(`${label} is no longer approved`)
                  onDone()
                }}
              >
                <Undo2 className="size-3.5" /> Undo approval
              </Button>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}

export function ActorBadge({ actor, className }: { actor: 'agent' | 'you'; className?: string }) {
  const Icon = actor === 'you' ? UserRound : Bot
  return (
    <span
      className={cn(
        'relative flex size-5 items-center justify-center rounded-full',
        actor === 'you' ? 'bg-cobalt-soft text-cobalt-ink' : 'bg-panel-2 text-ink-3 shadow-[inset_0_0_0_1px_var(--rule)]',
        className
      )}
      aria-hidden
    >
      <Icon className="size-3" strokeWidth={2.25} />
    </span>
  )
}

function historyVerb(e: TrailEvent): ReactNode {
  switch (e.kind) {
    case 'set':
      return e.verb === 'wrote' ? 'wrote it' : e.prev ? 'changed it' : 'set it'
    case 'draft':
      return e.live ? <Shimmer as="span" className="text-[12px]" duration={1.6}>is writing it</Shimmer> : 'started writing it'
    case 'flag':
      return 'found two values'
    case 'missing':
      return 'found no value'
    case 'clear':
      return 'cleared it to start over'
    case 'answer':
      return e.verb === 'chose' ? 'chose' : 'answered'
    case 'edit':
      return e.value == null ? 'cleared it' : e.prevField || e.prev ? 'edited it' : 'set it'
    case 'restore':
      return 'undid the edit'
    case 'approve':
      return 'approved it'
    case 'unapprove':
      return 'undid the approval'
    default:
      return ''
  }
}

function ValueLine({ e }: { e: TrailEvent }) {
  if (e.kind === 'approve' || e.kind === 'unapprove' || e.kind === 'missing' || e.kind === 'draft') return null
  const value = e.kind === 'clear' ? null : e.value
  const prev = e.prev
  if (!value && !prev) return null
  const long = (value?.length ?? 0) > 90
  return (
    <p className="mt-0.5 text-[13px] leading-snug break-words text-ink">
      {value && <span className={cn(long && 'line-clamp-3')}>{value}</span>}
      {value && prev && ' '}
      {prev && (
        <del className="text-ink-3 decoration-ink-3/70" aria-label={`was ${prev}`}>
          {prev.length > 90 ? `${prev.slice(0, 88)}…` : prev}
        </del>
      )}
    </p>
  )
}

function dedupe(sources: SourceRef[]) {
  const seen = new Set<string>()
  return sources.filter((s) => {
    const k = `${s.docId}:${s.page ?? s.locator}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
