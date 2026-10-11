import { motion } from 'motion/react'
import { fieldDefs, sections, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState, FieldStatus, RatesState, SourceRef } from '../../../../shared/protocol'
import { locatorText } from '@/components/status'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

/** A compact doc + locator chip ("D6 p.1") that opens the source drawer. */
export function SourceTag({ source, className }: { source: SourceRef; className?: string }) {
  const openSource = useApp((s) => s.openSource)
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        openSource({ docId: source.docId, page: source.page, quote: source.quote, locator: source.locator })
      }}
      title={`“${source.quote}”`}
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1 rounded border border-rule bg-panel px-1 font-mono text-[10.5px] text-ink-3 transition-colors hover:border-cobalt/40 hover:bg-cobalt-soft hover:text-ink',
        className
      )}
    >
      <span className="font-medium text-cobalt-ink">{source.docId}</span>
      <span>{locatorText(source).replace(/^Rates!/, '')}</span>
    </button>
  )
}

/** Small count pill; pops when the number changes. */
export function CountBadge({ n, tone = 'neutral', className }: { n: number; tone?: 'warn' | 'neutral' | 'cobalt'; className?: string }) {
  return (
    <motion.span
      key={n}
      initial={{ scale: 0.6, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 520, damping: 26 }}
      className={cn(
        'num inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1.5 font-mono text-[10.5px] leading-none font-semibold',
        tone === 'warn' && 'bg-warn text-panel',
        tone === 'neutral' && 'bg-panel-2 text-ink-3 ring-1 ring-rule ring-inset',
        tone === 'cobalt' && 'bg-cobalt-soft text-cobalt-ink',
        className
      )}
    >
      {n}
    </motion.span>
  )
}

/** A dot that can ping (for "the agent is reading" and "this wants you"). */
export function PulseDot({ tone = 'cobalt', ping = true, className }: { tone?: 'cobalt' | 'warn'; ping?: boolean; className?: string }) {
  return (
    <span className={cn('relative inline-flex size-2 shrink-0', className)} aria-hidden>
      {ping && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', tone === 'cobalt' ? 'bg-cobalt' : 'bg-warn')} />}
      <span className={cn('relative inline-flex size-2 rounded-full', tone === 'cobalt' ? 'bg-cobalt' : 'bg-warn')} />
    </span>
  )
}

export interface ReviewItem {
  id: string
  label: string
  status: FieldStatus
  value: string | null
  sources: SourceRef[]
  byUser: boolean
  narrative: boolean
}

/** One row per template item (fields plus the rate table), grouped by section. */
export function reviewItems(fields: Record<string, FieldState>, rates: RatesState): { section: SectionDef; items: ReviewItem[] }[] {
  return sections.map((section) => {
    const items: ReviewItem[] = section.fields.map((id) => {
      const f = fields[id]
      return {
        id,
        label: fieldDefs[id]?.label ?? id,
        status: f?.status ?? 'empty',
        value: displayValue(f),
        sources: uniqueDocs(f?.status === 'conflict' ? [] : (f?.sources ?? [])),
        byUser: f?.by === 'user',
        narrative: fieldDefs[id]?.kind === 'narrative'
      }
    })
    if (section.hasRates) {
      items.push({
        id: 'hourlyRates',
        label: 'Hourly rates',
        status: rates.status,
        value: rates.rows.length ? rates.rows.map((r) => `${r.role} $${r.rate}`).join(' · ') : null,
        sources: uniqueDocs(rates.rows.flatMap((r) => (r.source ? [r.source] : []))),
        byUser: false,
        narrative: false
      })
    }
    return { section, items }
  })
}

function uniqueDocs(sources: SourceRef[]) {
  const seen = new Set<string>()
  return sources.filter((s) => {
    if (seen.has(s.docId)) return false
    seen.add(s.docId)
    return true
  })
}

export const isReady = (s: FieldStatus) => s === 'verified' || s === 'user_answered'
export const isOpen = (s: FieldStatus) => s === 'conflict' || s === 'missing'
