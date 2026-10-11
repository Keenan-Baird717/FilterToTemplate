import type { DynamicToolUIPart } from 'ai'
import { ArrowUp, Check, LoaderCircle, MessagesSquare, Sparkles, Square, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { AppUIMessage } from '../../../../shared/protocol'
import { ChatMessage } from '@/components/ChatPane'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { MessageResponse } from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { sendPrompt, useAgent, useEngineName } from '@/lib/agent'
import { cn } from '@/lib/utils'
import { Key } from './bits'
import { itemById, suggestionsFor } from './model'
import { useTriage } from './state'

const lastOf = (messages: AppUIMessage[], role: AppUIMessage['role']) => {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].role === role) return { message: messages[i], index: i }
  return null
}

const textOf = (m: AppUIMessage) =>
  m.parts
    .map((p) => (p.type === 'text' ? p.text : ''))
    .join(' ')
    .trim()

/**
 * Command-bar access to the agent, scoped to the selected item. The latest
 * reply shows in a compact panel; the full conversation opens in a drawer.
 */
export function AgentBar() {
  const { messages, status, busy, activity, stop } = useAgent()
  const selected = useTriage((s) => s.selected)
  const dismissed = useTriage((s) => s.dismissed)
  const dismiss = useTriage((s) => s.dismiss)
  const setTranscriptOpen = useTriage((s) => s.setTranscriptOpen)
  const item = itemById[selected]
  const [text, setText] = useState('')
  const [scoped, setScoped] = useState(true)
  const [focused, setFocused] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const user = lastOf(messages, 'user')
  const reply = lastOf(messages, 'assistant')
  const latest = useRef({ busy, replyId: reply?.message.id ?? null })
  latest.current = { busy, replyId: reply?.message.id ?? null }

  // A finished reply belongs to the item it was about; moving on clears it.
  useEffect(() => {
    setScoped(true)
    if (!latest.current.busy && latest.current.replyId) dismiss(latest.current.replyId)
  }, [selected, dismiss])
  const replyIsFresh = reply && (!user || reply.index > user.index)
  const waiting = status === 'submitted' || (busy && !replyIsFresh)
  const panelKey = waiting ? `wait-${user?.message.id}` : reply?.message.id
  const showPanel = busy || (!!reply && reply.message.id !== dismissed)

  const ask = (q: string, fromSuggestion = false) => {
    const t = q.trim()
    if (!t || busy) return
    sendPrompt(scoped && item && !fromSuggestion ? `About ${item.label}: ${t}` : t)
    setText('')
    dismiss(null)
  }

  const suggestions = suggestionsFor(selected)

  return (
    <div className="border-t border-rule bg-panel px-4 pt-2 pb-3 sm:px-8">
      <div className="mx-auto flex max-w-[960px] flex-col gap-2">
        <AnimatePresence initial={false}>
          {showPanel && (
            <motion.div
              key="panel"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="overflow-hidden"
            >
              <div className="flex max-h-[min(32vh,240px)] flex-col overflow-hidden rounded-[6px] border border-rule bg-panel-2/50" aria-live="polite">
                <div className="flex items-center gap-2 border-b border-rule px-3 py-1.5 text-[12px]">
                  {busy ? <LoaderCircle className="size-3.5 animate-spin text-cobalt" aria-hidden /> : <Sparkles className="size-3.5 text-cobalt" aria-hidden />}
                  <span className="min-w-0 flex-1 truncate text-ink-2">
                    {user ? (
                      <>
                        <span className="text-ink-3">{user.message.metadata?.answer ? 'Your answers' : user.message.metadata?.command ? 'You' : 'You asked'} · </span>
                        {user.message.metadata?.answer ? textOf(user.message).replace(/\n/g, ' · ') : textOf(user.message)}
                      </>
                    ) : (
                      'Agent'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setTranscriptOpen(true)}
                    className="shrink-0 rounded-[4px] px-1.5 py-0.5 text-ink-3 transition-colors hover:bg-panel hover:text-ink"
                  >
                    Full conversation
                  </button>
                  {!busy && (
                    <button
                      type="button"
                      aria-label="Close the reply"
                      onClick={() => dismiss(reply?.message.id ?? null)}
                      className="shrink-0 rounded-[4px] p-0.5 text-ink-3 transition-colors hover:bg-panel hover:text-ink"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <div key={panelKey} className="triage-scroll min-h-0 overflow-y-auto px-3 py-2">
                  {waiting || !reply ? (
                    <Shimmer className="text-[13px]">{activity ? `${activity}…` : 'Thinking…'}</Shimmer>
                  ) : (
                    <ReplyBody message={reply.message} activity={busy ? activity : null} />
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {focused && !text && !busy && (
          <div className="flex flex-wrap gap-1.5" aria-label="Suggested questions">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => ask(s, true)}
                className="h-6 rounded-[4px] border border-rule px-2 text-[12px] text-ink-2 transition-colors hover:border-cobalt/40 hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <form
            className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-[6px] border border-rule bg-panel pr-1 pl-2.5 transition-[border-color,box-shadow] focus-within:border-cobalt/60 focus-within:ring-[3px] focus-within:ring-cobalt/15"
            onSubmit={(e) => {
              e.preventDefault()
              ask(text)
            }}
          >
            <Sparkles className="size-3.5 shrink-0 text-cobalt" aria-hidden />
            {scoped && item && (
              <button
                type="button"
                onClick={() => {
                  setScoped(false)
                  inputRef.current?.focus()
                }}
                className="group/token inline-flex h-6 max-w-[45%] shrink-0 items-center gap-1 rounded-[4px] bg-panel-2 px-1.5 text-[12px] text-ink-2 hover:text-ink"
                aria-label={`Stop scoping the question to ${item.label}`}
              >
                <span className="truncate">{item.label}</span>
                <X className="size-3 shrink-0 text-ink-3 group-hover/token:text-ink" />
              </button>
            )}
            <label htmlFor="triage-ask" className="sr-only">
              Ask the agent
            </label>
            <input
              ref={inputRef}
              id="triage-ask"
              value={text}
              autoComplete="off"
              onChange={(e) => setText(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') inputRef.current?.blur()
                if (e.key === 'Backspace' && !text && scoped) setScoped(false)
              }}
              placeholder={scoped && item ? `Ask about ${item.label}…` : 'Ask the agent anything…'}
              className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
            />
            {!focused && !text && <Key className="hidden sm:inline-flex">/</Key>}
            {busy ? (
              <Button type="button" size="icon" variant="secondary" className="size-7 rounded-[4px]" onClick={() => void stop()} aria-label="Stop the agent">
                <Square className="size-3 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon" className="size-7 rounded-[4px]" disabled={!text.trim()} aria-label="Send question">
                <ArrowUp className="size-4" />
              </Button>
            )}
          </form>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 rounded-[6px] text-ink-2"
            onClick={() => setTranscriptOpen(true)}
            aria-label="Open the full conversation"
            title="Full conversation"
          >
            <MessagesSquare className="size-4" />
          </Button>
        </div>
      </div>
      <TranscriptSheet />
    </div>
  )
}

function ReplyBody({ message, activity }: { message: AppUIMessage; activity: string | null }) {
  const [showSteps, setShowSteps] = useState(false)
  const tools = message.parts.filter((p): p is DynamicToolUIPart => p.type === 'dynamic-tool')
  // While the agent works every step is listed; once done they fold into one line.
  const fold = !activity && tools.length > 1 && !showSteps
  let foldedShown = false
  return (
    <div className="flex flex-col gap-1.5 text-[13px] leading-relaxed text-ink">
      {message.parts.map((part, i) => {
        if (part.type === 'dynamic-tool' && fold) {
          if (foldedShown) return null
          foldedShown = true
          return (
            <button
              key="steps"
              type="button"
              onClick={() => setShowSteps(true)}
              className="flex w-fit items-center gap-2 rounded-[4px] text-left text-[12px] text-ink-2 hover:text-ink"
            >
              <Check className="size-3 shrink-0 text-ok" strokeWidth={3} aria-hidden />
              Ran {tools.length} steps
              <span className="text-ink-3 underline decoration-rule underline-offset-2">Show steps</span>
            </button>
          )
        }
        if (part.type === 'text') {
          return (
            <MessageResponse key={i} className="text-[13px] leading-relaxed [&_li]:my-0.5 [&_p]:my-1 [&_ul]:my-1">
              {part.text}
            </MessageResponse>
          )
        }
        if (part.type === 'dynamic-tool') return <ToolLine key={part.toolCallId} part={part} />
        if (part.type === 'data-question') {
          return (
            <p key={part.id ?? i} className="text-[12px] text-ink-2">
              Asked {part.data.items.length} questions. They’re at the top of <span className="font-medium text-ink">Needs you</span>.
            </p>
          )
        }
        return null
      })}
      {activity && <Shimmer className="text-[12px]">{`${activity}…`}</Shimmer>}
    </div>
  )
}

function ToolLine({ part }: { part: DynamicToolUIPart }) {
  const done = part.state === 'output-available'
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-2">
      {done ? <Check className="size-3 shrink-0 text-ok" strokeWidth={3} aria-hidden /> : <LoaderCircle className="size-3 shrink-0 animate-spin text-cobalt" aria-hidden />}
      <span className="truncate">{part.title ?? part.toolName}</span>
      <span className="hidden shrink-0 font-mono text-[11px] text-ink-3 sm:inline">{part.toolName}</span>
    </div>
  )
}

function TranscriptSheet() {
  const open = useTriage((s) => s.transcriptOpen)
  const setOpen = useTriage((s) => s.setTranscriptOpen)
  const { messages, status, busy } = useAgent()
  const engine = useEngineName()
  const [text, setText] = useState('')

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full gap-0 border-rule bg-panel p-0 sm:max-w-[520px]">
        <SheetHeader className="gap-0.5 border-b border-rule px-5 pt-4 pb-3">
          <SheetTitle className="text-[14px]">Conversation</SheetTitle>
          <SheetDescription className="flex items-center gap-1.5 text-[12px]">
            <span className={cn('size-1.5 rounded-full', busy ? 'bg-cobalt' : 'bg-ink-3')} aria-hidden />
            {engine}
          </SheetDescription>
        </SheetHeader>
        <Conversation className="min-h-0 flex-1">
          <ConversationContent className="gap-5 px-5 py-5">
            {messages.map((m) => (
              <ChatMessage key={m.id} message={m} busy={busy} />
            ))}
            {status === 'submitted' && <Shimmer className="text-[13px]">Thinking…</Shimmer>}
          </ConversationContent>
          <ConversationScrollButton />
        </Conversation>
        <form
          className="flex items-center gap-2 border-t border-rule p-3"
          onSubmit={(e) => {
            e.preventDefault()
            if (!text.trim() || busy) return
            sendPrompt(text)
            setText('')
          }}
        >
          <label htmlFor="triage-transcript-input" className="sr-only">
            Message the agent
          </label>
          <input
            id="triage-transcript-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Message the agent"
            className="h-9 min-w-0 flex-1 rounded-[6px] border border-rule bg-panel px-3 text-[13px] outline-none placeholder:text-ink-3 focus:border-cobalt/60 focus:ring-[3px] focus:ring-cobalt/15"
          />
          <Button type="submit" size="icon" className="size-9 rounded-[6px]" disabled={!text.trim() || busy} aria-label="Send message">
            <ArrowUp className="size-4" />
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
