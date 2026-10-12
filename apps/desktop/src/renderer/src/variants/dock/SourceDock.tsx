import { ChevronUp, Pin, PinOff, Plus, Upload } from 'lucide-react'
import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { DocCard, DocChip, ReadingDot, orderDocs, useDockActivity, type DockActivity } from './docs'
import { shortName, useDock } from './model'

const PIN_KEY = 'ftt-dock-pinned'
const HOVER_IN_MS = 260
const HOVER_OUT_MS = 380
/** How long the dock stays up after the agent stops reading. */
const FOLD_MS = 2600

function readPin() {
  try {
    return localStorage.getItem(PIN_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Sources as a dock along the bottom of the Fields pane. A slim bar of
 * document chips; it rises into a filmstrip of document cards when hovered,
 * pinned, opened, or on its own while the agent reads and cites documents.
 */
export function SourceDock({ onAddFiles }: { onAddFiles: () => void }) {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const openDocId = useApp((s) => s.source?.docId)
  const hoverDoc = useDock((s) => s.hoverDoc)
  const cites = useMemo(() => citationsByDoc(fields, rates), [fields, rates])
  const act = useDockActivity()
  const reduce = useReducedMotion()

  const [pinned, setPinnedState] = useState(readPin)
  const [hover, setHover] = useState(false)
  const [manual, setManual] = useState(false)
  const [peek, setPeek] = useState(false)
  const [muted, setMuted] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const rootRef = useRef<HTMLDivElement>(null)
  const chipsRef = useRef<HTMLDivElement>(null)
  const stripRef = useRef<HTMLDivElement>(null)

  const setPinned = (v: boolean) => {
    setPinnedState(v)
    try {
      localStorage.setItem(PIN_KEY, v ? '1' : '0')
    } catch {
      /* storage unavailable: the pin lasts for this session */
    }
  }

  // Peek while the agent reads or cites; fold back a moment after it stops.
  useEffect(() => {
    if (act.active) {
      setPeek(true)
      return
    }
    const t = setTimeout(() => {
      setPeek(false)
      setMuted(false)
      chipsRef.current?.scrollTo({ left: 0, behavior: 'smooth' })
    }, FOLD_MS)
    return () => clearTimeout(t)
  }, [act.active])

  // Opened from the toggle: closes on a click elsewhere.
  useEffect(() => {
    if (!manual) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (rootRef.current?.contains(t)) return
      if (t?.closest('[role="dialog"]')) return
      setManual(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [manual])

  useEffect(() => () => clearTimeout(hoverTimer.current), [])

  const expanded = pinned || manual || hover || (peek && !muted)

  // Keep the chip for a hovered citation (or a document being read) in view inside the bar.
  const focusDoc = hoverDoc ?? [...act.reading][0] ?? null
  useEffect(() => {
    if (!focusDoc) return
    for (const box of [chipsRef.current, stripRef.current]) {
      const el = box?.querySelector<HTMLElement>(`[data-doc="${CSS.escape(focusDoc)}"]`)
      if (!box || !el) continue
      const l = el.offsetLeft - box.offsetLeft
      if (l < box.scrollLeft + 8 || l + el.offsetWidth > box.scrollLeft + box.clientWidth - 8) {
        box.scrollTo({ left: Math.max(0, l - 24), behavior: reduce ? 'auto' : 'smooth' })
      }
    }
  }, [focusDoc, expanded, reduce])

  const collapse = () => {
    clearTimeout(hoverTimer.current)
    setManual(false)
    setHover(false)
    if (pinned) setPinned(false)
    if (peek) setMuted(true)
  }

  const ordered = orderDocs(docs, act)
  const stateOf = (id: string) => ({
    cites: cites[id] ?? [],
    reading: act.reading.has(id),
    recentAt: act.busy && !act.reading.has(id) ? act.recent.get(id) : undefined,
    pointed: hoverDoc === id,
    open: openDocId === id
  })

  return (
    <div
      ref={rootRef}
      role="region"
      aria-label="Sources"
      className="relative z-20 flex shrink-0 flex-col"
      onMouseEnter={() => {
        clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(() => setHover(true), HOVER_IN_MS)
      }}
      onMouseLeave={() => {
        clearTimeout(hoverTimer.current)
        hoverTimer.current = setTimeout(() => setHover(false), HOVER_OUT_MS)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && expanded && !pinned) {
          e.stopPropagation()
          collapse()
        }
      }}
    >
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="filmstrip"
            id="dock-filmstrip"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: [0.2, 0.8, 0.2, 1] }}
            className={cn('overflow-hidden border-t border-rule bg-ground', pinned ? 'relative' : 'absolute inset-x-0 bottom-full shadow-[var(--dock-lift)]')}
          >
            <div ref={stripRef} className="dock-strip flex gap-3 overflow-x-auto px-4 pt-3 pb-3">
              <LayoutGroup>
                {ordered.map((d) => (
                  <motion.div key={d.id} layout={reduce ? false : 'position'} transition={{ type: 'spring', stiffness: 520, damping: 42 }} className="shrink-0">
                    <DocCard doc={d} {...stateOf(d.id)} />
                  </motion.div>
                ))}
              </LayoutGroup>
              <button
                type="button"
                onClick={onAddFiles}
                className="flex h-[180px] w-[150px] shrink-0 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-ink-3/40 px-3 text-center text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:bg-panel"
              >
                <Upload className="size-4 text-ink-3" />
                Add files
                <span className="text-[11px] text-ink-3">or drop them anywhere</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex h-11 items-center gap-2 border-t border-rule bg-ground pr-3 pl-2">
        <button
          type="button"
          onClick={() => (expanded ? collapse() : setManual(true))}
          aria-expanded={expanded}
          aria-controls="dock-filmstrip"
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[12px] font-semibold text-ink transition-colors hover:bg-panel"
        >
          <ChevronUp className={cn('size-3.5 text-ink-3 transition-transform duration-200', expanded && 'rotate-180')} />
          Sources
          <span className="num font-normal text-ink-3">· {docs.length}</span>
        </button>
        <span className="h-4 w-px shrink-0 bg-rule" aria-hidden />
        <div ref={chipsRef} className="dock-chips relative flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto py-1">
          {docs.map((d) => (
            <DocChip key={d.id} doc={d} {...stateOf(d.id)} />
          ))}
        </div>
        <ActivityLabel act={act} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn('size-7 shrink-0', pinned ? 'bg-cobalt-soft text-cobalt-ink hover:bg-cobalt-soft' : 'text-ink-3')}
              aria-pressed={pinned}
              aria-label={pinned ? 'Let the sources fold away' : 'Keep the sources open'}
              onClick={() => setPinned(!pinned)}
            >
              {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{pinned ? 'Let the sources fold away' : 'Keep the sources open'}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 shrink-0 gap-1 px-2 text-[12px]" onClick={onAddFiles}>
              <Plus className="size-3.5" /> Add files
            </Button>
          </TooltipTrigger>
          <TooltipContent>Or drop files anywhere in the window</TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}

function ActivityLabel({ act }: { act: DockActivity }) {
  const docs = useApp((s) => s.docs)
  let label: string | null = null
  const short = act.parsing.length ? 'Parsing' : 'Reading'
  if (act.parsing.length === 1) label = `Parsing ${shortName(act.parsing[0].name)} · ${act.parsing[0].progress ?? 0}%`
  else if (act.parsing.length > 1) label = `Parsing ${act.parsing.length} files`
  else if (act.reading.size === 1) {
    const d = docs.find((x) => x.id === [...act.reading][0])
    label = `Reading ${d ? shortName(d.name) : 'a document'}`
  } else if (act.reading.size > 1) label = `Reading ${act.reading.size} documents`

  return (
    <AnimatePresence initial={false}>
      {label && (
        <motion.span
          key="activity"
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          className="flex max-w-[220px] shrink-0 items-center gap-1.5 text-[12px] text-cobalt-ink"
          role="status"
        >
          <ReadingDot />
          <span className="hidden truncate xl:inline">{label}</span>
          <span className="xl:hidden">{short}</span>
        </motion.span>
      )}
    </AnimatePresence>
  )
}
