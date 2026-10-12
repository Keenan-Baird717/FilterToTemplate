import { useChat } from '@ai-sdk/react'
import type { DynamicToolUIPart } from 'ai'
import { ArrowUp, Paperclip, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { AppUIMessage } from '../../../shared/protocol'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Message, MessageContent, MessageResponse } from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from '@/components/ai-elements/tool'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { getAgent } from '@/lib/agent-client'
import { chat, runFill } from '@/lib/chat'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { QuestionCard } from './QuestionCard'

const suggestions = ['Where did Net 30 come from?', 'Which rates did you use?', 'Why is litigation excluded?']

export interface ChatPaneProps {
  /** 'inline' renders follow-up forms in the conversation; 'pointer' shows a one-line link instead. */
  questions?: 'inline' | 'pointer'
  /** Called when the user clicks the pointer line (e.g. to reveal your own Needs-you UI). */
  onQuestionPointer?: () => void
  className?: string
}

export function ChatPane({ questions = 'inline', onQuestionPointer, className }: ChatPaneProps = {}) {
  const { messages, status, sendMessage, stop } = useChat({ chat })
  const [input, setInput] = useState('')
  const [engine, setEngine] = useState('Connecting…')
  const busy = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    getAgent().then((a) => setEngine(a.engine))
  }, [])

  const submit = (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    if (/^(run|fill).*(again|scratch)/i.test(t)) runFill()
    else void sendMessage({ text: t })
    setInput('')
  }

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-panel', className)} aria-label="Agent">
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">Agent</h2>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-3">
            <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
            {engine}
          </p>
        </div>
        <span className="shrink-0 rounded-md border border-rule px-2 py-1 font-mono text-[11px] text-ink-2" title="Model picked from listModels() at runtime">
          Copilot · auto
        </span>
      </header>

      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 px-4 py-5">
          {messages.map((m) => (
            <ChatMessage key={m.id} message={m} busy={busy} questions={questions} onQuestionPointer={onQuestionPointer} />
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
            <Button type="button" variant="ghost" size="icon" className="size-7 text-ink-3" aria-label="Attach documents" onClick={() => document.getElementById('source-files')?.click()}>
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

export function ChatMessage({
  message,
  busy,
  questions = 'inline',
  onQuestionPointer
}: {
  message: AppUIMessage
  busy: boolean
  questions?: 'inline' | 'pointer'
  onQuestionPointer?: () => void
}) {
  if (message.role === 'user') {
    const answer = message.metadata?.answer
    return (
      <Message from="user">
        <MessageContent className="max-w-[88%] rounded-xl bg-cobalt-soft px-3.5 py-2.5 text-[13px] text-ink group-[.is-user]:bg-cobalt-soft group-[.is-user]:px-3.5 group-[.is-user]:py-2.5">
          {answer ? (
            <div className="flex flex-col gap-1">
              <span className="eyebrow text-cobalt-ink">Answers</span>
              {message.parts.map((p, i) => (p.type === 'text' ? <span key={i} className="whitespace-pre-line">{p.text}</span> : null))}
            </div>
          ) : (
            message.parts.map((p, i) => (p.type === 'text' ? <span key={i}>{p.text}</span> : null))
          )}
        </MessageContent>
      </Message>
    )
  }

  return (
    <Message from="assistant" className="max-w-full">
      <MessageContent className="w-full gap-2.5 text-[13px] leading-relaxed">
        {message.parts.map((part, i) => {
          switch (part.type) {
            case 'text':
              return (
                <MessageResponse key={i} className="text-[13px] leading-relaxed [&_li]:my-0.5 [&_p]:my-1.5 [&_ul]:my-1.5">
                  {part.text}
                </MessageResponse>
              )
            case 'dynamic-tool':
              return <ToolCall key={part.toolCallId} part={part} />
            case 'data-question':
              return questions === 'inline' ? (
                <QuestionCard key={part.id ?? i} question={part.data} disabled={busy} />
              ) : (
                <QuestionPointer key={part.id ?? i} questionId={part.data.id} count={part.data.items.length} onClick={onQuestionPointer} />
              )
            default:
              return null
          }
        })}
      </MessageContent>
    </Message>
  )
}

export function ToolCall({ part }: { part: DynamicToolUIPart }) {
  return (
    <Tool className="mb-0 rounded-lg border-rule bg-panel-2/50">
      <ToolHeader
        type="dynamic-tool"
        toolName={part.toolName}
        state={part.state}
        title={part.title ?? part.toolName}
        className="gap-2 px-2.5 py-1.5 text-left [&>div]:min-w-0 [&_.rounded-full]:hidden [&_span]:truncate [&_span]:text-[12px] [&_span]:font-normal [&_span]:text-ink-2 [&_svg]:size-3.5 [&_svg]:shrink-0"
      />
      <ToolContent className="space-y-3 border-t border-rule p-3">
        <div className="font-mono text-[11px] text-ink-3">{part.toolName}</div>
        <ToolInput input={part.input} className="[&_h4]:text-[10px] [&_pre]:p-2 [&_pre]:text-[11px]" />
        {part.state === 'output-available' && (
          <ToolOutput output={part.output} errorText={undefined} className="[&_h4]:text-[10px] [&_pre]:p-2 [&_pre]:text-[11px]" />
        )}
      </ToolContent>
    </Tool>
  )
}

function QuestionPointer({ questionId, count, onClick }: { questionId: string; count: number; onClick?: () => void }) {
  const answered = useApp((s) => s.answered[questionId])
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-fit items-center gap-2 rounded-full border border-rule px-3 py-1 text-[12px] text-ink-2 transition-colors hover:border-cobalt/40 hover:text-ink"
    >
      <span className={cn('size-1.5 rounded-full', answered ? 'bg-ok' : 'bg-warn')} aria-hidden />
      {answered ? (answered === 'skipped' ? 'Questions skipped' : 'Answered') : `Asked you ${count} question${count === 1 ? '' : 's'}`}
    </button>
  )
}
