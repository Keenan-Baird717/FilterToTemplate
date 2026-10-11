import type { DynamicToolUIPart } from 'ai'
import {
  BadgeCheck,
  CircleCheck,
  CircleDashed,
  Clock3,
  FileSpreadsheet,
  FileText,
  GitCompareArrows,
  Mail,
  PenLine,
  UserRound,
  type LucideIcon
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DocKind, SectionDef } from '../../../../agent-core/demo-data'
import type { AppUIMessage, FieldState, FieldStatus, QuestionSet, RatesState, SourceRef } from '../../../../shared/protocol'
import { EvidencePage } from '@/components/EvidencePage'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { questionsIn, useAgent } from '@/lib/agent'
import { DONE, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

export type StepId = 1 | 2 | 3 | 4

export const stepNames: Record<StepId, string> = {
  1: 'Add documents',
  2: 'Check what we found',
  3: 'Answer questions',
  4: 'Review and export'
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

export function sectionStats(section: SectionDef, fields: Record<string, FieldState>, rates: RatesState) {
  const statuses: FieldStatus[] = [...section.fields.map((id) => fields[id]?.status ?? 'empty'), ...(section.hasRates ? [rates.status] : [])]
  const found = statuses.filter((s) => DONE.includes(s)).length
  const attention = statuses.filter((s) => s === 'conflict' || s === 'missing').length
  const approved = statuses.filter((s) => s === 'approved').length
  return {
    total: statuses.length,
    found,
    attention,
    approved,
    approvable: statuses.some((s) => s === 'verified' || s === 'user_answered'),
    allApproved: approved === statuses.length,
    writing: statuses.some((s) => s === 'drafting')
  }
}

export type TurnMode = 'fill' | 'answer' | 'chat'

/** What the agent is doing in the newest turn, and that turn's assistant message. */
export function useLatestTurn() {
  const { messages, busy, status } = useAgent()
  return useMemo(() => {
    let userIdx = -1
    for (let i = messages.length - 1; i >= 0; i--)
      if (messages[i].role === 'user') {
        userIdx = i
        break
      }
    const user = messages[userIdx]
    const mode: TurnMode = user?.metadata?.command === 'run-fill' ? 'fill' : user?.metadata?.answer ? 'answer' : 'chat'
    const reply: AppUIMessage | undefined = messages.slice(userIdx + 1).find((m) => m.role === 'assistant')
    const tools = (reply?.parts ?? []).filter((p): p is DynamicToolUIPart => p.type === 'dynamic-tool')
    const texts = (reply?.parts ?? []).flatMap((p) => (p.type === 'text' ? [p.text] : []))
    return { mode, busy, status, reply, tools, lastText: texts[texts.length - 1] ?? '', answerId: user?.metadata?.answer?.questionId }
  }, [messages, busy, status])
}

/**
 * The open question set: the newest one asked since the last fresh run, if it
 * hasn't been answered or skipped. Older sets are superseded, so skipping the
 * newest never brings an earlier one back (unlike the shared useOpenQuestion).
 */
export function useCurrentQuestion(): QuestionSet | null {
  const { messages } = useAgent()
  const answered = useApp((s) => s.answered)
  return useMemo(() => {
    let from = 0
    for (let i = messages.length - 1; i >= 0; i--)
      if (messages[i].role === 'user' && messages[i].metadata?.command === 'run-fill') {
        from = i
        break
      }
    const all = questionsIn(messages.slice(from))
    const last = all[all.length - 1]
    return last && !answered[last.id] ? last : null
  }, [messages, answered])
}

/** True for ~1.4s after the store marks a field as just changed. */
export function useJustChanged(key: string) {
  const stamp = useApp((s) => s.flash[key])
  const [on, setOn] = useState(false)
  useEffect(() => {
    if (!stamp || Date.now() - stamp > 1400) return
    setOn(true)
    const t = setTimeout(() => setOn(false), 1400)
    return () => clearTimeout(t)
  }, [stamp])
  return on
}

export function shortDocName(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function where(source: SourceRef) {
  if (source.page) return `p.${source.page}`
  return source.locator ?? ''
}

// ---------------------------------------------------------------------------
// Small presentational pieces
// ---------------------------------------------------------------------------

const pill: Record<FieldStatus, { label: string; icon: LucideIcon; cls: string }> = {
  verified: { label: 'Found', icon: CircleCheck, cls: 'bg-ok-soft text-ok' },
  approved: { label: 'Approved', icon: BadgeCheck, cls: 'bg-ok text-panel' },
  user_answered: { label: 'From you', icon: UserRound, cls: 'bg-cobalt-soft text-ink' },
  conflict: { label: 'Two values', icon: GitCompareArrows, cls: 'bg-warn-soft text-warn' },
  missing: { label: 'Missing', icon: CircleDashed, cls: 'bg-bad-soft text-bad' },
  drafting: { label: 'Writing', icon: PenLine, cls: 'bg-cobalt-soft text-ink' },
  empty: { label: 'Waiting', icon: Clock3, cls: 'bg-panel-2 text-ink-3' }
}

export function StatusPill({ status, className }: { status: FieldStatus; className?: string }) {
  const meta = pill[status]
  const Icon = meta.icon
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full pr-2.5 pl-2 text-[12.5px] font-medium whitespace-nowrap',
        meta.cls,
        status === 'drafting' && 'animate-pulse',
        className
      )}
    >
      <Icon className="size-3.5" strokeWidth={2.25} aria-hidden />
      {meta.label}
    </span>
  )
}

