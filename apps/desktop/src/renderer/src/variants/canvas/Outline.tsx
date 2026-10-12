import { Check, CheckCheck, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { Fragment } from 'react'
import { toast } from 'sonner'
import { sections, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldStatus } from '../../../../shared/protocol'
import { statusMeta } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAgent, useOpenQuestion } from '@/lib/agent'
import { DONE, displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { RATES, draftDisplay, isItemAnswered, labelOf, statusOf, useCanvas, useDraft } from './model'

// A slim table of contents for the letter: every value with its state, in
// reading order. Selecting one scrolls the page to it and opens its card.

const idsOf = (s: SectionDef) => [...s.fields, ...(s.hasRates ? [RATES] : [])]

export function StatusDot({ status, drafted, className }: { status: FieldStatus; drafted?: boolean; className?: string }) {
  const tone: Record<FieldStatus, string> = {
    verified: 'size-2.5 border-[1.5px] border-ok',
    approved: 'size-3 bg-ok text-on-cobalt',
    user_answered: 'size-2.5 bg-cobalt',
    conflict: 'size-2.5 bg-warn',
    missing: 'size-2.5 bg-bad',
    drafting: 'size-2.5 bg-cobalt animate-pulse',
    empty: 'size-2.5 border-[1.5px] border-dashed border-ink-3'
  }
  return (
    <span className={cn('grid size-3 shrink-0 place-items-center', className)} aria-hidden>
      {drafted ? (
        <span className="grid size-2.5 place-items-center rounded-full border-[1.5px] border-cobalt">
          <span className="size-1 rounded-full bg-cobalt" />
        </span>
      ) : (
        <span className={cn('relative grid place-items-center rounded-full', tone[status])}>
          {status === 'approved' && <Check className="size-2" strokeWidth={4} />}
          {(status === 'missing' || status === 'conflict') && <span className={cn('cv-ping absolute inset-0 rounded-full', status === 'missing' ? 'bg-bad' : 'bg-warn')} />}
        </span>
      )}
    </span>
  )
}

function useItemState(id: string) {
  const { busy } = useAgent()
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const question = useOpenQuestion()
  const draft = useDraft(question)
  const status = statusOf(id, fields, rates)
  const item = question?.items.find((i) => i.fieldId === id)
  const drafted = !!item && (status === 'conflict' || status === 'missing') && isItemAnswered(item, draft[id])
  let hint: string
  let tone = 'text-ink-3'
  if (drafted) {
    hint = `${draftDisplay(item!, draft[id])} · not sent`
    tone = 'text-cobalt'
  } else if (status === 'conflict') {
    hint = `${fields[id]?.candidates?.length ?? 2} documents disagree`
    tone = 'text-warn'
  } else if (status === 'missing') {
    hint = 'Not in any document'
    tone = 'text-bad'
  } else if (status === 'drafting') {
    hint = 'Writing…'
    tone = 'text-cobalt'
  } else if (status === 'empty') {
    hint = busy ? 'Waiting for the agent' : question && fields[id]?.note ? 'After your answers' : 'Not filled yet'
  } else if (id === RATES) {
    const r = rates.rows.map((x) => x.rate)
    hint = `${r.length} roles · $${Math.min(...r)}–$${Math.max(...r)}`
  } else {
    hint = displayValue(fields[id]) ?? ''
  }
  return { status, drafted, hint, tone }
}

export function Outline({ onPick, onCollapse }: { onPick?: () => void; onCollapse?: () => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveSection = useApp((s) => s.approveSection)
  const approvable = sections.flatMap(idsOf).filter((id) => {
    const st = statusOf(id, fields, rates)
    return st === 'verified' || st === 'user_answered'
  }).length

  return (
    <nav aria-label="Letter outline" className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center justify-between pr-2 pl-4">
        <h2 className="text-[12px] font-semibold text-ink-2">Outline</h2>
        {onCollapse && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-ink-3 hover:text-ink" aria-label="Collapse outline" onClick={onCollapse}>
                <PanelLeftClose className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Collapse outline</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-width:thin]">
        {sections.map((s) => (
          <OutlineSection key={s.id} section={s} onPick={onPick} />
        ))}
      </div>
      <div className="shrink-0 border-t border-rule px-3 py-2.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-full justify-start gap-2 px-2 text-[12px] text-ink-2"
          disabled={!approvable}
          onClick={() => {
            for (const s of sections) approveSection(s.id)
            toast.success(`Approved ${approvable} value${approvable === 1 ? '' : 's'}`)
          }}
        >
          <CheckCheck className="size-4" />
          {approvable ? `Approve ${approvable} remaining value${approvable === 1 ? '' : 's'}` : 'Everything is approved'}
        </Button>
      </div>
    </nav>
  )
}

function OutlineSection({ section, onPick }: { section: SectionDef; onPick?: () => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveSection = useApp((s) => s.approveSection)
  const ids = idsOf(section)
  const statuses = ids.map((id) => statusOf(id, fields, rates))
  const done = statuses.filter((s) => DONE.includes(s)).length
  const canApprove = statuses.some((s) => s === 'verified' || s === 'user_answered')
  const allApproved = statuses.every((s) => s === 'approved')

  return (
    <section className="pt-3 first:pt-0" aria-label={section.title}>
      <div className="flex h-7 items-center gap-2 pr-1 pl-2.5">
        <h3 className="text-[11px] font-semibold tracking-[0.06em] text-ink-3 uppercase">{section.title}</h3>
        <span className="num font-mono text-[10px] text-ink-3">
          {done}/{ids.length}
        </span>
        <span className="ml-auto" />
        {allApproved ? (
          <span className="flex items-center gap-1 text-[11px] font-medium text-ok">
            <Check className="size-3" /> Approved
          </span>
        ) : canApprove ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[11px] text-ink-3 hover:text-ink"
            aria-label={`Approve the values in ${section.title}`}
            onClick={() => {
              approveSection(section.id)
              toast.success(`${section.title} approved`)
            }}
          >
            Approve
          </Button>
        ) : null}
      </div>
      <ul className="flex flex-col">
        {ids.map((id) => (
          <OutlineItem key={id} id={id} onPick={onPick} />
        ))}
      </ul>
    </section>
  )
}

function OutlineItem({ id, onPick }: { id: string; onPick?: () => void }) {
  const open = useCanvas((s) => s.open)
  const openField = useCanvas((s) => s.openField)
  const { status, drafted, hint, tone } = useItemState(id)
  const active = open?.fieldId === id
  return (
    <li>
      <button
        type="button"
        aria-current={active ? 'true' : undefined}
        aria-label={`${labelOf(id)}: ${drafted ? 'your answer, not sent' : statusMeta[status].label}. ${hint.length > 60 ? `${hint.slice(0, 60)}…` : hint}`}
        onClick={() => {
          onPick?.()
          openField(id, { scroll: true, focus: true })
        }}
        className={cn(
          'flex w-full min-w-0 items-start gap-2.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
          active ? 'bg-panel shadow-[0_0_0_1px_var(--rule)]' : 'hover:bg-panel/70'
        )}
      >
        <StatusDot status={status} drafted={drafted} className="mt-1" />
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-[13px] leading-5', active ? 'font-medium text-ink' : 'text-ink')}>{labelOf(id)}</span>
          {hint && <span className={cn('block truncate text-[12px] leading-4', tone)}>{hint}</span>}
        </span>
      </button>
    </li>
  )
}

/** Collapsed outline: one dot per value, grouped by section. */
export function Rail({ onExpand }: { onExpand: () => void }) {
  return (
    <nav aria-label="Letter outline" className="flex h-full flex-col items-center gap-1 overflow-y-auto pt-1.5 pb-4 [scrollbar-width:none]">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="mb-1 size-8 text-ink-3 hover:text-ink" aria-label="Expand outline" onClick={onExpand}>
            <PanelLeftOpen className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="right">Expand outline</TooltipContent>
      </Tooltip>
      {sections.map((s, i) => (
        <Fragment key={s.id}>
          {i > 0 && <span className="my-1 h-px w-4 bg-rule" aria-hidden />}
          {idsOf(s).map((id) => (
            <RailDot key={id} id={id} />
          ))}
        </Fragment>
      ))}
    </nav>
  )
}

function RailDot({ id }: { id: string }) {
  const open = useCanvas((s) => s.open)
  const openField = useCanvas((s) => s.openField)
  const { status, drafted, hint } = useItemState(id)
  const active = open?.fieldId === id
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`${labelOf(id)}: ${drafted ? 'your answer, not sent' : statusMeta[status].label}`}
          aria-current={active ? 'true' : undefined}
          onClick={() => openField(id, { scroll: true, focus: true })}
          className={cn('grid size-7 shrink-0 place-items-center rounded-md transition-colors', active ? 'bg-panel shadow-[0_0_0_1px_var(--rule)]' : 'hover:bg-panel/70')}
        >
          <StatusDot status={status} drafted={drafted} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="right">
        <span className="font-medium">{labelOf(id)}</span>
        {hint && <span className="opacity-70"> · {hint}</span>}
      </TooltipContent>
    </Tooltip>
  )
}
