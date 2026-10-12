import './theme.css'
import { ListChecks } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { TitleBar } from '@/components/TitleBar'
import { useAgent, useLiveSources, useOpenQuestion, useParsingTicker } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { FieldsColumn } from './FieldsColumn'
import { SidePanel, TabBadges, tabMeta } from './SidePanel'
import { isTyping, lastUserMessage, scrollToCenter, useSidekick, type PanelTab } from './state'

/**
 * Sidekick: Workbench without the permanent left pane. The fields get the
 * room; one side panel holds Needs you, the agent and the sources.
 */
export default function Sidekick() {
  const phonePane = useSidekick((s) => s.phonePane)
  const live = useLiveSources()
  useParsingTicker()
  useSmartSwitching()
  useReveal()
  usePanelShortcut()

  return (
    <div className="flex h-full flex-col bg-ground text-ink">
      <TitleBar />
      <main className="flex min-h-0 flex-1 overflow-hidden">
        <div className={cn('min-w-0 flex-1 lg:block', phonePane === 'fields' ? 'block' : 'hidden')}>
          <FieldsColumn />
        </div>
        <SidePanel live={live} className={cn('lg:flex', phonePane === 'panel' ? 'flex' : 'hidden')} />
      </main>
      <PhoneBar live={live} />
    </div>
  )
}

function PhoneBar({ live }: { live: ReturnType<typeof useLiveSources> }) {
  const phonePane = useSidekick((s) => s.phonePane)
  const tab = useSidekick((s) => s.tab)
  const choose = useSidekick((s) => s.choose)
  const showFields = useSidekick((s) => s.showFields)
  const current = phonePane === 'fields' ? 'fields' : tab
  const item = (id: 'fields' | PanelTab, label: string, Icon: typeof ListChecks, onClick: () => void) => (
    <button
      key={id}
      type="button"
      onClick={onClick}
      aria-current={current === id ? 'page' : undefined}
      className={cn('relative flex flex-col items-center gap-0.5 py-2 text-[11px]', current === id ? 'text-cobalt-ink' : 'text-ink-3')}
    >
      <span className="relative">
        <Icon className="size-4.5" />
        {id !== 'fields' && (
          <span className="absolute -top-1.5 left-3 flex">
            <TabBadges tab={id} live={live} compact />
          </span>
        )}
      </span>
      {label}
    </button>
  )
  return (
    <nav className="grid shrink-0 grid-cols-4 border-t border-rule bg-panel lg:hidden" aria-label="Panes">
      {item('fields', 'Fields', ListChecks, () => showFields())}
      {(Object.keys(tabMeta) as PanelTab[]).map((t) => item(t, tabMeta[t].label, tabMeta[t].icon, () => choose(t)))}
    </nav>
  )
}

/**
 * Switch the panel when it helps, never when it would yank the user away:
 * a new question set opens Needs you, a message the user sends opens Agent,
 * and a tab the user picked holds until the current turn ends.
 */
function useSmartSwitching() {
  const { messages, busy } = useAgent()
  const open = useOpenQuestion()
  const lastUser = lastUserMessage(messages)

  const seenUser = useRef(lastUser?.id)
  useEffect(() => {
    if (!lastUser || lastUser.id === seenUser.current) return
    seenUser.current = lastUser.id
    if (lastUser.metadata?.answer) return
    const sk = useSidekick.getState()
    if (lastUser.metadata?.command === 'run-fill') sk.setApplied(null)
    sk.auto('agent')
  }, [lastUser])

  const seenQuestion = useRef(open?.id ?? null)
  useEffect(() => {
    if (!open) {
      useSidekick.getState().clearAttention('needs')
      return
    }
    if (open.id === seenQuestion.current) return
    seenQuestion.current = open.id
    useSidekick.getState().auto('needs')
  }, [open])

  // Declared last so a question that lands in the same render as the end of
  // the turn still sees the user's manual choice.
  const wasBusy = useRef(busy)
  useEffect(() => {
    if (wasBusy.current && !busy) useSidekick.getState().endTurn()
    wasBusy.current = busy
  }, [busy])
}

/** The command menu's "jump to field": show the fields and bring the row into view. */
function useReveal() {
  const reveal = useApp((s) => s.reveal)
  useEffect(() => {
    if (!reveal) return
    const { fieldId } = reveal
    useSidekick.getState().showFields(fieldId)
    const app = useApp.getState()
    if (app.view !== 'fields') app.setView('fields')
    const t = window.setTimeout(() => {
      scrollToCenter(document.getElementById(`field-${fieldId}`))
      useApp.setState((s) => ({ flash: { ...s.flash, [fieldId]: Date.now() } }))
    }, 60)
    return () => window.clearTimeout(t)
  }, [reveal])
}

/** "]" collapses or expands the side panel (not while typing). */
function usePanelShortcut() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== ']' || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (!window.matchMedia('(min-width: 1024px)').matches) return
      e.preventDefault()
      const sk = useSidekick.getState()
      if (sk.collapsed) sk.expand()
      else sk.setCollapsed(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