const kindIcon: Record<DocKind, LucideIcon> = { pdf: FileText, docx: FileText, xlsx: FileSpreadsheet, eml: Mail }
const kindLabel: Record<DocKind, string> = { pdf: 'PDF', docx: 'Word', xlsx: 'Excel', eml: 'Email' }

export function DocTile({ kind, className }: { kind: DocKind; className?: string }) {
  const Icon = kindIcon[kind]
  return (
    <span className={cn('flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg bg-panel-2 text-ink-2', className)} aria-hidden>
      <Icon className="size-4" strokeWidth={1.75} />
      <span className="font-mono text-[9px] leading-none font-medium tracking-wide text-ink-3 uppercase">{kind}</span>
    </span>
  )
}

export { kindLabel }

/** Source reference: hover to peek at the page, click to open the document. */
export function SourceChip({ source, className, onPaper }: { source: SourceRef; className?: string; onPaper?: boolean }) {
  const openSource = useApp((s) => s.openSource)
  const doc = useApp((s) => s.docs.find((d) => d.id === source.docId))
  const name = doc ? shortDocName(doc.name) : source.docId
  return (
    <HoverCard openDelay={350} closeDelay={80}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          onClick={() => openSource({ docId: source.docId, page: source.page, quote: source.quote, locator: source.locator })}
          aria-label={`Open ${name} ${where(source)}`}
          className={cn(
            'inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-full border pr-2.5 pl-2 text-[13px] transition-colors',
            onPaper
              ? 'border-paper-rule bg-paper text-paper-ink/75 hover:border-paper-ink/30 hover:text-paper-ink'
              : 'border-rule bg-panel text-ink-2 hover:border-ink-3/50 hover:bg-panel-2 hover:text-ink',
            className
          )}
        >
          {doc && (() => {
            const Icon = kindIcon[doc.kind]
            return <Icon className={cn('size-3.5 shrink-0', onPaper ? 'text-paper-ink/50' : 'text-ink-3')} aria-hidden />
          })()}
          <span className="truncate">{name}</span>
          <span className={cn('shrink-0 font-mono text-[11.5px]', onPaper ? 'text-paper-ink/55' : 'text-ink-3')}>{where(source)}</span>
        </button>
      </HoverCardTrigger>
      <HoverCardContent side="top" align="start" className="w-[360px] rounded-xl border-rule bg-panel-2 p-3">
        <EvidencePage docId={source.docId} page={source.page} quote={source.quote} locator={source.locator} compact />
      </HoverCardContent>
    </HoverCard>
  )
}

/** The cited words, set off as a quotation. */
export function Quote({ children, className }: { children: ReactNode; className?: string }) {
  return <q className={cn('text-[14px] leading-relaxed text-ink-2 [quotes:"“"_"”"]', className)}>{children}</q>
}

export function StepIntro({ step, title, children, aside }: { step: StepId; title: string; children?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div className="max-w-[640px] min-w-0">
        <p className="text-[13px] font-medium text-ink-3">Step {step} of 4</p>
        <h1 className="steps-display mt-1.5 text-[28px] leading-[1.15] text-ink sm:text-[34px]">{title}</h1>
        {children && <div className="mt-2.5 text-[16px] leading-relaxed text-ink-2">{children}</div>}
      </div>
      {aside}
    </div>
  )
}
