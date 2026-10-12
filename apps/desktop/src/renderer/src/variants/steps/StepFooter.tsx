import type { ReactNode } from 'react'

/** Sticky action bar at the bottom of a step: what's next is always in reach. */
export function StepFooter({ hint, primary, secondary, back }: { hint?: ReactNode; primary: ReactNode; secondary?: ReactNode; back?: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 border-t border-rule bg-panel/90 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1080px] flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-8">
        {back}
        {hint && <p className="hidden min-w-0 flex-1 truncate text-[14px] text-ink-3 md:block">{hint}</p>}
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
          {secondary}
          {primary}
        </div>
      </div>
    </div>
  )
}
