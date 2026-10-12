import { HardDrive, PanelLeftClose, PanelLeftOpen, Pin, Plus, Upload, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDropzone } from 'react-dropzone'
import type { DemoDocument } from '../../../../agent-core/demo-data'
import { DocBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useLiveSources } from '@/lib/agent'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { isTypingTarget, useTray } from './state'

const parserLabel = {
  'text-layer': 'Text layer',
  ocr: 'OCR',
  word: 'Word',
  sheet: 'Sheet',
  email: 'Email'
} as const

const ease = [0.22, 1, 0.36, 1] as const

/** Everything that makes a document "in play" right now. */
export function useDocSignals() {
  const live = useLiveSources()
  const hoverDoc = useTray((s) => s.hoverDoc)
  const activeDoc = useApp((s) => s.source?.docId ?? null)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const cites = useMemo(() => citationsByDoc(fields, rates), [fields, rates])
  return { live, hoverDoc, activeDoc, cites }
}
type Signals = ReturnType<typeof useDocSignals>

function useSourceDrop() {
  const addFiles = useApp((s) => s.addFiles)
  return useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (files.length) addFiles(files.map((f) => ({ name: f.name })))
    }
  })
}
type Drop = ReturnType<typeof useSourceDrop>

function docMeta(d: DemoDocument) {
  return `${d.kind === 'xlsx' ? '1 sheet' : d.kind === 'eml' ? '1 message' : `${d.pages} pages`} · ${parserLabel[d.parser]}`
}

function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex size-1.5 shrink-0', className)} aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-cobalt opacity-70" />
      <span className="relative size-1.5 rounded-full bg-cobalt" />
    </span>
  )
}

// ---------------------------------------------------------------------------
// The full list (overlay, pinned column and the phone tab share it)
// ---------------------------------------------------------------------------

