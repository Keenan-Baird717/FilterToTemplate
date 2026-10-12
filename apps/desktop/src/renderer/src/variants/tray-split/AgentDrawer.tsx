import { ArrowUp, MessagesSquare, PanelRightClose, Paperclip, Pin, Square, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { ChatMessage } from '@/components/ChatPane'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { sendPrompt, useAgent, useEngineName } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { askAbout, useQuestionState } from './NeedsYouTray'
import { isTypingTarget, useTray } from './state'

const suggestions = ['Where did Net 30 come from?', 'Which rates did you use?', 'Why is litigation excluded?']
const ease = [0.22, 1, 0.36, 1] as const

/** Agent replies the user hasn't seen yet (the conversation was closed when they arrived). */
export function useAgentUnread(visible: boolean) {
  const { messages } = useAgent()
  const texts = useMemo(() => {
    let n = 0
    let last = ''
    for (const m of messages) {
      if (m.role !== 'assistant') continue
      for (const p of m.parts) {
        if (p.type === 'text' && p.text.trim()) {
          n++
          last = p.text
        }
      }
    }
    return { n, last: last.replace(/\*\*?|`/g, '').trim() }
  }, [messages])
  const [seen, setSeen] = useState(texts.n)
  useEffect(() => {
    if (visible || texts.n < seen) setSeen(texts.n)
  }, [visible, texts.n, seen])
  return { unread: !visible && texts.n > seen, last: texts.last }
}

/** What the agent is doing, in the words the handle and the header use. */
function useAgentState() {
  const { busy, activity } = useAgent()
  const { pending, skipped } = useQuestionState()
  const asking = pending.length > 0 && !skipped
  const n = pending.length
  if (busy) return { kind: 'working' as const, label: `${activity ?? 'Working'}…` }
  if (asking) return { kind: 'asking' as const, label: `Asked you ${n} question${n === 1 ? '' : 's'}` }
  return { kind: 'idle' as const, label: 'Agent' }
}

// ---------------------------------------------------------------------------
// The slim handle on the right edge
// ---------------------------------------------------------------------------

export function AgentHandle({ unread, excerpt }: { unread: boolean; excerpt: string }) {
  const open = useTray((s) => s.agentOpen)
  const openAgent = useTray((s) => s.openAgent)
  const state = useAgentState()
  const spoken = `${state.kind === 'idle' ? 'Open the conversation with the agent' : `Agent: ${state.label.replace('…', '')}`}${unread ? ', new message' : ''}`

  return (
    <div className="relative h-full">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            data-split-agent-handle
            aria-label={spoken}
            aria-expanded={open}
            aria-controls="split-agent-drawer"
            aria-keyshortcuts="/"
            onClick={() => openAgent(true)}
            className={cn(
              'group relative flex h-full w-11 flex-col items-center gap-3 overflow-hidden border-l border-rule pt-2 pb-3 transition-colors focus-visible:-outline-offset-2',
              state.kind === 'working' ? 'bg-cobalt-soft/35 hover:bg-cobalt-soft/60' : 'bg-ground hover:bg-panel'
            )}
          >
            {state.kind === 'working' && (
              <span className="pointer-events-none absolute inset-y-0 left-0 w-0.5 overflow-hidden" aria-hidden>
                <span className="split-working-bar block h-1/4 w-full rounded-full bg-cobalt" />
              </span>
            )}
            <span className="relative flex size-8 shrink-0 items-center justify-center rounded-md text-ink-2 group-hover:text-ink">
              <MessagesSquare className="size-4.5" />
              {unread && <span className="absolute top-1 right-0.5 size-2 rounded-full bg-cobalt ring-2 ring-ground" aria-hidden />}
            </span>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={state.label}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease }}
                className={cn(
                  'flex min-h-0 items-center gap-2 overflow-hidden text-[12px] leading-none whitespace-nowrap [writing-mode:vertical-rl]',
                  state.kind === 'working' ? 'font-medium text-cobalt-ink' : state.kind === 'asking' ? 'text-ink-2' : 'text-ink-3 group-hover:text-ink-2'
                )}
                aria-hidden
              >
                {state.kind === 'asking' && <span className="size-1.5 shrink-0 rounded-full bg-warn" />}
                {state.kind === 'working' && (
                  <span className="relative flex size-1.5 shrink-0">
                    <span className="absolute inset-0 animate-ping rounded-full bg-cobalt opacity-60" />
                    <span className="relative size-1.5 rounded-full bg-cobalt" />
                  </span>
                )}
                {state.label}
              </motion.span>
            </AnimatePresence>
            <Kbd className="mt-auto shrink-0 border border-rule bg-panel font-mono text-[11px] text-ink-3">/</Kbd>
          </button>
        </TooltipTrigger>
        <TooltipContent side="left" className="max-w-72">
          {unread && excerpt ? (
            <span className="line-clamp-3">{excerpt}</span>
          ) : (
            <span className="flex items-center gap-2">
              Open the conversation <Kbd>/</Kbd>
            </span>
          )}
        </TooltipContent>
      </Tooltip>
      {/* Announce what the agent is doing without opening anything. */}
      <span className="sr-only" role="status" aria-live="polite">
        {state.kind === 'idle' ? '' : state.label.replace('…', '')}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// The drawer over the letter
// ---------------------------------------------------------------------------

export function AgentDrawer() {
  const open = useTray((s) => s.agentOpen)
  const close = useTray((s) => s.closeAgent)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element | null
      if (!t || ref.current?.contains(t)) return
      if (t.closest?.('[data-split-agent-handle]')) return
      // Portals (the source drawer, menus, toasts) live outside main: leave the drawer open.
      if (!t.closest?.('main')) return
      close()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const inside = !!ref.current?.contains(document.activeElement)
      if (!inside && isTypingTarget(e.target)) return
      const st = useApp.getState()
      if (st.source || st.commandOpen) return
      close()
      if (inside) document.querySelector<HTMLElement>('[data-split-agent-handle]')?.focus()
    }
    document.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open, close])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          key="drawer"
          id="split-agent-drawer"
          role="dialog"
          aria-modal={false}
          aria-label="Conversation with the agent"
          initial={{ opacity: 0, x: 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.22, ease }}
          className="absolute inset-y-0 right-0 z-30 w-[400px] max-w-full border-l border-rule shadow-[var(--shadow-page)]"
        >
          <AgentPane mode="drawer" />
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// The conversation (drawer, pinned column and the phone tab share it)
// ---------------------------------------------------------------------------

let composeConsumed = 0

export function AgentPane({ mode }: { mode: 'drawer' | 'column' | 'phone' }) {
  const { messages, status, busy, stop } = useAgent()
  const engine = useEngineName()
  const state = useAgentState()
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const composeNonce = useTray((s) => s.composeNonce)
  const closeAgent = useTray((s) => s.closeAgent)
  const setAgentPinned = useTray((s) => s.setAgentPinned)
  const { question, skipped } = useQuestionState()

  // "/" or the handle asked for the message box.
  useEffect(() => {
    if (composeNonce <= composeConsumed) return
    composeConsumed = composeNonce
    const t = setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60)
    return () => clearTimeout(t)
  }, [composeNonce])

  const submit = (text: string) => {
    if (!text.trim() || busy) return
    sendPrompt(text)
    setInput('')
  }

  // The "Asked you 2 questions" pill opens the tray on them.
  const openFromChat = () => {
    const app = useApp.getState()
    app.setPane('template')
    app.setView('fields')
    if (question) askAbout(null, question, !!skipped)
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Agent">
      <header className="flex items-center justify-between gap-3 border-b border-rule py-2.5 pr-2 pl-4">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">Agent</h2>
          {state.kind === 'working' ? (
            <Shimmer as="p" className="truncate text-[11px] font-medium" duration={1.6}>
              {state.label}
            </Shimmer>
          ) : (
            <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-3">
              <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
              {engine}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {mode === 'drawer' && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8 text-ink-2" aria-label="Keep the conversation open" onClick={() => setAgentPinned(true)}>
                    <Pin className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keep open as a column</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8 text-ink-2"
                    aria-label="Close the conversation"
                    onClick={() => {
                      closeAgent()
                      document.querySelector<HTMLElement>('[data-split-agent-handle]')?.focus()
                    }}
                  >
                    <X className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent className="flex items-center gap-2">
                  Close <Kbd>Esc</Kbd>
                </TooltipContent>
              </Tooltip>
            </>
          )}
          {mode === 'column' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8 text-ink-2" aria-label="Fold the conversation into a drawer" onClick={() => setAgentPinned(false)}>
                  <PanelRightClose className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Fold into a drawer</TooltipContent>
            </Tooltip>
          )}
        </div>
      </header>

      {/* The drawer mounts on every open: land on the newest message instead of scrolling down to it. */}
      <Conversation className="min-h-0 flex-1" initial="instant">
        <ConversationContent className="gap-5 px-4 py-5">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} busy={busy} questions="pointer" onQuestionPointer={openFromChat} />
          ))}
          {status === 'submitted' && <Shimmer className="text-[13px]">Thinking…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="flex flex-col gap-2 border-t border-rule p-3">
        {!busy && (
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => submit(s)}
                className="shrink-0 rounded-full border border-rule px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:border-cobalt/40 hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <form
          className="rounded-xl border border-rule bg-panel focus-within:border-cobalt/50 focus-within:ring-2 focus-within:ring-cobalt/15"
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            Message the agent
          </label>
          <Textarea
            ref={inputRef}
            id="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(input)
              }
            }}
            placeholder="Ask about a field, or tell the agent what to change"
            className="min-h-[52px] resize-none border-0 bg-transparent px-3 pt-2.5 text-[13px] shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
          <div className="flex items-center justify-between px-2 pb-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-ink-3"
              aria-label="Attach documents"
              onClick={() => document.getElementById('source-files')?.click()}
            >
              <Paperclip className="size-4" />
            </Button>
            {busy ? (
              <Button type="button" size="icon" variant="secondary" className="size-7" onClick={() => void stop()} aria-label="Stop">
                <Square className="size-3 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon" className="size-7" disabled={!input.trim()} aria-label="Send">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </section>
  )
}
