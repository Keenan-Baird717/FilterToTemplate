import { useEffect, useState, useSyncExternalStore } from 'react'
import { fieldDefs, sections } from '../../../../agent-core/demo-data'
import type { FieldState, FieldStatus, RatesState } from '../../../../shared/protocol'
import { statusMeta } from '@/components/status'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

export const RATES_ID = 'hourlyRates'

export function fieldLabel(id: string) {
  return id === RATES_ID ? 'Hourly rates' : (fieldDefs[id]?.label ?? id)
}

/** Every label a context chip can carry, longest first so matching is greedy. */
export const mentionLabels = [...Object.values(fieldDefs).map((d) => d.label), 'Hourly rates'].sort((a, b) => b.length - a.length)
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export const mentionRe = new RegExp(`@(${mentionLabels.map(escapeRe).join('|')})`, 'g')

export function shortDocName(name: string) {
  return name.replace(/\.[^.]+$/, '').replace(/_/g, ' ')
}

export function ratesDisplay(rates: RatesState) {
  if (!rates.rows.length) return null
  const vals = rates.rows.map((r) => r.rate)
  return `${rates.rows.length} roles · $${Math.min(...vals)}–$${Math.max(...vals)} / hr`
}

export function valueOf(id: string, fields: Record<string, FieldState>, rates: RatesState) {
  return id === RATES_ID ? ratesDisplay(rates) : displayValue(fields[id])
}

export function statusOf(id: string, fields: Record<string, FieldState>, rates: RatesState): FieldStatus {
  return id === RATES_ID ? rates.status : (fields[id]?.status ?? 'empty')
}

/** Field ids in template order, with the rate table after the fees fields. */
export const orderedIds = sections.flatMap((s) => (s.hasRates ? [...s.fields, RATES_ID] : s.fields))

export const NEEDS_YOU: FieldStatus[] = ['conflict', 'missing']
export const WAITING: FieldStatus[] = ['empty', 'drafting']

export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query)
      mq.addEventListener('change', cb)
      return () => mq.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false
  )
}

/** True for a moment after the field (or 'hourlyRates') changes. */
export function useWash(key: string, ms = 1600) {
  const stamp = useApp((s) => s.flash[key])
  const [wash, setWash] = useState(false)
  useEffect(() => {
    if (!stamp || Date.now() - stamp > ms) return
    setWash(true)
    const t = setTimeout(() => setWash(false), ms)
    return () => clearTimeout(t)
  }, [stamp, ms])
  return wash
}

/** Scroll `el` into view inside `scroller` only (never the page). */
export function scrollWithin(scroller: HTMLElement, el: Element, ratio = 0.3, smooth = true) {
  const top = scroller.scrollTop + (el.getBoundingClientRect().top - scroller.getBoundingClientRect().top) - scroller.clientHeight * ratio
  scroller.scrollTo({ top: Math.max(0, top), behavior: smooth ? 'smooth' : 'auto' })
}

/** The agent's mark: an iris, drawn as a ring around a pupil. */
export function IrisMark({ className, live }: { className?: string; live?: boolean }) {
  return (
    <span className={cn('inline-flex size-7 shrink-0 items-center justify-center rounded-[9px] bg-cobalt-soft text-cobalt', className)} aria-hidden>
      <svg viewBox="0 0 20 20" className="size-4">
        <circle cx="10" cy="10" r="7" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="10" cy="10" r="2.6" fill="currentColor" className={cn(live && 'chat-breathe')} style={{ transformOrigin: '10px 10px' }} />
      </svg>
    </span>
  )
}

/** One segment per field, coloured by status. */
export function SegmentBar({ statuses, className, label }: { statuses: FieldStatus[]; className?: string; label?: string }) {
  return (
    <div className={cn('flex h-1.5 min-w-0 gap-[3px]', className)} role="img" aria-label={label}>
      {statuses.map((st, i) => (
        <span key={i} className={cn('h-full min-w-[6px] flex-1 rounded-full transition-colors duration-500', statusMeta[st].bar, st === 'drafting' && 'animate-pulse')} />
      ))}
    </div>
  )
}

/** Small ring for "12 of 15". */
export function ProgressRing({ value, total, size = 18, className }: { value: number; total: number; size?: number; className?: string }) {
  const r = (size - 3) / 2
  const c = 2 * Math.PI * r
  const done = value >= total
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className={cn('shrink-0 -rotate-90', className)} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--rule)" strokeWidth="2.5" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={done ? 'var(--ok)' : 'var(--cobalt)'}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - Math.min(1, value / total))}
        style={{ transition: 'stroke-dashoffset 0.6s ease' }}
      />
    </svg>
  )
}

/** Status icon only, in its semantic colour. */
export function StatusGlyph({ status, className }: { status: FieldStatus; className?: string }) {
  const meta = statusMeta[status]
  const Icon = meta.icon
  const tone =
    status === 'verified' || status === 'approved'
      ? 'text-ok'
      : status === 'user_answered' || status === 'drafting'
        ? 'text-cobalt'
        : status === 'conflict'
          ? 'text-warn'
          : status === 'missing'
            ? 'text-bad'
            : 'text-ink-3'
  return <Icon className={cn('size-4 shrink-0', tone, status === 'drafting' && 'animate-pulse', className)} strokeWidth={2.1} aria-label={meta.label} />
}

export const statusText: Record<FieldStatus, string> = {
  verified: 'text-ok',
  approved: 'text-ok',
  user_answered: 'text-cobalt',
  drafting: 'text-cobalt',
  conflict: 'text-warn',
  missing: 'text-bad',
  empty: 'text-ink-3'
}
