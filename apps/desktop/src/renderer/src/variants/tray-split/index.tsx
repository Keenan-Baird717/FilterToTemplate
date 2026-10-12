import './theme.css'
import { FileText, FolderOpen, ListChecks, MessagesSquare } from 'lucide-react'
import { MotionConfig } from 'motion/react'
import { useEffect, useState } from 'react'
import { TitleBar } from '@/components/TitleBar'
import { useAgent, useParsingTicker, useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { AgentDrawer, AgentHandle, AgentPane, useAgentUnread } from './AgentDrawer'
import { askAbout, useQuestionState } from './NeedsYouTray'
import { SourcesDock, SourcesPhone, useAnyReading } from './SourcesDock'
import { DESKTOP_QUERY, isTypingTarget, openConversation, useMediaQuery, useTray, WIDE_QUERY } from './state'
import { Workspace } from './Workspace'

type PhoneTab = 'template' | 'letter' | 'chat' | 'sources'

const phoneTabs: { id: PhoneTab; label: string; icon: typeof FileText }[] = [
  { id: 'template', label: 'Template', icon: ListChecks },
  { id: 'letter', label: 'Letter', icon: FileText },
  { id: 'chat', label: 'Agent', icon: MessagesSquare },
  { id: 'sources', label: 'Sources', icon: FolderOpen }
]

/**
 * Split: Tray with the live Word letter beside the field list and the agent
 * tucked into a slim handle on the right edge that opens as a drawer (or
 * stays open as a column). The tray and the waking sources rail are Tray's.
 */
export default function Split() {
  const pane = useApp((s) => s.pane)
  const view = useApp((s) => s.view)
  const setPane = useApp((s) => s.setPane)
  const reveal = useApp((s) => s.reveal)
  const desktop = useMediaQuery(DESKTOP_QUERY)
  const wide = useMediaQuery(WIDE_QUERY)
  const pinned = useTray((s) => s.pinned)
  const agentPinned = useTray((s) => s.agentPinned)
  const agentOpen = useTray((s) => s.agentOpen)
  // While the tray applies answers it is the place to watch: keep the sources rail from peeking over it.
  const phase = useTray((s) => s.phase)
  const { question, skipped, pending } = useQuestionState()
  const { busy } = useAgent()
  const { done } = useSummary()
  const [userFolded, setUserFolded] = useState(false)
  const conversationVisible = desktop ? agentPinned || agentOpen : pane === 'chat'
  const { unread, last } = useAgentUnread(conversationVisible)

  // The rail replaces SourcesPane, which normally runs the parsing ticker.
  useParsingTicker()

  // Sources stay a full column until the fill is underway, then fold to a rail.
  const underway = busy || done > 0
  const folded = !pinned && (underway || userFolded)

  // Command menu: select the field (the list and the letter both bring it into view); a question field opens the tray on it.
  useEffect(() => {
    if (!reveal) return
    const app = useApp.getState()
    app.setPane('template')
    app.setView('fields')
    useTray.getState().select(reveal.fieldId, 'reveal')
    if (pending.some((i) => i.fieldId === reveal.fieldId)) askAbout(reveal.fieldId, question, !!skipped)
    // only on a new reveal request
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

  // "Show the letter preview" from the command menu also works from another phone tab.
  useEffect(() => {
    if (view === 'preview') useApp.getState().setPane('template')
  }, [view])

  // "/" opens the conversation with the cursor in the message box. Escape clears the selection.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return
      const app = useApp.getState()
      if (app.commandOpen || app.source) return
      if (e.key === '/') {
        e.preventDefault()
        openConversation(true)
      } else if (e.key === 'Escape') {
        const t = useTray.getState()
        if (!t.agentOpen && !t.expanded && t.selected) t.select(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const asking = pending.length > 0 && !skipped
  const phoneTab: PhoneTab = pane === 'template' ? (view === 'preview' ? 'letter' : 'template') : pane

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full flex-col bg-ground text-ink">
        <TitleBar />
        <main
          className={cn(
            'relative grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-clip transition-[grid-template-columns] duration-300 ease-out',
            folded
              ? agentPinned
                ? 'lg:grid-cols-[56px_minmax(0,1fr)_340px] xl:grid-cols-[56px_minmax(0,1fr)_400px]'
                : 'lg:grid-cols-[56px_minmax(0,1fr)_44px]'
              : agentPinned
                ? 'lg:grid-cols-[232px_minmax(0,1fr)_340px] xl:grid-cols-[264px_minmax(0,1fr)_400px]'
                : 'lg:grid-cols-[232px_minmax(0,1fr)_44px] xl:grid-cols-[264px_minmax(0,1fr)_44px]'
          )}
        >
          <div className={cn('relative z-20 min-h-0 lg:block', pane === 'sources' ? 'block' : 'hidden')}>
            {desktop ? <SourcesDock folded={folded} quiet={phase !== 'idle'} onUnfold={underway ? undefined : () => setUserFolded(true)} /> : <SourcesPhone />}
          </div>

          <div className={cn('min-h-0 overflow-clip lg:block', pane === 'template' ? 'block' : 'hidden')}>
            <Workspace wide={wide} />
          </div>

          <div className={cn('min-h-0 lg:block', agentPinned && 'lg:border-l lg:border-rule', pane === 'chat' ? 'block' : 'hidden')}>
            {!desktop ? <AgentPane mode="phone" /> : agentPinned ? <AgentPane mode="column" /> : <AgentHandle unread={unread} excerpt={last} />}
          </div>

          {desktop && !agentPinned && <AgentDrawer />}
        </main>

        <PhoneTabs tab={phoneTab} needsYou={asking} agentDot={unread ? 'unread' : busy ? 'busy' : null} />
      </div>
    </MotionConfig>
  )
}

function PhoneTabs({ tab, needsYou, agentDot }: { tab: PhoneTab; needsYou: boolean; agentDot: 'unread' | 'busy' | null }) {
  const reading = useAnyReading()
  const go = (id: PhoneTab) => {
    const app = useApp.getState()
    if (id === 'template' || id === 'letter') {
      app.setPane('template')
      app.setView(id === 'letter' ? 'preview' : 'fields')
    } else app.setPane(id)
  }
  return (
    <nav className="grid shrink-0 grid-cols-4 border-t border-rule bg-panel lg:hidden" aria-label="Panes">
      {phoneTabs.map((t) => {
        const dot =
          t.id === 'template' && needsYou
            ? { tone: 'bg-warn', text: ', needs you' }
            : t.id === 'chat' && agentDot
              ? { tone: agentDot === 'busy' ? 'animate-pulse bg-cobalt' : 'bg-cobalt', text: agentDot === 'busy' ? ', agent is working' : ', new message' }
              : t.id === 'sources' && reading
                ? { tone: 'animate-pulse bg-cobalt', text: ', agent is reading' }
                : null
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            aria-current={tab === t.id ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', tab === t.id ? 'text-cobalt' : 'text-ink-3')}
          >
            <span className="relative">
              <t.icon className="size-4.5" />
              {dot && tab !== t.id && <span className={cn('absolute -top-0.5 -right-1 size-2 rounded-full ring-2 ring-panel', dot.tone)} aria-hidden />}
            </span>
            {t.label}
            {dot && tab !== t.id && <span className="sr-only">{dot.text}</span>}
          </button>
        )
      })}
    </nav>
  )
}
