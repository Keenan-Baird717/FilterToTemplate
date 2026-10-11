import {
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  Clock3,
  GitCompareArrows,
  PenLine,
  UserRoundCheck,
  type LucideIcon
} from 'lucide-react'
import { documents } from '../../../agent-core/demo-data'
import type { FieldStatus, SourceRef } from '../../../shared/protocol'
import { cn } from '@/lib/utils'
import { useApp } from '@/lib/store'

export const statusMeta: Record<FieldStatus, { label: string; icon: LucideIcon; tone: string; bar: string }> = {
  verified: { label: 'Verified', icon: CircleCheck, tone: 'text-ok bg-ok-soft', bar: 'bg-ok' },
  approved: { label: 'Approved', icon: BadgeCheck, tone: 'text-on-cobalt bg-ok', bar: 'bg-ok' },
  user_answered: { label: 'From you', icon: UserRoundCheck, tone: 'text-cobalt-ink bg-cobalt-soft', bar: 'bg-cobalt' },
  conflict: { label: 'Conflict', icon: GitCompareArrows, tone: 'text-warn bg-warn-soft', bar: 'bg-warn' },
  missing: { label: 'Missing', icon: CircleDashed, tone: 'text-bad bg-bad-soft', bar: 'bg-bad' },
  drafting: { label: 'Writing', icon: PenLine, tone: 'text-cobalt-ink bg-cobalt-soft', bar: 'bg-cobalt/50' },
  empty: { label: 'Waiting', icon: Clock3, tone: 'text-ink-3 bg-panel-2', bar: 'bg-rule' }
}

export function StatusChip({ status, className }: { status: FieldStatus; className?: string }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2.5 pl-2 text-[12px] font-medium whitespace-nowrap',
        meta.tone,
        status === 'drafting' && 'animate-pulse',
        className
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
      {meta.label}
    </span>
  )
}

export const docById = (id: string) => documents.find((d) => d.id === id)

const kindStyle = {
  pdf: 'text-bad border-bad/30',
  docx: 'text-cobalt-ink border-cobalt/30',
  xlsx: 'text-ok border-ok/30',
  eml: 'text-warn border-warn/30'
} as const

export function DocBadge({ kind, className }: { kind: keyof typeof kindStyle; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] w-10 shrink-0 items-center justify-center rounded-[4px] border font-mono text-[10px] font-medium tracking-wide uppercase',
        kindStyle[kind],
        className
      )}
    >
      {kind}
    </span>
  )
}

export function locatorText(source: SourceRef) {
  if (source.page) return `p.${source.page}`
  return source.locator ?? ''
}

export function CitationChip({ source, className }: { source: SourceRef; className?: string }) {
  const openSource = useApp((s) => s.openSource)
  const doc = useApp((s) => s.docs.find((d) => d.id === source.docId))
  const name = doc?.name.replace(/\.[^.]+$/, '') ?? source.docId
  return (
    <button
      type="button"
      data-doc-id={source.docId}
      onClick={() => openSource({ docId: source.docId, page: source.page, quote: source.quote, locator: source.locator })}
      title={`“${source.quote}”`}
      className={cn(
        'group/cite inline-flex h-6 max-w-full min-w-0 items-center gap-1.5 rounded-md border border-rule bg-panel px-1.5 text-[12px] text-ink-2 transition-colors hover:border-cobalt/40 hover:bg-cobalt-soft hover:text-ink',
        className
      )}
    >
      <span className="font-mono text-[11px] font-medium text-cobalt-ink">{source.docId}</span>
      <span className="truncate">{name}</span>
      <span className="font-mono text-[11px] text-ink-3 group-hover/cite:text-ink-2">{locatorText(source)}</span>
    </button>
  )
}
