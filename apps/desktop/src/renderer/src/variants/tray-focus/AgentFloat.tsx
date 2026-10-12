import { ArrowUp, MessagesSquare, PanelRightClose, PanelRightOpen, Paperclip, Square, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { ChatMessage } from '@/components/ChatPane'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { sendPrompt, useAgent, useEngineName } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { isTypingTarget, useFocus, useTray } from './state'

const suggestions = ['Where did Net 30 come from?', 'Which rates did you use?', 'Why is litigation excluded?']
const ease = [0.22, 1, 0.36, 1] as const

// ---------------------------------------------------------------------------
// What the agent is doing, and whether it said something the user hasn't seen
// ---------------------------------------------------------------------------

/** A short live label while the agent works, else null. */
export function useAgentLabel() {
  const { busy, activity, status, messages } = useAgent()
  if (!busy) return null
  if (activity) return activity
  const last = messages.at(-1)
  const running = last?.role === 'assistant' && last.parts.some((p) => p.type === 'dynamic-tool' && p.state !== 'output-available')
  if (running) return 'Checking the documents'
  return status === 'submitted' ? 'Thinking' : 'Answering'
}

/** The newest reply to a question the user typed (answers to the tray and refills don't count). */
function useLatestReply() {
  const { messages } = useAgent()
  return useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role !== 'assistant') continue
      const asked = messages.slice(0, i).findLast((x) => x.role === 'user')
      if (!asked || asked.metadata?.answer || asked.metadata?.command) return null
      const text = m.parts
        .map((p) => (p.type === 'text' ? p.text : ''))
        .join(' ')
        .replace(/[*_`#>]/g, '')
        .trim()
      return text ? { id: m.id, text } : null
    }
    return null
  }, [messages])
}

/** Mount once: keeps "New reply" honest (seen while the conversation is on screen). */
export function useReplyTracking(visible: boolean) {
  const latest = useLatestReply()
  const markSeen = useFocus((s) => s.markSeen)
  const seen = useFocus((s) => s.seenReply)
  // What was already there when the prototype opened counts as seen.
  useEffect(() => {
    if (useFocus.getState().seenReply === null) markSeen(latest?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => {
    if (visible && latest && latest.id !== seen) markSeen(latest.id)
  }, [visible, latest, seen, markSeen])
}

function useUnreadReply() {
  const latest = useLatestReply()
  const seen = useFocus((s) => s.seenReply)
  const { busy } = useAgent()
  return !busy && latest && seen !== null && latest.id !== seen ? latest : null
}

// ---------------------------------------------------------------------------
// Keyboard: "/" opens the composer, Escape closes the floating panel
// ---------------------------------------------------------------------------

export function useAgentKeys() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const app = useApp.getState()
      if (app.commandOpen || app.source) return
      if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        useFocus.getState().openAgent()
      } else if (e.key === 'Escape' && useFocus.getState().agentOpen && !isTypingTarget(e.target)) {
        useFocus.getState().closeAgent()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

// ---------------------------------------------------------------------------
// Pieces shared by the floating panel, the pinned column and the phone sheet
// ---------------------------------------------------------------------------

function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex size-2 shrink-0', className)} aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-cobalt opacity-60" />
      <span className="relative size-2 rounded-full bg-cobalt" />
    </span>
  )
}

function PanelHeader({ title, actions }: { title?: ReactNode; actions: ReactNode }) {
  const engine = useEngineName()
  const label = useAgentLabel()
  return (
    <header className="flex shrink-0 items-center gap-2 border-b border-rule py-2 pr-2 pl-4">
      <div className="min-w-0 flex-1">
        {title ?? <h2 className="text-[13px] font-semibold">Agent</h2>}
        {label ? (
          <p className="flex items-center gap-1.5 text-[11px]">
            <LiveDot className="size-1.5" />
            <Shimmer as="span" className="truncate text-[11px] font-medium" duration={1.6}>{`${label}…`}</Shimmer>
          </p>
        ) : (
          <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-3">
            <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            {engine}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">{actions}</div>
    </header>
  )
}

function AgentConversation({ onQuestionPointer }: { onQuestionPointer: () => void }) {
  const { messages, status, busy } = useAgent()
  return (
    <Conversation className="min-h-0 flex-1">
      <ConversationContent className="gap-5 px-4 py-4">
        {messages.map((m) => (
          <ChatMessage key={m.id} message={m} busy={busy} questions="pointer" onQuestionPointer={onQuestionPointer} />
        ))}
        {status === 'submitted' && <Shimmer className="text-[13px]">Thinking…</Shimmer>}
      </ConversationContent>
      <ConversationScrollButton className="bottom-3" />
    </Conversation>
  )
}

function Suggestions({ className }: { className?: string }) {
  const { busy, messages } = useAgent()
  const asked = useMemo(
    () => new Set(messages.filter((m) => m.role === 'user').flatMap((m) => m.parts.map((p) => (p.type === 'text' ? p.text : '')))),
    [messages]
  )
  const left = suggestions.filter((s) => !asked.has(s))
  if (busy || !left.length) return null
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {left.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => sendPrompt(s)}
          className="shrink-0 rounded-full border border-rule bg-panel px-2.5 py-1 text-[12px] text-ink-2 transition-colors hover:border-cobalt/40 hover:text-ink"
        >
          {s}
        </button>
      ))}
    </div>
  )
}

function Composer({ variant, onEscape }: { variant: 'float' | 'column' | 'sheet'; onEscape?: () => void }) {
  const draft = useFocus((s) => s.draft)
  const setDraft = useFocus((s) => s.setDraft)
  const nonce = useFocus((s) => s.composerNonce)
  const { busy, stop } = useAgent()
  const ref = useRef<HTMLTextAreaElement>(null)
  const id = `focus-composer-${variant}`

  // Take focus when asked ("/", the pill, pinning), before the next keystroke
  // arrives, so typing straight after "/" lands in the box. Not on page load.
  useLayoutEffect(() => {
    if (variant !== 'sheet' && nonce > 0) ref.current?.focus({ preventScroll: true })
  }, [nonce, variant])

  const submit = () => {
    const t = draft.trim()
    if (!t || busy) return
    sendPrompt(t)
    setDraft('')
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      className={cn(
        'flex items-end gap-1 border border-rule bg-panel p-1.5 transition-[border-color,box-shadow] focus-within:border-cobalt/50 focus-within:ring-2 focus-within:ring-cobalt/15',
        variant === 'float' ? 'rounded-[22px] shadow-[var(--shadow-page)]' : 'rounded-xl'
      )}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8 rounded-full text-ink-3"
        aria-label="Add documents"
        onClick={() => document.getElementById('source-files')?.click()}
      >
        <Paperclip className="size-4" />
      </Button>
      <label htmlFor={id} className="sr-only">
        Message the agent
      </label>
      <Textarea
        ref={ref}
        id={id}
        rows={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          } else if (e.key === 'Escape' && onEscape) {
            e.preventDefault()
            e.stopPropagation()
            onEscape()
          }
        }}
        placeholder="Ask about a field or request a change"
        className="max-h-36 min-h-8 flex-1 resize-none border-0 bg-transparent px-1 py-1.5 text-[13px] shadow-none focus-visible:ring-0 md:text-[13px] dark:bg-transparent"
      />
      {busy ? (
        <Button type="button" size="icon" variant="secondary" className="size-8 rounded-full" onClick={() => void stop()} aria-label="Stop the agent">
          <Square className="size-3 fill-current" />
        </Button>
      ) : (
        <Button type="submit" size="icon" className="size-8 rounded-full" disabled={!draft.trim()} aria-label="Send">
          <ArrowUp className="size-4" />
        </Button>
      )}
    </form>
  )
}

/** The closed state: one calm line that says what the agent is up to. */
function ComposerPill({ onOpen, keyHint, pillRef }: { onOpen: () => void; keyHint?: boolean; pillRef?: React.Ref<HTMLButtonElement> }) {
  const label = useAgentLabel()
  const unread = useUnreadReply()
  const draft = useFocus((s) => s.draft)

  return (
    <button
      ref={pillRef}
      type="button"
      onClick={onOpen}
      aria-keyshortcuts={keyHint ? '/' : undefined}
      aria-haspopup="dialog"
      className={cn(
        'flex h-11 w-full items-center gap-2.5 rounded-full border bg-panel pr-2.5 pl-4 text-left shadow-[var(--shadow-page)] transition-colors',
        label || unread ? 'border-cobalt/35 hover:border-cobalt/60' : 'border-rule hover:border-cobalt/40'
      )}
    >
      {label ? (
        <LiveDot />
      ) : (
        <span className="relative shrink-0">
          <MessagesSquare className={cn('size-4', unread ? 'text-cobalt-ink' : 'text-ink-3')} aria-hidden />
          {unread && <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-cobalt ring-2 ring-panel" aria-hidden />}
        </span>
      )}
      <span className="min-w-0 flex-1 truncate text-[13px]">
        {label ? (
          <Shimmer as="span" className="text-[13px] font-medium" duration={1.6}>{`${label}…`}</Shimmer>
        ) : unread ? (
          <>
            <span className="font-medium text-ink">New reply</span> <span className="text-ink-2">{unread.text}</span>
          </>
        ) : draft.trim() ? (
          <span className="text-ink-2">{draft}</span>
        ) : (
          <span className="text-ink-3">Ask the agent…</span>
        )}
      </span>
      {keyHint && !label && <Kbd className="border border-rule bg-panel-2 font-mono text-[11px]">/</Kbd>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// Desktop: floating composer and panel
// ---------------------------------------------------------------------------

export function FloatingAgent({ onQuestionPointer }: { onQuestionPointer: () => void }) {
  const open = useFocus((s) => s.agentOpen)
  const openAgent = useFocus((s) => s.openAgent)
  const closeAgent = useFocus((s) => s.closeAgent)
  const setAgentPinned = useFocus((s) => s.setAgentPinned)
  const pillRef = useRef<HTMLButtonElement>(null)
  const [refocus, setRefocus] = useState(false)
  const unread = useUnreadReply()

  const close = () => {
    setRefocus(true)
    closeAgent()
  }
  useEffect(() => {
    if (!open && refocus) {
      setRefocus(false)
      pillRef.current?.focus()
    }
  }, [open, refocus])

  return (
    <div
      className="pointer-events-none absolute right-5 bottom-5 z-30 flex flex-col items-end gap-2"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation()
          close()
        }
      }}
    >
      <AnimatePresence>
        {open && (
          <motion.div
            key="panel"
            role="dialog"
            aria-modal={false}
            aria-label="Agent"
            initial={{ opacity: 0, y: 14, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.22, ease }}
            style={{ transformOrigin: 'bottom right' }}
            className="pointer-events-auto flex h-[560px] max-h-[calc(100dvh-220px)] w-[420px] flex-col overflow-hidden rounded-xl border border-rule bg-panel shadow-[var(--shadow-page)]"
          >
            <PanelHeader
              actions={
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 text-ink-2" aria-label="Pin to the side" onClick={() => setAgentPinned(true)}>
                        <PanelRightOpen className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Keep open as a column</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8 text-ink-2" aria-label="Close" onClick={close}>
                        <X className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      Close <Kbd className="ml-1">Esc</Kbd>
                    </TooltipContent>
                  </Tooltip>
                </>
              }
            />
            <AgentConversation onQuestionPointer={onQuestionPointer} />
            <Suggestions className="shrink-0 border-t border-rule px-3 py-2.5" />
          </motion.div>
        )}
      </AnimatePresence>
      <motion.div className="pointer-events-auto" initial={false} animate={{ width: open ? 420 : unread ? 340 : 240 }} transition={{ duration: 0.22, ease }}>
        {open ? <Composer variant="float" onEscape={close} /> : <ComposerPill onOpen={openAgent} keyHint pillRef={pillRef} />}
      </motion.div>
    </div>
  )
}

/** Desktop, pinned: the conversation as a side column. */
export function AgentColumn({ onQuestionPointer }: { onQuestionPointer: () => void }) {
  const setAgentPinned = useFocus((s) => s.setAgentPinned)
  return (
    <section aria-label="Agent" className="flex h-full min-h-0 flex-col border-l border-rule bg-panel">
      <PanelHeader
        actions={
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 text-ink-2" aria-label="Unpin the agent" onClick={() => setAgentPinned(false)}>
                <PanelRightClose className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to the floating composer</TooltipContent>
          </Tooltip>
        }
      />
      <AgentConversation onQuestionPointer={onQuestionPointer} />
      <div className="flex shrink-0 flex-col gap-2 border-t border-rule p-3">
        <Suggestions />
        <Composer variant="column" />
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Phones: the pill opens a full-screen sheet
// ---------------------------------------------------------------------------

export function PhoneAgent({ onQuestionPointer }: { onQuestionPointer: () => void }) {
  const open = useFocus((s) => s.agentOpen)
  const openAgent = useFocus((s) => s.openAgent)
  const closeAgent = useFocus((s) => s.closeAgent)
  // The open tray's buttons sit at the bottom of a phone screen: step aside meanwhile.
  const trayOpen = useTray((s) => s.expanded)
  const onTemplate = useApp((s) => s.pane !== 'sources')
  return (
    <>
      <AnimatePresence initial={false}>
        {!(trayOpen && onTemplate) && (
          <motion.div
            key="pill"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease }}
            className="absolute right-4 bottom-4 z-30 w-[min(232px,calc(100%-32px))]"
          >
            <ComposerPill onOpen={openAgent} />
          </motion.div>
        )}
      </AnimatePresence>
      <Sheet open={open} onOpenChange={(o) => (o ? openAgent() : closeAgent())}>
        <SheetContent side="bottom" showCloseButton={false} aria-describedby={undefined} className="h-[100dvh] gap-0 border-0 bg-panel p-0">
          <PanelHeader
            title={<SheetTitle className="text-[13px] font-semibold">Agent</SheetTitle>}
            actions={
              <Button variant="ghost" size="icon" className="size-9 text-ink-2" aria-label="Close" onClick={closeAgent}>
                <X className="size-4.5" />
              </Button>
            }
          />
          <AgentConversation onQuestionPointer={onQuestionPointer} />
          <div className="flex shrink-0 flex-col gap-2 border-t border-rule p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
            <Suggestions />
            <Composer variant="sheet" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
