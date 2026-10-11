import './theme.css'
import { FileText, FolderOpen, MessagesSquare, Upload } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useDropzone } from 'react-dropzone'
import { ChatPane } from '@/components/ChatPane'
import { FieldRowContext, FillPane, type FieldRowOptions } from '@/components/FillPane'
import { TitleBar } from '@/components/TitleBar'
import { questionsIn, useAgent, useOpenQuestion, useParsingTicker } from '@/lib/agent'
import { useApp, type Pane } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ReadingDot, useDockActivity } from './docs'
import { FocusCard } from './FocusCard'
import { showRow, useDock, useMediaQuery } from './model'
import { SourceDock } from './SourceDock'
import { SourcesTab } from './SourcesTab'

const tabs: { id: Pane; label: string; icon: typeof FileText }[] = [
  { id: 'template', label: 'Template', icon: FileText },
  { id: 'chat', label: 'Agent', icon: MessagesSquare },
  { id: 'sources', label: 'Sources', icon: FolderOpen }
]

/** Fields pane width at which the open card gets its own room instead of covering the list. */
const ROOM_AT = 1000

/**
 * Dock: Workbench's Fields | Agent columns. Sources live in a dock along the
 * bottom of the Fields pane and rise when they matter; questions arrive as one
 * focused card over the fields instead of a form in the chat.
 */
export default function Dock() {
  const desktop = useMediaQuery('(min-width: 1024px)')
  const phone = !useMediaQuery('(min-width: 640px)')
  const pane = useApp((s) => s.pane)
  const setPane = useApp((s) => s.setPane)
  const reveal = useApp((s) => s.reveal)
  const { messages } = useAgent()
  const newest = useMemo(() => questionsIn(messages).at(-1) ?? null, [messages])
  const openQ = useOpenQuestion()
  const fields = useApp((s) => s.fields)
  const live = useDockActivity()
  const cardMode = useDock((s) => s.mode)

  useParsingTicker()

  // Dropping files anywhere in the window adds them; the dock shows them parsing.
  const { getRootProps, getInputProps, isDragActive, open: openFiles } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (!files.length) return
      const ids = useApp.getState().addFiles(files.map((f) => ({ name: f.name })))
      useDock.getState().noteAdded(ids)
    }
  })

  // The newest question set that still names a field needing the user (answered sets drop out; skipped ones can be reopened).
  const answered = useApp((s) => s.answered)
  const askable = newest && answered[newest.id] && answered[newest.id] !== 'skipped' ? null : newest
  const liveItems = askable?.items.filter((i) => ['conflict', 'missing'].includes(fields[i.fieldId]?.status ?? '')) ?? []

  const askAbout = (fieldId?: string) => {
    if (askable && liveItems.length) useDock.getState().openCard(askable, fieldId)
  }

  // Command menu: bring the field into view; a field with an open question opens the card on it.
  useEffect(() => {
    if (!reveal) return
    showRow(reveal.fieldId)
    if (askable && liveItems.some((i) => i.fieldId === reveal.fieldId)) useDock.getState().openCard(askable, reveal.fieldId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

  const needsYouCount = openQ ? liveItems.length : 0

  return (
    <div {...getRootProps({ className: 'relative flex h-full flex-col bg-ground text-ink outline-none' })}>
      <input {...getInputProps({ id: 'source-files' })} />
      <TitleBar />
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-clip lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className={cn('relative min-h-0 flex-col', pane === 'template' ? 'flex' : 'hidden lg:flex')}>
          <FieldsArea sheet={phone} askAbout={askAbout} askable={askable} />
          {desktop && <SourceDock onAddFiles={openFiles} />}
        </div>
        <div className={cn('min-h-0 border-rule lg:border-l', pane === 'chat' ? 'block' : 'hidden lg:block')}>
          <ChatPane questions="pointer" onQuestionPointer={() => askAbout()} />
        </div>
        {!desktop && (
          <div className={cn('min-h-0', pane === 'sources' ? 'block' : 'hidden')}>
            <SourcesTab onAddFiles={openFiles} />
          </div>
        )}
      </main>

      <nav className="grid shrink-0 grid-cols-3 border-t border-rule bg-panel lg:hidden" aria-label="Panes">
        {tabs.map((t) => {
          let badge: ReactNode = null
          if (t.id === 'template' && needsYouCount && (pane !== 'template' || cardMode === 'min'))
            badge = <span className="num absolute -top-1 left-[calc(50%+6px)] rounded-full bg-warn px-1 font-mono text-[9px] leading-[14px] text-on-cobalt">{needsYouCount}</span>
          if (t.id === 'sources' && (live.reading.size > 0 || live.parsing.length > 0) && pane !== 'sources') badge = <ReadingDot className="absolute -top-0.5 left-[calc(50%+8px)]" />
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setPane(t.id)}
              aria-current={pane === t.id ? 'page' : undefined}
              className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', pane === t.id ? 'text-cobalt' : 'text-ink-3')}
            >
              <span className="relative">
                <t.icon className="size-4.5" />
                {badge}
              </span>
              {t.label}
            </button>
          )
        })}
      </nav>

      {isDragActive && (
        <div className="pointer-events-none absolute inset-3 z-50 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cobalt bg-cobalt-soft/90 text-[14px] font-medium text-cobalt-ink">
          <Upload className="size-5" />
          Drop to add to this project
          <span className="text-[12px] font-normal text-ink-2">Parsed on this device. The agent can cite them once indexed.</span>
        </div>
      )}
    </div>
  )
}

