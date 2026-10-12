import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { stepNames, type StepId } from './parts'

export type StepState = 'done' | 'attention' | 'todo'

export interface StepInfo {
  id: StepId
  state: StepState
  hint: string
}

const ids: StepId[] = [1, 2, 3, 4]

/** Four clickable steps; collapses to "Step 3 of 4" with arrows on narrow screens. */
export function Stepper({ steps, current, onSelect }: { steps: Record<StepId, StepInfo>; current: StepId; onSelect: (id: StepId) => void }) {
  return (
    <>
      <nav aria-label="Steps" className="hidden min-w-0 flex-1 md:block">
        <ol className="flex items-center gap-2 lg:gap-3">
          {ids.map((id, i) => {
            const s = steps[id]
            const active = id === current
            return (
              <li key={id} className={cn('flex min-w-0 items-center gap-2 lg:gap-3', i < ids.length - 1 && 'flex-1')}>
                <button
                  type="button"
                  onClick={() => onSelect(id)}
                  aria-current={active ? 'step' : undefined}
                  className={cn(
                    'group flex min-w-0 shrink-0 items-center gap-2.5 rounded-xl py-1.5 pr-3 pl-1.5 text-left transition-colors',
                    active ? 'bg-panel shadow-[0_0_0_1px_var(--rule)]' : 'hover:bg-panel/60'
                  )}
                >
                  <StepDot id={id} state={s.state} active={active} />
                  <span className="min-w-0">
                    <span className={cn('block truncate text-[14px] leading-tight font-semibold', active ? 'text-ink' : 'text-ink-2 group-hover:text-ink')}>
                      {stepNames[id]}
                    </span>
                    <span className={cn('hidden truncate text-[12.5px] leading-tight lg:block', s.state === 'attention' ? 'text-warn' : 'text-ink-3')}>
                      {s.hint}
                    </span>
                    {s.state !== 'todo' && <span className="sr-only lg:hidden">, {s.state === 'done' ? 'done' : 'needs you'}</span>}
                  </span>
                </button>
                {i < ids.length - 1 && (
                  <span className={cn('h-px min-w-3 flex-1 rounded-full', s.state === 'done' ? 'bg-ink-3/50' : 'bg-rule')} aria-hidden />
                )}
              </li>
            )
          })}
        </ol>
      </nav>

      {/* Narrow: one line, with arrows to move between steps. */}
      <nav aria-label="Steps" className="flex min-w-0 flex-1 items-center gap-2 md:hidden">
        <button
          type="button"
          onClick={() => current > 1 && onSelect((current - 1) as StepId)}
          disabled={current === 1}
          aria-label="Previous step"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-panel disabled:opacity-30"
        >
          <ChevronLeft className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-tight text-ink-3">
            Step {current} of 4
            {steps[current].hint && <span className={cn(steps[current].state === 'attention' && 'text-warn')}> · {steps[current].hint}</span>}
          </p>
          <p className="truncate text-[15px] leading-tight font-semibold text-ink">{stepNames[current]}</p>
          <div className="mt-1.5 flex gap-1" aria-hidden>
            {ids.map((id) => (
              <span
                key={id}
                className={cn(
                  'h-1 flex-1 rounded-full',
                  id === current ? 'bg-cobalt' : steps[id].state === 'done' ? 'bg-ink-3/60' : steps[id].state === 'attention' ? 'bg-warn/60' : 'bg-rule'
                )}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={() => current < 4 && onSelect((current + 1) as StepId)}
          disabled={current === 4}
          aria-label="Next step"
          className="flex size-9 shrink-0 items-center justify-center rounded-full text-ink-2 hover:bg-panel disabled:opacity-30"
        >
          <ChevronRight className="size-5" />
        </button>
      </nav>
    </>
  )
}

function StepDot({ id, state, active }: { id: StepId; state: StepState; active: boolean }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-full text-[13px] font-semibold tabular-nums transition-colors',
        active
          ? 'bg-cobalt text-on-cobalt'
          : state === 'done'
            ? 'bg-ok-soft text-ok'
            : state === 'attention'
              ? 'bg-warn-soft text-warn'
              : 'border border-rule bg-panel text-ink-3'
      )}
      aria-hidden
    >
      {state === 'done' && !active ? <Check className="size-4" strokeWidth={2.5} /> : id}
    </span>
  )
}