function SourcesList({
  s,
  drop,
  actions,
  onPick,
  listRef,
  compact,
  inset
}: {
  s: Signals
  drop: Drop
  actions?: ReactNode
  onPick?: () => void
  listRef?: React.Ref<HTMLUListElement>
  compact?: boolean
  /** Phones: room under the footer for the floating composer. */
  inset?: boolean
}) {
  const docs = useApp((st) => st.docs)
  const pages = docs.reduce((n, d) => n + d.pages, 0)
  const readingCount = docs.filter((d) => s.live.reading.has(d.id)).length

  return (
    <div className={cn('flex h-full min-h-0 flex-col bg-ground', inset && 'pb-[68px]')}>
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-2">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">Sources</h2>
          {readingCount > 0 ? (
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-cobalt-ink" aria-live="polite">
              <LiveDot /> Agent is reading {readingCount}
            </p>
          ) : (
            <p className="num text-[12px] text-ink-3">
              {docs.length} files · {pages} pages
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button variant="ghost" size="icon" className="size-8" onClick={drop.open} aria-label="Add documents">
            <Plus className="size-4" />
          </Button>
          {actions}
        </div>
      </div>

      {!compact && (
        <button
          type="button"
          onClick={drop.open}
          className="mx-3 mb-2 flex items-center gap-2.5 rounded-lg border border-dashed border-ink-3/40 px-3 py-2.5 text-left text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:bg-panel"
        >
          <Upload className="size-4 shrink-0 text-ink-3" />
          <span>
            Drop PDFs, Word, Excel or email
            <span className="block text-ink-3">Parsed on this device</span>
          </span>
        </button>
      )}

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <ul ref={listRef} className="flex flex-col gap-px px-2 pb-3">
          {docs.map((d) => (
            <DocRow key={d.id} d={d} s={s} onPick={onPick} />
          ))}
        </ul>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t border-rule px-4 py-2.5 text-[11px] text-ink-3">
        <HardDrive className="size-3.5 shrink-0" />
        <span className="truncate">Stored locally · projects/acme/project.db</span>
      </div>
    </div>
  )
}

function DocRow({ d, s, onPick }: { d: DemoDocument; s: Signals; onPick?: () => void }) {
  const openSource = useApp((st) => st.openSource)
  const reading = s.live.reading.has(d.id)
  const recentAt = s.live.recent.get(d.id)
  const pointed = s.hoverDoc === d.id || s.activeDoc === d.id
  const count = s.cites[d.id]?.length ?? 0
  const parsing = d.status === 'parsing'

  return (
    <li>
      <button
        type="button"
        data-doc={d.id}
        disabled={parsing}
        onClick={() => {
          openSource({ docId: d.id, page: d.content[0]?.n })
          onPick?.()
        }}
        className={cn(
          'relative flex w-full min-w-0 items-start gap-2.5 overflow-hidden rounded-md px-2 py-2 text-left transition-[background-color,box-shadow] duration-300',
          reading ? 'focus-reading bg-cobalt-soft/70' : pointed ? 'bg-panel shadow-[0_0_0_1px_var(--cobalt)]' : 'hover:bg-panel/70',
          parsing && 'cursor-default'
        )}
      >
        {recentAt && !reading && <span key={recentAt} className="focus-cite-flash pointer-events-none absolute inset-0" aria-hidden />}
        <DocBadge kind={d.kind} className="relative mt-px" />
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">{d.name}</span>
          {parsing ? (
            <span className="mt-1 flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-rule">
                <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${d.progress ?? 0}%` }} />
              </span>
              <span className="num font-mono text-[10px] text-ink-3">{d.parser === 'ocr' ? 'OCR' : 'Parsing'}</span>
            </span>
          ) : reading ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-cobalt-ink">
              <LiveDot /> Reading
            </span>
          ) : recentAt && Date.now() - recentAt < 2200 ? (
            <span className="block text-[11px] font-medium text-ok">Just cited</span>
          ) : (
            <span className="num block text-[11px] text-ink-3">{docMeta(d)}</span>
          )}
        </span>
        {count > 0 && (
          <span
            key={`${count}`}
            className={cn(
              'num relative mt-0.5 rounded-full px-1.5 font-mono text-[10px] leading-[18px]',
              recentAt ? 'focus-count-pop bg-ok-soft text-ok' : 'bg-cobalt-soft text-cobalt-ink'
            )}
            title={`Cited ${count} times`}
          >
            {count}
          </span>
        )}
      </button>
    </li>
  )
}

// ---------------------------------------------------------------------------
// The rail and its overlay
// ---------------------------------------------------------------------------

function RailItem({ d, s }: { d: DemoDocument; s: Signals }) {
  const openSource = useApp((st) => st.openSource)
  const reading = s.live.reading.has(d.id)
  const recentAt = s.live.recent.get(d.id)
  const pointed = s.hoverDoc === d.id || s.activeDoc === d.id
  const count = s.cites[d.id]?.length ?? 0
  const parsing = d.status === 'parsing'
  const label = `${d.name}${parsing ? ', parsing' : ''}${reading ? ', being read by the agent' : ''}${count ? `, cited ${count} time${count === 1 ? '' : 's'}` : ''}`

  return (
    <li>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-doc={d.id}
            aria-label={label}
            disabled={parsing}
            onClick={() => openSource({ docId: d.id, page: d.content[0]?.n })}
            className={cn(
              'relative flex w-12 flex-col items-center gap-1 rounded-md pt-2 pb-1.5 transition-[background-color,box-shadow] duration-300',
              reading ? 'focus-reading bg-cobalt-soft' : pointed ? 'bg-panel shadow-[0_0_0_1px_var(--cobalt)]' : 'hover:bg-panel',
              parsing && 'cursor-default'
            )}
          >
            {recentAt && !reading && <span key={recentAt} className="focus-cite-flash pointer-events-none absolute inset-0 rounded-md" aria-hidden />}
            <span className="relative">
              <DocBadge kind={d.kind} className="h-4 w-9 text-[9px]" />
              {count > 0 && (
                <span
                  key={`${count}`}
                  className={cn(
                    'num absolute -top-1.5 -right-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full px-0.5 font-mono text-[9px] leading-none ring-2 ring-ground',
                    recentAt
                      ? 'focus-count-pop bg-ok-soft text-ok shadow-[inset_0_0_0_1px_var(--ok)]'
                      : 'bg-panel text-cobalt-ink shadow-[inset_0_0_0_1px_var(--rule)]'
                  )}
                  aria-hidden
                >
                  {count}
                </span>
              )}
            </span>
            {parsing ? (
              <span className="relative mt-0.5 h-0.5 w-8 overflow-hidden rounded-full bg-rule" aria-hidden>
                <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${d.progress ?? 0}%` }} />
              </span>
            ) : (
              <span className={cn('relative text-[10px] leading-none', reading ? 'font-medium text-cobalt-ink' : 'font-mono text-ink-3')} aria-hidden>
                {reading ? 'Reading' : d.id}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{d.name}</TooltipContent>
      </Tooltip>
    </li>
  )
}

type OverlayMode = 'hover' | 'click' | 'peek' | null

/** Desktop: a 56px rail that slides the full list out over the fields, or a pinned column. */
export function SourcesDock({ folded, onUnfold, quiet }: { folded: boolean; onUnfold?: () => void; quiet?: boolean }) {
  const s = useDocSignals()
  const drop = useSourceDrop()
  const pinned = useTray((st) => st.pinned)
  const setPinned = useTray((st) => st.setPinned)

  if (!folded) {
    return (
      <aside {...drop.getRootProps({ className: 'relative h-full min-h-0 border-r border-rule' })} aria-label="Sources">
        <input {...drop.getInputProps({ id: 'source-files' })} />
        <SourcesList
          s={s}
          drop={drop}
          actions={
            pinned ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8" onClick={() => setPinned(false)} aria-label="Fold sources into a rail">
                    <PanelLeftClose className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Fold into a rail</TooltipContent>
              </Tooltip>
            ) : onUnfold ? (
              <Button variant="ghost" size="icon" className="size-8" onClick={onUnfold} aria-label="Fold sources into a rail">
                <PanelLeftClose className="size-4" />
              </Button>
            ) : null
          }
        />
        {drop.isDragActive && <DropHint />}
      </aside>
    )
  }
  return <RailDock s={s} drop={drop} quiet={!!quiet} />
}

function DropHint({ wide }: { wide?: boolean }) {
  return (
    <div
      className={cn(
        'absolute inset-y-2 left-2 z-40 flex items-center justify-center rounded-xl border-2 border-dashed border-cobalt bg-cobalt-soft/95 px-4 text-center text-[13px] font-medium text-cobalt-ink',
        wide ? 'w-[256px]' : 'right-2'
      )}
    >
      Drop to add to this project
    </div>
  )
}

function RailDock({ s, drop, quiet }: { s: Signals; drop: Drop; quiet: boolean }) {
  const docs = useApp((st) => st.docs)
  const setPinned = useTray((st) => st.setPinned)
  const [mode, setMode] = useState<OverlayMode>(null)
  const modeRef = useRef<OverlayMode>(null)
  modeRef.current = mode
  const rootRef = useRef<HTMLDivElement | null>(null)
  const expandRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const timers = useRef<{ enter?: number; leave?: number; peek?: number }>({})
  const suppressPeek = useRef(false)
  const focusListOnOpen = useRef(false)

  const close = (fromUser = true) => {
    if (fromUser && modeRef.current === 'peek') suppressPeek.current = true
    setMode(null)
  }

  // Auto-peek: once per agent turn, show what it's reading for a few seconds,
  // then fold back unless the user has taken over (hover, click).
  const readingKey = [...s.live.reading].sort().join(',')
  const peekedThisTurn = useRef(false)
  const peekStart = useRef(0)
  // A new turn (or the end of one) starts fresh: a peek dismissed last turn doesn't silence this one.
  useEffect(() => {
    suppressPeek.current = false
    peekedThisTurn.current = false
  }, [s.live.busy])
  useEffect(() => {
    if (!readingKey || quiet || suppressPeek.current) return
    if (!peekedThisTurn.current) {
      peekedThisTurn.current = true
      peekStart.current = Date.now()
      setMode((m) => m ?? 'peek')
    } else if (modeRef.current !== 'peek') return
    const left = Math.max(0, Math.min(2600, 4200 - (Date.now() - peekStart.current)))
    window.clearTimeout(timers.current.peek)
    timers.current.peek = window.setTimeout(() => setMode((m) => (m === 'peek' ? null : m)), left)
  }, [readingKey, quiet])

  // Click outside or Escape closes a sticky overlay.
  useEffect(() => {
    if (!mode) return
    const onDown = (e: PointerEvent) => {
      if (rootRef.current?.contains(e.target as Node)) return
      if (modeRef.current === 'click' || modeRef.current === 'peek') close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || (isTypingTarget(e.target) && !rootRef.current?.contains(e.target as Node))) return
      if (useApp.getState().source || useApp.getState().commandOpen) return
      const inside = rootRef.current?.contains(document.activeElement)
      close()
      if (inside) expandRef.current?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  useEffect(() => {
    if (mode === 'click' && focusListOnOpen.current) {
      focusListOnOpen.current = false
      requestAnimationFrame(() => listRef.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus())
    }
  }, [mode])

  useEffect(() => () => Object.values(timers.current).forEach((t) => window.clearTimeout(t)), [])

  const onRailEnter = () => {
    window.clearTimeout(timers.current.leave)
    window.clearTimeout(timers.current.enter)
    timers.current.enter = window.setTimeout(() => setMode((m) => (m === 'click' ? m : 'hover')), 140)
  }
  const onRootLeave = () => {
    window.clearTimeout(timers.current.enter)
    timers.current.leave = window.setTimeout(() => setMode((m) => (m === 'hover' ? null : m)), 260)
  }
  const onOverlayEnter = () => {
    window.clearTimeout(timers.current.leave)
    window.clearTimeout(timers.current.peek)
    setMode((m) => (m === 'peek' ? 'hover' : m))
  }

  const open = !!mode

  return (
    <div
      {...drop.getRootProps({
        ref: rootRef,
        className: 'relative h-full',
        onMouseLeave: onRootLeave
      })}
    >
      <input {...drop.getInputProps({ id: 'source-files' })} />
      <nav
        aria-label="Sources"
        onMouseEnter={onRailEnter}
        className={cn(
          'flex h-full w-14 flex-col items-center border-r border-rule bg-ground pt-2 pb-2 transition-colors',
          drop.isDragActive && 'bg-cobalt-soft/60'
        )}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              ref={expandRef}
              variant="ghost"
              size="icon"
              className="size-9 text-ink-2"
              aria-label="Show sources"
              aria-expanded={open}
              aria-controls="focus-sources-overlay"
              onClick={(e) => {
                window.clearTimeout(timers.current.enter)
                focusListOnOpen.current = e.detail === 0
                setMode((m) => (m === 'click' ? null : 'click'))
              }}
            >
              <PanelLeftOpen className="size-4.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Show sources</TooltipContent>
        </Tooltip>
        <div className="my-2 h-px w-7 bg-rule" aria-hidden />
        <ul className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1 [scrollbar-width:none]">
          {docs.map((d) => (
            <RailItem key={d.id} d={d} s={s} />
          ))}
        </ul>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="mt-2 size-9 rounded-lg border border-dashed border-ink-3/40 text-ink-3 hover:border-cobalt/50 hover:text-ink"
              aria-label="Add documents"
              onClick={drop.open}
            >
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Add documents (or drop files here)</TooltipContent>
        </Tooltip>
      </nav>

      <AnimatePresence>
        {open && (
          <motion.div
            key="overlay"
            id="focus-sources-overlay"
            role="dialog"
            aria-label="Sources"
            aria-modal={false}
            initial={{ opacity: 0, x: -18 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -14 }}
            transition={{ duration: 0.2, ease }}
            onMouseEnter={onOverlayEnter}
            onPointerDown={() => setMode((m) => (m === 'peek' || m === 'hover' ? 'click' : m))}
            className="absolute inset-y-0 left-0 z-30 w-[272px] border-r border-rule shadow-[var(--shadow-page)]"
          >
            <SourcesList
              s={s}
              drop={drop}
              compact
              listRef={listRef}
              onPick={() => close()}
              actions={
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label="Keep sources open"
                        onClick={() => {
                          setMode(null)
                          setPinned(true)
                        }}
                      >
                        <Pin className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Keep open as a column</TooltipContent>
                  </Tooltip>
                  <Button variant="ghost" size="icon" className="size-8" aria-label="Close sources" onClick={() => close()}>
                    <X className="size-4" />
                  </Button>
                </>
              }
            />
          </motion.div>
        )}
      </AnimatePresence>
      {drop.isDragActive && <DropHint wide />}
    </div>
  )
}

/** Phones: the Sources tab. */
export function SourcesPhone() {
  const s = useDocSignals()
  const drop = useSourceDrop()
  return (
    <aside {...drop.getRootProps({ className: 'relative h-full min-h-0' })} aria-label="Sources">
      <input {...drop.getInputProps({ id: 'source-files' })} />
      <SourcesList s={s} drop={drop} inset />
      {drop.isDragActive && <DropHint />}
    </aside>
  )
}

/** For the phone tab bar: is the agent reading anything right now? */
export function useAnyReading() {
  const live = useLiveSources()
  return live.reading.size > 0
}
