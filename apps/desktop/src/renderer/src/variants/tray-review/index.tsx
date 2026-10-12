import './theme.css'
import { FileText, FolderOpen, MessagesSquare } from 'lucide-react'
import { MotionConfig } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ChatPane } from '@/components/ChatPane'
import { FieldRowContext } from '@/components/FillPane'
import { TitleBar } from '@/components/TitleBar'
import { useAgent, useParsingTicker, useSummary } from '@/lib/agent'
import { useApp, type Pane } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ReviewContext, ReviewFillPane } from './Fields'
import { JobTray, useStage } from './JobTray'
import { askAbout, clickGuard, useQuestionState, useTrayRowOptions } from './NeedsYouTray'
import { labelOf, review, useReview, useReviewModel, watchApprovals } from './review'
import { SourcesDock, SourcesPhone, useAnyReading } from './SourcesDock'
import { citedDocAt, isTypingTarget, useMediaQuery, useTray } from './state'

const tabs: { id: Pane; label: string; icon: typeof FileText }[] = [
  { id: 'sources', label: 'Sources', icon: FolderOpen },
  { id: 'template', label: 'Template', icon: FileText },
  { id: 'chat', label: 'Agent', icon: MessagesSquare }
]

/**
 * Review: Tray, with the tray carrying the user through the whole job. It
 * asks the agent's questions, then steps through every value with its
 * evidence opened in place, then turns into the export bar. The sources rail
 * lights up the documents behind the value under review.
 */
export default function TrayReview() {
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
  const model = useReviewModel()
  const stage = useStage(model)
  const reviewing = useReview((s) => s.active)
  const context = useMemo(() => ({ stage, model }), [stage, model])

  useReviewKeys(reviewing)

  // An approved value that changes drops back into review; the agent's changes also get a toast.
  useEffect(
    () =>
      watchApprovals((id) =>
        toast(`${labelOf(id)} changed after you approved it`, {
          description: 'It’s back in review.',
          action: { label: 'Review', onClick: () => review.start(id) }
        })
      ),
    []
  )

  // The rail replaces SourcesPane, which normally runs the parsing ticker.
  useParsingTicker()

  // Sources stay a full column until the fill is underway, then fold to a rail.
  const underway = busy || done > 0
  const folded = !pinned && (underway || userFolded)

  // Command menu: bring the field into view; a question field opens the tray on it,
  // and during review the jump moves the review there.
  useEffect(() => {
    if (!reveal) return
    if (useReview.getState().active && model.queue.some((i) => i.id === reveal.fieldId)) review.start(reveal.fieldId)
    else useApp.getState().focusField(reveal.fieldId)
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
            <ReviewContext.Provider value={context}>
              <FieldRowContext.Provider value={rowOptions}>
                {/* The tray says what's next, so the strip only reports agent activity. */}
                <ReviewFillPane belowProgress={<JobTray stage={stage} model={model} />} stripStatus={stage === 'working' ? undefined : null} />
              </FieldRowContext.Provider>
            </ReviewContext.Provider>
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

/**
 * Review keys: A approve, Shift+A approve the rest of the section, E edit,
 * S skip, K/← back, J/→ next, Esc leave. Never while typing or in a dialog,
 * and never with Ctrl, ⌘ or Alt held (those belong to the app).
 */
function useReviewKeys(active: boolean) {
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return
      const app = useApp.getState()
      if (app.source || app.commandOpen) return
      const target = e.target as HTMLElement | null
      if (target?.closest?.('[role="dialog"], [role="menu"], [role="listbox"], [role="tablist"], [role="radiogroup"]')) return
      // Escape closes the sources overlay first.
      if (e.key === 'Escape' && document.getElementById('rv-sources-overlay')) return
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const nav = key === 'j' || key === 'k' || key === 'ArrowLeft' || key === 'ArrowRight'
      if (e.repeat && !nav) return
      switch (key) {
        case 'a':
          if (e.shiftKey) review.approveRestOfSection()
          else review.approve()
          break
        case 'e':
          review.edit()
          break
        case 's':
          review.skip()
          break
        case 'k':
        case 'ArrowLeft':
          review.step(-1)
          break
        case 'j':
        case 'ArrowRight':
          review.step(1)
          break
        case 'Escape':
          review.leave()
          break
        default:
          return
      }
      e.preventDefault()
    }
    // Capture, so Escape is seen before the source drawer or a menu closes on it.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [active])
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