function FieldsArea({
  sheet,
  askAbout,
  askable
}: {
  sheet: boolean
  askAbout: (fieldId?: string) => void
  askable: ReturnType<typeof useOpenQuestion>
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(false)
  const view = useApp((s) => s.view)
  const openQ = useOpenQuestion()
  const applying = useDock((s) => s.applying)
  const mode = useDock((s) => s.mode)
  const step = useDock((s) => s.step)
  const cardOpen = (!!openQ || !!applying) && (mode === 'open' || !!applying)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= ROOM_AT))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const selectedId = openQ && mode === 'open' && !applying ? (openQ.items[Math.min(step, openQ.items.length - 1)]?.fieldId ?? null) : null
  const askableIds = useMemo(() => new Set(askable?.items.map((i) => i.fieldId) ?? []), [askable])

  const rowOptions: FieldRowOptions = {
    selectedId,
    conflictNote: 'Two documents disagree.',
    renderExtra: (fieldId, field) => {
      if (!field || !askableIds.has(fieldId) || (field.status !== 'conflict' && field.status !== 'missing')) return null
      return (
        <button
          type="button"
          onClick={() => askAbout(fieldId)}
          className="inline-flex h-7 w-fit items-center gap-1.5 rounded-md border border-warn/30 bg-warn-soft px-2.5 text-[12px] font-medium text-warn transition-colors hover:border-warn/60"
        >
          {field.status === 'conflict' ? 'Choose one' : 'Add it'}
          <span aria-hidden>→</span>
        </button>
      )
    }
  }

  // Point at the dock chip for a hovered citation chip.
  const pointAt = (target: EventTarget | null) => {
    const chip = (target as Element | null)?.closest?.('.group\\/cite')
    useDock.getState().setHoverDoc(chip?.querySelector('span')?.textContent ?? null)
  }

  return (
    <div
      ref={ref}
      className="relative min-h-0 flex-1"
      onMouseOver={(e) => pointAt(e.target)}
      onMouseLeave={() => useDock.getState().setHoverDoc(null)}
      onFocus={(e) => pointAt(e.target)}
      onBlur={() => useDock.getState().setHoverDoc(null)}
    >
      <FieldRowContext.Provider value={rowOptions}>
        <FillPane
          className={cn('dock-fields', wide && cardOpen && view === 'fields' && !sheet && 'dock-room')}
          belowProgress={
            sheet ? null : (
              <div className="relative z-30 h-0">
                <FocusCard variant="float" />
              </div>
            )
          }
        />
      </FieldRowContext.Provider>
      {sheet && <FocusCard variant="sheet" />}
    </div>
  )
}
