import { FileText, MessagesSquare, ScanSearch } from 'lucide-react'
import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import { ChatPane } from '@/components/ChatPane'
import { TitleBar } from '@/components/TitleBar'
import { useAgent, useOpenQuestion, useParsingTicker } from '@/lib/agent'
import { useApp, type Pane } from '@/lib/store'
import { cn } from '@/lib/utils'
import { EvidencePane } from './Evidence'
import { FieldsPane } from './Fields'
import { goToField, goToNextQuestion, useInplace } from './state'

const tabs: { id: Pane; label: string; icon: typeof FileText }[] = [
  { id: 'sources', label: 'Evidence', icon: ScanSearch },
  { id: 'template', label: 'Template', icon: FileText },
  { id: 'chat', label: 'Agent', icon: MessagesSquare }
]

/**
 * "In place": Workbench's three columns. Questions are answered inside the
 * field rows; the left pane shows the evidence for whatever value you are
 * looking at, or the documents (alive while the agent reads) when nothing is.
 */
export default function InPlace() {
  const pane = useApp((s) => s.pane)
  const setPane = useApp((s) => s.setPane)
  const reveal = useApp((s) => s.reveal)
  const selected = useInplace((s) => s.selected)

  useParsingTicker()

  // Command menu: select the field and bring its row into view.
  useEffect(() => {
    if (reveal && (fieldDefs[reveal.fieldId] || reveal.fieldId === 'hourlyRates')) goToField(reveal.fieldId)
  }, [reveal])

  // Esc goes back to all documents (unless a dialog or an input is handling it).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !useInplace.getState().selected) return
      const t = e.target as HTMLElement | null
      if (t?.closest('input, textarea, select, [contenteditable=true]')) return
      const app = useApp.getState()
      if (app.source || app.commandOpen) return
      useInplace.getState().select(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <MotionConfig reducedMotion="user">
      <AgentSync />
      <div className="flex h-full flex-col bg-ground text-ink">
        <TitleBar />
        <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-clip lg:grid-cols-[248px_minmax(0,1fr)_340px] xl:grid-cols-[300px_minmax(0,1fr)_384px]">
          <div className={cn('min-h-0 overflow-clip border-rule lg:block lg:border-r', pane === 'sources' ? 'block' : 'hidden')}>
            <EvidencePane />
          </div>
          <div className={cn('min-h-0 overflow-clip lg:block', pane === 'template' ? 'block' : 'hidden')}>
            <FieldsPane />
          </div>
          <div className={cn('min-h-0 overflow-clip border-rule lg:block lg:border-l', pane === 'chat' ? 'block' : 'hidden')}>
            <ChatPane questions="pointer" onQuestionPointer={() => goToNextQuestion({ fromStart: true })} />
          </div>
        </main>
        <nav className="grid shrink-0 grid-cols-3 border-t border-rule bg-panel lg:hidden" aria-label="Panes">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setPane(t.id)}
              aria-current={pane === t.id ? 'page' : undefined}
              className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', pane === t.id ? 'text-cobalt' : 'text-ink-3')}
            >
              <t.icon className="size-4.5" />
              {t.label}
              {t.id === 'sources' && selected && pane !== 'sources' && (
                <span className="absolute top-1.5 left-[calc(50%+10px)] size-1.5 rounded-full bg-cobalt" aria-hidden />
              )}
            </button>
          ))}
        </nav>
      </div>
    </MotionConfig>
  )
}

/**
 * Mirrors the open question into the layout store (so rows don't each
 * subscribe to the chat), clears the selection when a fresh fill starts, and
 * tracks the "applying your answers" phase.
 */
function AgentSync() {
  const open = useOpenQuestion()
  const { busy, messages } = useAgent()
  const lastUser = messages.findLast((m) => m.role === 'user')
  const refilling = busy && lastUser?.metadata?.command === 'run-fill'

  useEffect(() => {
    if ((useInplace.getState().question?.id ?? null) !== (open?.id ?? null)) useInplace.setState({ question: open })
  }, [open])

  useEffect(() => {
    if (!refilling) return
    useInplace.setState({ selected: null, focusSource: null, sent: null, nudgeAt: 0 })
    // Fields fill from the top: start there so the user can watch.
    document.querySelector('[data-inplace-list]')?.closest('[data-slot=scroll-area-viewport]')?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [refilling])

  useEffect(() => {
    const sent = useInplace.getState().sent
    if (!sent) return
    if (sent.phase === 'sending' && busy) useInplace.setState({ sent: { ...sent, phase: 'applying' } })
    if (sent.phase === 'applying' && !busy) {
      const fields = useApp.getState().fields
      const changed = Object.keys(sent.before).filter((id) => (fields[id]?.value ?? null) !== sent.before[id]).length
      useInplace.setState({ sent: { ...sent, phase: 'done', changed }, nudgeAt: 0 })
    }
  }, [busy])

  // The "Updated n values" note is brief.
  const sentPhase = useInplace((s) => s.sent?.phase)
  useEffect(() => {
    if (sentPhase !== 'done') return
    const t = setTimeout(() => useInplace.setState({ sent: null }), 5000)
    return () => clearTimeout(t)
  }, [sentPhase])

  return null
}
