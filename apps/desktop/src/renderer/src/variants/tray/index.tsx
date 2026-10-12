import './theme.css'
import { FileText, FolderOpen, MessagesSquare } from 'lucide-react'
import { MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import { ChatPane } from '@/components/ChatPane'
import { FieldRowContext, FillPane } from '@/components/FillPane'
import { TitleBar } from '@/components/TitleBar'
import { useAgent, useParsingTicker, useSummary } from '@/lib/agent'
import { useApp, type Pane } from '@/lib/store'
import { cn } from '@/lib/utils'
import { askAbout, clickGuard, NeedsYouTray, useQuestionState, useTrayRowOptions } from './NeedsYouTray'
import { SourcesDock, SourcesPhone, useAnyReading } from './SourcesDock'
import { citedDocAt, useMediaQuery, useTray } from './state'

const tabs: { id: Pane; label: string; icon: typeof FileText }[] = [
  { id: 'sources', label: 'Sources', icon: FolderOpen },
  { id: 'template', label: 'Template', icon: FileText },
  { id: 'chat', label: 'Agent', icon: MessagesSquare }
]

/**
 * Tray: Workbench's three panes, with the questions pinned in a tray above
 * the fields (the chat stays a conversation) and the sources folded into a
 * rail that wakes up when the agent reads or a value gets cited.
 */
export default function Tray() {
  const pane = useApp((s) => s.pane)
  const setPane = useApp((s) => s.setPane)
  const reveal = useApp((s) => s.reveal)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const pinned = useTray((s) => s.pinned)
  const setHoverDoc = useTray((s) => s.setHoverDoc)
  // While the tray applies answers it is the place to watch: keep the sources rail from peeking over it.
  const phase = useTray((s) => s.phase)
  const { question, skipped, pending } = useQuestionState()
  const rowOptions = useTrayRowOptions()
  const { busy } = useAgent()
  const { done } = useSummary()
  const [userFolded, setUserFolded] = useState(false)

  // The rail replaces SourcesPane, which normally runs the parsing ticker.
  useParsingTicker()

  // Sources stay a full column until the fill is underway, then fold to a rail.
  const underway = busy || done > 0
  const folded = !pinned && (underway || userFolded)

  // Command menu: bring the field into view; a question field opens the tray on it.
  useEffect(() => {
    if (!reveal) return
    useApp.getState().focusField(reveal.fieldId)
    if (pending.some((i) => i.fieldId === reveal.fieldId)) askAbout(reveal.fieldId, question, !!skipped)
    // only on a new reveal request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

  const openFromChat = () => {
    setPane('template')
    useApp.getState().setView('fields')
    if (question) askAbout(null, question, !!skipped)
  }

  const asking = pending.length > 0 && !skipped

  // Rows that open the tray look clickable.
  const clickable = pending.map((i) => `#field-${CSS.escape(i.fieldId)}`).join(',')

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full flex-col bg-ground text-ink">
        <TitleBar />
        <main
          className={cn(
            'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-clip transition-[grid-template-columns] duration-300 ease-out',
            folded
              ? 'lg:grid-cols-[56px_minmax(0,1fr)_340px] xl:grid-cols-[56px_minmax(0,1fr)_400px]'
              : 'lg:grid-cols-[232px_minmax(0,1fr)_340px] xl:grid-cols-[264px_minmax(0,1fr)_400px]'
          )}
        >
          <div className={cn('relative z-20 min-h-0 lg:block', pane === 'sources' ? 'block' : 'hidden')}>
            {desktop ? <SourcesDock folded={folded} quiet={phase !== 'idle'} onUnfold={underway ? undefined : () => setUserFolded(true)} /> : <SourcesPhone />}
          </div>

          <div
            data-tray-fill
            className={cn(
              'min-h-0 lg:block',
              pane === 'template' ? 'block' : 'hidden',
              '[&_[data-selected]]:bg-cobalt-soft/40 [&_[data-selected]:first-child]:rounded-t-[7px] [&_[data-selected]:last-child]:rounded-b-[7px]'
            )}
            onClickCapture={(e) => {
              clickGuard.onControl = !!(e.target as HTMLElement).closest('button, a, input, textarea, label, [role="radio"]')
            }}
            onMouseOver={(e) => setHoverDoc(citedDocAt(e.target))}
            onMouseLeave={() => setHoverDoc(null)}
            onFocus={(e) => setHoverDoc(citedDocAt(e.target))}
            onBlur={() => setHoverDoc(null)}
          >
            {clickable && (
              <style>{`${clickable}{cursor:pointer;transition:background-color .2s}${pending
                .map((i) => `#field-${CSS.escape(i.fieldId)}:hover`)
                .join(',')}{background-color:color-mix(in srgb,var(--warn-soft) 45%,transparent)}`}</style>
            )}
            <FieldRowContext.Provider value={rowOptions}>
              {/* The tray already says what needs the user, so the strip stays quiet meanwhile. */}
              <FillPane belowProgress={<NeedsYouTray />} stripStatus={asking || phase === 'applying' ? null : undefined} />
            </FieldRowContext.Provider>
          </div>

          <div className={cn('min-h-0 border-rule lg:block lg:border-l', pane === 'chat' ? 'block' : 'hidden')}>
            <ChatPane questions="pointer" onQuestionPointer={openFromChat} />
          </div>
        </main>

        <PhoneTabs pane={pane} setPane={setPane} needsYou={asking} />
      </div>
    </MotionConfig>
  )
}

function PhoneTabs({ pane, setPane, needsYou }: { pane: Pane; setPane: (p: Pane) => void; needsYou: boolean }) {
  const reading = useAnyReading()
  return (
    <nav className="grid shrink-0 grid-cols-3 border-t border-rule bg-panel lg:hidden" aria-label="Panes">
      {tabs.map((t) => {
        const dot = t.id === 'template' && needsYou ? 'warn' : t.id === 'sources' && reading ? 'cobalt' : null
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
              {dot && pane !== t.id && (
                <span
                  className={cn('absolute -top-0.5 -right-1 size-2 rounded-full ring-2 ring-panel', dot === 'warn' ? 'bg-warn' : 'animate-pulse bg-cobalt')}
                  aria-hidden
                />
              )}
            </span>
            {t.label}
            {dot && pane !== t.id && <span className="sr-only">{dot === 'warn' ? ', needs you' : ', agent is reading'}</span>}
          </button>
        )
      })}
    </nav>
  )
}
