import { Check, CornerDownRight } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { useDropzone } from 'react-dropzone'
import { useLiveSources, useOpenQuestion, useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Dot, plural } from './bits'
import { NeedsView } from './NeedsView'
import { ReviewView } from './ReviewView'
import { SourcesView } from './SourcesView'
import { liveItems, useColumn, viewLabel, viewOrder, type Phase, type View } from './state'

/** The left column: its content follows the job (reading, questions, writing, review). */
export function ContextColumn() {
  const view = useColumn((s) => s.view)
  const pick = useColumn((s) => s.pick)
  const addFiles = useApp((s) => s.addFiles)
  const reduce = useReducedMotion()

  // Direction of travel between views, for a subtle slide.
  const index = viewOrder.indexOf(view)
  const prev = useRef(index)
  const dir = index === prev.current ? 0 : index > prev.current ? 1 : -1
  useEffect(() => {
    prev.current = index
  }, [index])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (!files.length) return
      addFiles(files.map((f) => ({ name: f.name })))
      pick('sources')
    }
  })

  return (
    <aside {...getRootProps({ role: 'complementary', className: 'relative flex h-full min-h-0 flex-col bg-ground' })} aria-label="Context">
      <input {...getInputProps({ id: 'source-files' })} />
      <div className="shrink-0 px-4 pt-3 lg:px-3">
        <Segmented />
        <SwitchNotice />
      </div>
      <div id="phases-panel" role="tabpanel" aria-labelledby={`phases-tab-${view}`} className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence initial={false} custom={dir}>
          <motion.div
            key={view}
            className="absolute inset-0 flex flex-col"
            initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir * 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir * -10 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          >
            {view === 'sources' ? <SourcesView openFiles={open} /> : view === 'needs' ? <NeedsView /> : <ReviewView />}
          </motion.div>
        </AnimatePresence>
      </div>
      {isDragActive && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-cobalt bg-cobalt-soft/90 text-[13px] font-medium text-cobalt-ink">
          Drop to add to this project
        </div>
      )}
    </aside>
  )
}

/** Sources · Needs you · Review. Always lets the user switch by hand. */
function Segmented() {
  const view = useColumn((s) => s.view)
  const phase = useColumn((s) => s.phase)
  const pick = useColumn((s) => s.pick)
  const fields = useApp((s) => s.fields)
  const open = useOpenQuestion()
  const pending = liveItems(open, fields).length
  const { counts, total } = useSummary()
  const allApproved = counts.approved === total
  const live = useLiveSources()
  const refs = useRef<Record<string, HTMLButtonElement | null>>({})

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const i = viewOrder.indexOf(view)
    const next =
      e.key === 'Home' ? 0 : e.key === 'End' ? viewOrder.length - 1 : (i + (e.key === 'ArrowRight' ? 1 : -1) + viewOrder.length) % viewOrder.length
    pick(viewOrder[next])
    refs.current[viewOrder[next]]?.focus()
  }

  const marker: Record<View, ReactNode> = {
    sources: phase === 'reading' || live.reading.size > 0 ? <Dot live /> : null,
    needs:
      phase === 'writing' ? (
        <Dot live />
      ) : pending ? (
        <span className="num grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 font-mono text-[10px] leading-none font-semibold text-on-cobalt">{pending}</span>
      ) : null,
    review: allApproved ? <Check className="size-3.5 text-ok" strokeWidth={2.5} /> : null
  }

  return (
    <div role="tablist" aria-label="Left column" className="flex gap-0.5 rounded-lg border border-rule bg-panel-2 p-0.5" onKeyDown={onKey}>
      {viewOrder.map((v) => {
        const selected = view === v
        return (
          <button
            key={v}
            ref={(el) => {
              refs.current[v] = el
            }}
            id={`phases-tab-${v}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls="phases-panel"
            tabIndex={selected ? 0 : -1}
            onClick={() => pick(v)}
            className={cn(
              'relative flex h-7 flex-1 items-center justify-center gap-1.5 rounded-md px-1.5 text-[12.5px] font-medium whitespace-nowrap transition-colors',
              selected ? 'text-ink' : 'text-ink-3 hover:text-ink-2'
            )}
          >
            {selected && (
              <motion.span
                layoutId="phases-seg"
                className="absolute inset-0 rounded-md bg-panel shadow-[0_0_0_1px_var(--rule),0_1px_2px_rgb(16_24_40/0.06)]"
                transition={{ type: 'spring', stiffness: 520, damping: 40 }}
              />
            )}
            <span className="relative">{viewLabel[v]}</span>
            {marker[v] && <span className="relative flex items-center">{marker[v]}</span>}
          </button>
        )
      })}
    </div>
  )
}

const reasonFor: Record<Phase, (n: number) => string> = {
  reading: () => 'the agent is reading',
  needs: (n) => (n ? `${plural(n, 'answer')} needed` : 'the agent has a question'),
  writing: () => 'applying your answers',
  review: () => 'nothing needs you'
}

/** A short inline label when the column switches itself, so the change is never a surprise. */
function SwitchNotice() {
  const notice = useColumn((s) => s.notice)
  const clear = useColumn((s) => s.clearNotice)
  const pick = useColumn((s) => s.pick)
  const fields = useApp((s) => s.fields)
  const open = useOpenQuestion()
  const n = liveItems(open, fields).length

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(clear, 4500)
    return () => clearTimeout(t)
  }, [notice, clear])

  return (
    <div aria-live="polite" aria-atomic>
      <AnimatePresence initial={false}>
        {notice && (
          <motion.div
            key={notice.at}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="flex items-center gap-1.5 pt-2 pl-1 text-[12px] text-ink-3">
              <CornerDownRight className="size-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium text-ink-2">Switched to {viewLabel[notice.view]}</span> · {reasonFor[notice.phase](n)}
              </span>
              <button
                type="button"
                onClick={() => pick(notice.from)}
                className="shrink-0 rounded-sm px-1 font-medium text-cobalt-ink hover:underline"
                aria-label={`Undo: go back to ${viewLabel[notice.from]}`}
              >
                Undo
              </button>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
