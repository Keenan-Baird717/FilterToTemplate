import { Circle, CircleCheck, CircleDashed, Clock3, GitCompareArrows, LoaderCircle, UserRound, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import type { FieldStatus } from '../../../../shared/protocol'
import { cn } from '@/lib/utils'

// Small shared pieces: key caps, status icons and pills.

/** A key cap. Pass touch={false} to hide it on narrow (touch) layouts. */
export function Key({ children, className, touch }: { children: ReactNode; className?: string; touch?: boolean }) {
  return (
    <kbd
      className={cn(
        'inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-[3px] border border-rule bg-panel-2 px-1 font-mono text-[10px] leading-none font-medium text-ink-2 select-none',
        touch === false && 'max-md:hidden',
        className
      )}
    >
      {children}
    </kbd>
  )
}

/** A key cap that sits inside a solid accent button. */
export function KeyOnAccent({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[3px] bg-on-cobalt/20 px-1 font-mono text-[10px] leading-none font-medium text-on-cobalt select-none max-md:hidden">
      {children}
    </kbd>
  )
}

export const statusLook: Record<FieldStatus, { label: string; icon: LucideIcon; icon_tone: string; pill: string }> = {
  verified: { label: 'Quote matches', icon: Circle, icon_tone: 'text-ink-3', pill: 'text-ink-2 bg-panel-2' },
  user_answered: { label: 'From you', icon: UserRound, icon_tone: 'text-ink-2', pill: 'text-ink-2 bg-panel-2' },
  approved: { label: 'Approved', icon: CircleCheck, icon_tone: 'text-ok', pill: 'text-ok bg-ok-soft' },
  conflict: { label: 'Two values', icon: GitCompareArrows, icon_tone: 'text-warn', pill: 'text-warn bg-warn-soft' },
  missing: { label: 'Missing', icon: CircleDashed, icon_tone: 'text-bad', pill: 'text-bad bg-bad-soft' },
  drafting: { label: 'Agent is writing', icon: LoaderCircle, icon_tone: 'text-cobalt animate-spin', pill: 'text-cobalt bg-cobalt-soft' },
  empty: { label: 'Not filled yet', icon: Clock3, icon_tone: 'text-ink-3', pill: 'text-ink-3 bg-panel-2' }
}

export function StatusIcon({ status, className }: { status: FieldStatus; className?: string }) {
  const look = statusLook[status]
  const Icon = look.icon
  return <Icon className={cn('size-3.5 shrink-0', look.icon_tone, className)} strokeWidth={2.25} aria-hidden />
}

export function StatusPill({ status, className }: { status: FieldStatus; className?: string }) {
  const look = statusLook[status]
  const Icon = look.icon
  return (
    <span className={cn('inline-flex h-[22px] shrink-0 items-center gap-1.5 rounded-[4px] px-2 text-[12px] font-medium whitespace-nowrap', look.pill, className)}>
      <Icon className={cn('size-3.5', status === 'drafting' && 'animate-spin')} strokeWidth={2.25} aria-hidden />
      {look.label}
    </span>
  )
}

/** Short file name without the extension. */
export const shortName = (name: string) => name.replace(/\.[^.]+$/, '')
