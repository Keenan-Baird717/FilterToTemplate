import { Bot, UserRound } from 'lucide-react'
import type { FieldStatus, SourceRef } from '../../../../shared/protocol'
import { Checkbox } from '@/components/ui/checkbox'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { locatorText, statusMeta } from '@/components/status'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

// Small, quiet pieces the sheet, inspector and header share.

/** Compact checkbox whose mixed state shows a dash rather than a check. */
export function GridCheckbox({ className, ...props }: React.ComponentProps<typeof Checkbox>) {
  return (
    <Checkbox
      {...props}
      className={cn(
        'grid size-3.5 place-items-center rounded-[3px] border-ink-3/50 bg-panel [&_svg]:size-3',
        "data-[state=indeterminate]:border-cobalt data-[state=indeterminate]:bg-cobalt data-[state=indeterminate]:after:h-[1.5px] data-[state=indeterminate]:after:w-2 data-[state=indeterminate]:after:rounded-full data-[state=indeterminate]:after:bg-on-cobalt data-[state=indeterminate]:after:content-[''] data-[state=indeterminate]:[&>span]:hidden",
        className
      )}
    />
  )
}

const statusText: Record<FieldStatus, string> = {
  verified: 'text-ink-2',
  approved: 'text-ok font-medium',
  user_answered: 'text-ink-2',
  conflict: 'text-warn font-medium',
  missing: 'text-bad font-medium',
  drafting: 'text-cobalt',
  empty: 'text-ink-3'
}

const statusIcon: Record<FieldStatus, string> = {
  verified: 'text-ok',
  approved: 'text-ok',
  user_answered: 'text-cobalt',
  conflict: 'text-warn',
  missing: 'text-bad',
  drafting: 'text-cobalt animate-pulse',
  empty: 'text-ink-3'
}

export function StatusLabel({ status, className }: { status: FieldStatus; className?: string }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-1.5 text-[12px] whitespace-nowrap', statusText[status], className)}>
      <Icon className={cn('size-3.5 shrink-0', statusIcon[status])} strokeWidth={2.25} aria-hidden />
      {meta.label}
    </span>
  )
}

/** Segment fill per status, for progress maps. */
export const segmentTone: Record<FieldStatus, string> = {
  approved: 'bg-ok',
  verified: 'bg-ok/45',
  user_answered: 'bg-cobalt/70',
  drafting: 'bg-cobalt/40 animate-pulse',
  conflict: 'bg-warn',
  missing: 'bg-bad',
  empty: 'bg-rule'
}

export function Segments({ statuses, className, size = 'sm' }: { statuses: FieldStatus[]; className?: string; size?: 'sm' | 'md' }) {
  return (
    <span className={cn('flex items-center gap-[2px]', className)} aria-hidden>
      {statuses.map((s, i) => (
        <span key={i} className={cn('rounded-[1px] transition-colors duration-500', size === 'sm' ? 'h-2 w-1.5' : 'h-2.5 w-2', segmentTone[s])} />
      ))}
    </span>
  )
}

/** Doc id + page as a compact mono chip; opens the shared source drawer. */
export function SourceRefButton({ source, className, long }: { source: SourceRef; className?: string; long?: boolean }) {
  const openSource = useApp((s) => s.openSource)
  const doc = useApp((s) => s.docs.find((d) => d.id === source.docId))
  const loc = locatorText(source).replace(/^Rates!/, '')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            openSource({ docId: source.docId, page: source.page, quote: source.quote, locator: source.locator })
          }}
          aria-label={`Open ${doc?.name ?? source.docId} ${locatorText(source)}`}
          className={cn(
            'inline-flex h-[22px] max-w-full min-w-0 shrink-0 items-center gap-1 rounded-[4px] border border-rule bg-panel px-1.5 font-mono text-[11px] leading-none transition-colors hover:border-cobalt/50 hover:bg-cobalt-soft',
            className
          )}
        >
          <span className="font-medium text-cobalt">{source.docId}</span>
          {long && doc && <span className="truncate font-sans text-[12px] text-ink-2">{doc.name}</span>}
          {loc && <span className="truncate text-ink-3">{loc === 'Message body' ? 'msg' : loc}</span>}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px]">
        <span className="font-medium">{doc?.name ?? source.docId}</span>
        <span className="block opacity-80">“{source.quote}”</span>
      </TooltipContent>
    </Tooltip>
  )
}

export function ByLabel({ by, className }: { by: 'agent' | 'user' | null; className?: string }) {
  if (!by) return <span className={cn('text-ink-3', className)}>–</span>
  const Icon = by === 'user' ? UserRound : Bot
  return (
    <span className={cn('inline-flex items-center gap-1 text-[12px]', by === 'user' ? 'text-ink' : 'text-ink-2', className)}>
      <Icon className="size-3.5 text-ink-3" aria-hidden />
      {by === 'user' ? 'You' : 'Agent'}
    </span>
  )
}
