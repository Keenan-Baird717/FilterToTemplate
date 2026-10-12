import './theme.css'
import { FileText, FolderOpen, MessagesSquare } from 'lucide-react'
import { AnimatePresence, motion, MotionConfig } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { ChatPane } from '@/components/ChatPane'
import { FieldRowContext, FillPane } from '@/components/FillPane'
import { TitleBar } from '@/components/TitleBar'
import { useAgent, useParsingTicker, useSummary } from '@/lib/agent'
import { useApp, type Pane } from '@/lib/store'
import { cn } from '@/lib/utils'
import { EvidencePanel, EvidenceSheet } from './Evidence'
import { askAbout, clickGuard, NeedsYouTray, useQuestionState, useTrayRowOptions } from './NeedsYouTray'
import { SourcesDock, SourcesPhone, useAnyReading } from './SourcesDock'
import { citeTarget, citedDocAt, fieldOrder, focusRow, isTypingTarget, rowOf, stepField, useMediaQuery, useTray } from './state'

const tabs: { id: Pane; label: string; icon: typeof FileText }[] = [
  { id: 'sources', label: 'Sources', icon: FolderOpen },
  { id: 'template', label: 'Template', icon: FileText },
  { id: 'chat', label: 'Agent', icon: MessagesSquare }
]

const ease = [0.22, 1, 0.36, 1] as const

/**
 * Evidence: Tray's three panes, with a left column that has three states.
 * The waking rail while the agent works, the live sources list on hover or
 * pin, and, when you select a field, the evidence behind it: the column
 * widens and pushes the fields over, then folds back into the rail.
 */
