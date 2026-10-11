import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import type { SourceRef } from '../../../../shared/protocol'
import { CitationChip } from '@/components/status'
import { cn } from '@/lib/utils'

/** A quoted line from a document with its doc/page chip (opens the source drawer). */
export function QuoteSource({ source, className, quoteClassName }: { source: SourceRef; className?: string; quoteClassName?: string }) {
  return (
    <div className={cn('flex min-w-0 flex-col items-start gap-1.5', className)}>
      <p className={cn('text-[12.5px] leading-snug text-ink-2', quoteClassName)}>“{source.quote}”</p>
      <CitationChip source={source} className="h-5 max-w-full text-[11px]" />
    </div>
  )
}

/** Small status dot; pulses while something is happening. */
export function Dot({ tone = 'cobalt', live, className }: { tone?: 'cobalt' | 'warn' | 'ok' | 'ink'; live?: boolean; className?: string }) {
  const bg = { cobalt: 'bg-cobalt', warn: 'bg-warn', ok: 'bg-ok', ink: 'bg-ink-3' }[tone]
  return (
    <span className={cn('relative inline-flex size-1.5 shrink-0', className)} aria-hidden>
      {live && <span className={cn('absolute inset-0 animate-ping rounded-full opacity-60', bg)} />}
      <span className={cn('relative inline-flex size-1.5 rounded-full', bg)} />
    </span>
  )
}

/** A thin bar that sweeps while a document is being read. */
export function SweepBar({ className }: { className?: string }) {
  const reduce = useReducedMotion()
  return (
    <span className={cn('relative block h-0.5 overflow-hidden rounded-full bg-cobalt/15', className)} aria-hidden>
      {reduce ? (
        <span className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-cobalt/70" />
      ) : (
        <motion.span
          className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-cobalt/80"
          initial={{ x: '-100%' }}
          animate={{ x: '300%' }}
          transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
        />
      )}
    </span>
  )
}

/** Column view header: an eyebrow, a title line and an optional aside. */
export function ViewHeader({ eyebrow, title, sub, aside, live }: { eyebrow: string; title: ReactNode; sub?: ReactNode; aside?: ReactNode; live?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-3">
      <div className="min-w-0">
        <p className="eyebrow flex items-center gap-1.5">
          {live && <Dot live />}
          {eyebrow}
        </p>
        <div className="mt-1 text-[15px] leading-snug font-semibold text-ink">{title}</div>
        {sub && <div className="mt-0.5 text-[12px] text-ink-3">{sub}</div>}
      </div>
      {aside}
    </div>
  )
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