export default function Evidence() {
  const pane = useApp((s) => s.pane)
  const setPane = useApp((s) => s.setPane)
  const reveal = useApp((s) => s.reveal)
  const desktop = useMediaQuery('(min-width: 1024px)')
  const pinned = useTray((s) => s.pinned)
  const selected = useTray((s) => s.selected)
  const hoverCardDoc = useTray((s) => s.hoverCardDoc)
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
  const evidence = desktop && !!selected

  // Command menu: bring the field into view and show its evidence.
  useEffect(() => {
    if (!reveal) return
    useApp.getState().focusField(reveal.fieldId)
    useTray.getState().select(reveal.fieldId)
  }, [reveal])

  // A fresh fill ("Run again", from anywhere) folds the evidence back so the rail can show the reading.
  const lastDone = useRef(done)
  useEffect(() => {
    if (lastDone.current > 1 && done <= 1) useTray.getState().select(null)
    lastDone.current = done
  }, [done])

  // Once the column has finished widening, make sure the selected row is still in view.
  useEffect(() => {
    if (!evidence) return
    const t = setTimeout(() => {
      const id = useTray.getState().selected
      if (id) rowOf(id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }, 360)
    return () => clearTimeout(t)
  }, [evidence])

  // Keyboard: ↑/↓ walk the fields while focus is in the list (or the evidence); Esc folds the evidence.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return
      const app = useApp.getState()
      if (app.source || app.commandOpen) return
      const t = e.target as HTMLElement
      if (isTypingTarget(t)) return
      const st = useTray.getState()

      if (e.key === 'Escape') {
        if (!st.selected || st.sheetOpen) return
        if (t.closest?.('[role="dialog"], [role="menu"], [role="listbox"]')) return
        const inside = !!t.closest?.('[data-te-evidence]')
        const id = st.selected
        st.select(null)
        if (inside) requestAnimationFrame(() => focusRow(id, { keyboard: true }))
        return
      }

      if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.shiftKey) return
      if (app.view !== 'fields') return
      if (t.closest?.('[role="radio"], [role="radiogroup"], [role="tab"], [role="tablist"], [role="menu"], [role="listbox"], [role="dialog"]')) return
      const inList = !!t.closest?.('[data-te-fill] [data-slot="scroll-area-viewport"]')
      const inEvidence = !!t.closest?.('[data-te-evidence]')
      const onBody = t === document.body && !!st.selected
      if (!inList && !inEvidence && !onBody) return
      e.preventDefault()
      // From a focused chip or button inside a row, start at that row.
      const host = t.closest?.<HTMLElement>('[id^="field-"]')
      const hostId = host?.id.slice('field-'.length)
      if (hostId && hostId !== st.selected) {
        st.select(hostId)
        return
      }
      stepField(e.key === 'ArrowDown' ? 1 : -1, { focus: !inEvidence })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const openFromChat = () => {
    setPane('template')
    useApp.getState().setView('fields')
    if (question) askAbout(null, question, !!skipped)
  }

  const asking = pending.length > 0 && !skipped
  const esc = (id: string) => `#field-${CSS.escape(id)}`

  // The selected row (the rate table included) is tinted; the chip of the card under the pointer is outlined.
  const selectionCss = selected
    ? `${esc(selected)}{background-color:color-mix(in srgb,var(--cobalt-soft) 80%,transparent)!important;box-shadow:inset 0 0 0 1px color-mix(in srgb,var(--cobalt) 32%,transparent)}` +
      `${esc(selected)}:first-child{border-top-left-radius:7px;border-top-right-radius:7px}${esc(selected)}:last-child{border-bottom-left-radius:7px;border-bottom-right-radius:7px}` +
      (desktop ? `${esc(selected)} button[data-doc-id]{border-color:color-mix(in srgb,var(--cobalt) 30%,var(--rule))}` : '') +
      (hoverCardDoc ? `${esc(selected)} button[data-doc-id="${CSS.escape(hoverCardDoc)}"]{border-color:var(--cobalt);background-color:var(--cobalt-soft);color:var(--ink)}` : '')
    : ''

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full flex-col bg-ground text-ink">
        <TitleBar />
        <main
          className={cn(
            'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-clip transition-[grid-template-columns] duration-[340ms] ease-[cubic-bezier(0.22,1,0.36,1)]',
            evidence
              ? // The chat gives up a little room while you inspect, so the fields keep a usable width.
                'lg:grid-cols-[300px_minmax(0,1fr)_320px] xl:grid-cols-[340px_minmax(0,1fr)_360px] 2xl:grid-cols-[360px_minmax(0,1fr)_400px]'
              : folded
                ? 'lg:grid-cols-[56px_minmax(0,1fr)_340px] xl:grid-cols-[56px_minmax(0,1fr)_400px]'
                : 'lg:grid-cols-[232px_minmax(0,1fr)_340px] xl:grid-cols-[264px_minmax(0,1fr)_400px]'
          )}
        >
          <div className={cn('relative z-20 min-h-0 lg:block', pane === 'sources' ? 'block' : 'hidden')}>
            {desktop ? (
              <AnimatePresence initial={false}>
                {evidence && selected ? (
                  // Clipped to the column, which widens underneath: the evidence is revealed, not slid over the fields.
                  <motion.div
                    key="evidence"
                    className="absolute inset-0 overflow-clip"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.22, ease }}
                  >
                    <motion.div
                      className="h-full w-[300px] xl:w-[340px] 2xl:w-[360px]"
                      initial={{ x: -24 }}
                      animate={{ x: 0 }}
                      exit={{ x: -24 }}
                      transition={{ duration: 0.34, ease }}
                    >
                      <EvidencePanel id={selected} />
                    </motion.div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="sources"
                    className="absolute inset-0"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1, transition: { duration: 0.2, delay: 0.12 } }}
                    exit={{ opacity: 0, transition: { duration: 0.12 } }}
                  >
                    <SourcesDock folded={folded} quiet={phase !== 'idle'} onUnfold={underway ? undefined : () => setUserFolded(true)} />
                  </motion.div>
                )}
              </AnimatePresence>
            ) : (
              <SourcesPhone />
            )}
          </div>

          <div
            data-te-fill
            className={cn('min-h-0 lg:block', pane === 'template' ? 'block' : 'hidden')}
            onClickCapture={(e) => {
              const t = e.target as HTMLElement
              clickGuard.onControl = !!t.closest('button, a, input, textarea, label, [role="radio"]')
              // A value clicked in the Word preview: the preview jumps to its row, and its evidence opens.
              const value = t.closest<HTMLElement>('.ftt-docx [data-field]')?.dataset.field
              if (value && fieldOrder.includes(value)) {
                useTray.getState().select(value)
                return
              }
              if (!desktop) return
              // A citation in a row or a question opens that field's evidence on the left, with its card
              // brought forward. Clicking the same citation again opens the full document.
              const hit = citeTarget(t)
              if (!hit) return
              const st = useTray.getState()
              if (st.selected === hit.fieldId && st.focusSource?.key === hit.key) return
              e.preventDefault()
              e.stopPropagation()
              st.select(hit.fieldId, { source: hit.key })
            }}
            onKeyDownCapture={(e) => {
              if (e.key !== 'Enter' && e.key !== ' ') return
              const value = (e.target as HTMLElement).closest<HTMLElement>('.ftt-docx [data-field]')?.dataset.field
              if (value && fieldOrder.includes(value)) useTray.getState().select(value)
            }}
            onClick={(e) => {
              // Clicking empty space in the list folds the evidence back.
              const t = e.target as HTMLElement
              if (!useTray.getState().selected) return
              if (!t.closest('[data-slot="scroll-area-viewport"]')) return
              if (t.closest('[id^="field-"], button, a, input, textarea, label, [role]')) return
              useTray.getState().select(null)
            }}
            onMouseOver={(e) => {
              const st = useTray.getState()
              const hit = desktop && st.selected ? citeTarget(e.target) : null
              if (hit && hit.fieldId === st.selected) {
                st.setHoverSource(hit.key)
                setHoverDoc(null)
              } else {
                st.setHoverSource(null)
                setHoverDoc(citedDocAt(e.target))
              }
            }}
            onMouseLeave={() => {
              setHoverDoc(null)
              useTray.getState().setHoverSource(null)
            }}
            onFocus={(e) => setHoverDoc(citedDocAt(e.target))}
            onBlur={() => setHoverDoc(null)}
          >
            {selectionCss && <style>{selectionCss}</style>}
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
        {!desktop && <EvidenceSheet />}
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
