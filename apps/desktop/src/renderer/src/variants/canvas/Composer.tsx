import type { DynamicToolUIPart } from 'ai'
import { ArrowUp, Check, ChevronDown, ChevronRight, CircleHelp, LoaderCircle, MessagesSquare, Square, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import type { AppUIMessage, QuestionSet } from '../../../../shared/protocol'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { MessageResponse } from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Kbd } from '@/components/ui/kbd'
import { sendPrompt, skipQuestion, useAgent, useEngineName, useOpenQuestion, useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { AnswerDots, sendDraft } from './FieldCard'
import { draftProgress, isItemAnswered, nextToReview, useCanvas, useDraft } from './model'

// The agent lives in one floating bar at the bottom of the desk. Above it, one
// line at a time: the open questions, the live activity, or the last reply.

const suggestions = ['Where did Net 30 come from?', 'Which rates did you use?', 'Why is litigation excluded?']

const float = 'pointer-events-auto border border-rule bg-panel shadow-[var(--cv-float)]'
const enter = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 4, transition: { duration: 0.12 } }, transition: { duration: 0.2 } }

function latestTool(messages: AppUIMessage[]): DynamicToolUIPart | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return null
  for (let i = last.parts.length - 1; i >= 0; i--) {
    const p = last.parts[i]
    if (p.type === 'dynamic-tool') return p
  }
  return null
}

function lastReply(messages: AppUIMessage[]): string | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return null
  const texts = last.parts.filter((p) => p.type === 'text')
  const t = texts[texts.length - 1]
  return t && t.type === 'text' ? t.text.replace(/\*\*?|^- /gm, '').replace(/\s+/g, ' ').trim() : null
}

export function Composer({ hidden }: { hidden?: boolean }) {
  const { messages, status, busy, activity, stop } = useAgent()
  const question = useOpenQuestion()
  const summary = useSummary()
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const sheetOpen = useCanvas((s) => s.sheetOpen)
  const setSheetOpen = useCanvas((s) => s.setSheetOpen)
  const text = useCanvas((s) => s.composerText)
  const setText = useCanvas((s) => s.setComposerText)
  const focusTick = useCanvas((s) => s.composerFocus)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [peek, setPeek] = useState<string | null>(null)
  const wasBusy = useRef(busy)

  useEffect(() => {
    if (focusTick) inputRef.current?.focus()
  }, [focusTick])

  // When a run finishes out of sight, show its last line for a moment.
  useEffect(() => {
    if (wasBusy.current && !busy && !useCanvas.getState().sheetOpen) setPeek(lastReply(messages))
    if (busy) setPeek(null)
    wasBusy.current = busy
  }, [busy, messages])
  useEffect(() => {
    if (!peek) return
    const t = setTimeout(() => setPeek(null), 14000)
    return () => clearTimeout(t)
  }, [peek])

  // "/" jumps to the composer from anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return
      const a = document.activeElement as HTMLElement | null
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return
      e.preventDefault()
      inputRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const submit = (value: string) => {
    const t = value.trim()
    if (!t || busy) return
    sendPrompt(t)
    setText('')
    setSheetOpen(true)
  }

  if (hidden) return null

  const tool = latestTool(messages)
  const reviewFrom = summary.done === summary.total ? nextToReview(fields, rates) : null
  const turns = messages.filter((m) => m.role === 'user').length

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-2 px-4 pb-4 sm:pb-5">
      <AnimatePresence mode="popLayout" initial={false}>
        {!sheetOpen && busy ? (
          <motion.div key="ticker" {...enter} className={cn(float, 'flex h-9 max-w-full min-w-0 items-center gap-2.5 rounded-full pr-1.5 pl-3.5 text-[12px]')} role="status" aria-live="polite">
            <span className="relative flex size-2 shrink-0" aria-hidden>
              <span className="cv-ping absolute inset-0 rounded-full bg-cobalt" />
              <span className="relative size-2 rounded-full bg-cobalt" />
            </span>
            <Shimmer as="span" className="shrink-0 font-medium" duration={1.6}>
              {`${activity ?? (status === 'submitted' ? 'Thinking' : 'Working')}…`}
            </Shimmer>
            {tool?.title && (
              <>
                <span className="hidden text-ink-3 sm:inline" aria-hidden>
                  ·
                </span>
                <span className="hidden min-w-0 truncate text-ink-2 sm:inline">{tool.title}</span>
              </>
            )}
            <Button variant="ghost" size="sm" className="h-7 shrink-0 rounded-full px-2.5 text-[12px] text-cobalt hover:text-cobalt" onClick={() => setSheetOpen(true)}>
              Show steps
            </Button>
          </motion.div>
        ) : !sheetOpen && question ? (
          <QuestionTray key={`tray-${question.id}`} question={question} />
        ) : !sheetOpen && peek ? (
          <motion.div key="peek" {...enter} className={cn(float, 'flex w-full max-w-[680px] items-start gap-3 rounded-xl py-2.5 pr-2 pl-4')} role="status">
            <span className="mt-1.5 size-2 shrink-0 rounded-full bg-cobalt" aria-hidden />
            <p className="line-clamp-2 min-w-0 flex-1 text-[13px] leading-snug text-ink">{peek}</p>
            {reviewFrom ? (
              <Button
                size="sm"
                className="h-7 shrink-0 px-2.5 text-[12px]"
                onClick={() => {
                  setPeek(null)
                  useCanvas.getState().openField(reviewFrom, { scroll: true, focus: true })
                }}
              >
                Review values
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[12px] text-cobalt hover:text-cobalt" onClick={() => setSheetOpen(true)}>
                See conversation
              </Button>
            )}
            <Button variant="ghost" size="icon" className="size-7 shrink-0 text-ink-3" aria-label="Dismiss" onClick={() => setPeek(null)}>
              <X className="size-3.5" />
            </Button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <motion.div
        layout
        transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}
        className={cn(float, 'w-full max-w-[680px] overflow-hidden rounded-2xl')}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && sheetOpen) {
            e.stopPropagation()
            setSheetOpen(false)
            inputRef.current?.focus()
          }
        }}
      >
        <AnimatePresence initial={false}>
          {sheetOpen && (
            <motion.div
              key="sheet"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.2, 0.8, 0.2, 1] }}
              className="overflow-hidden"
            >
              <ConversationSheet onClose={() => setSheetOpen(false)} onSuggest={submit} />
            </motion.div>
          )}
        </AnimatePresence>

        <form
          className="flex items-end gap-1.5 p-1.5"
          onSubmit={(e) => {
            e.preventDefault()
            submit(text)
          }}
        >
          <Button
            type="button"
            variant="ghost"
            className={cn('h-9 shrink-0 gap-1.5 rounded-xl px-2.5 text-[12px] text-ink-2', sheetOpen && 'bg-panel-2 text-ink')}
            aria-expanded={sheetOpen}
            aria-label={sheetOpen ? 'Hide conversation' : 'Show conversation'}
            onClick={() => setSheetOpen(!sheetOpen)}
          >
            {sheetOpen ? <ChevronDown className="size-4" /> : <MessagesSquare className="size-4" />}
            <span className="num hidden sm:inline">{turns}</span>
          </Button>
          <label htmlFor="cv-composer" className="sr-only">
            Ask or instruct the agent
          </label>
          <textarea
            id="cv-composer"
            ref={inputRef}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit(text)
              }
            }}
            placeholder="Ask or instruct the agent…"
            className="field-sizing-content max-h-32 min-h-9 min-w-0 flex-1 resize-none bg-transparent px-1.5 py-2 text-[14px] leading-5 text-ink outline-none placeholder:text-ink-3"
          />
          {!text && !busy && <Kbd className="mb-2 hidden shrink-0 bg-panel-2 font-mono text-[11px] text-ink-3 sm:inline-flex">/</Kbd>}
          {busy ? (
            <Button type="button" size="icon" variant="secondary" className="size-9 shrink-0 rounded-xl" onClick={() => void stop()} aria-label="Stop the agent">
              <Square className="size-3 fill-current" />
            </Button>
          ) : (
            <Button type="submit" size="icon" className="size-9 shrink-0 rounded-xl" disabled={!text.trim()} aria-label="Send">
              <ArrowUp className="size-4" />
            </Button>
          )}
        </form>
      </motion.div>
    </div>
  )
}

function QuestionTray({ question }: { question: QuestionSet }) {
  const draft = useDraft(question)
  const openField = useCanvas((s) => s.openField)
  const p = draftProgress(question, draft)
  const next = question.items.find((i) => !isItemAnswered(i, draft[i.fieldId]))
  return (
    <motion.div {...enter} className={cn(float, 'flex h-10 max-w-full min-w-0 items-center gap-2 rounded-full pr-1 pl-4')} role="region" aria-label="Open questions">
      <AnswerDots question={question} draft={draft} />
      <span className="num min-w-0 truncate text-[13px] text-ink">
        {p.answered === 0 ? (
          <>
            <span className="font-medium">{question.items.length} questions</span>
            <span className="hidden text-ink-2 sm:inline"> marked on the page</span>
          </>
        ) : (
          <>
            <span className="font-medium">{p.answered}</span> of {p.total} answered
          </>
        )}
      </span>
      <div className="flex shrink-0 items-center gap-1">
        {p.answered === 0 && (
          <Button variant="ghost" size="sm" className="h-8 rounded-full px-3 text-[12px] text-ink-2" onClick={() => skipQuestion(question)}>
            Skip for now
          </Button>
        )}
        {next && (
          <Button
            size="sm"
            variant={p.ready ? 'ghost' : 'default'}
            className="h-8 rounded-full px-3.5 text-[12px]"
            onClick={() => openField(next.fieldId, { scroll: true, focus: true })}
          >
            {p.answered === 0 ? 'Answer' : 'Next question'}
          </Button>
        )}
        {p.answered > 0 && p.ready && (
          <Button size="sm" className="h-8 rounded-full px-3.5 text-[12px]" onClick={() => sendDraft(question, draft)}>
            Send answers
          </Button>
        )}
      </div>
    </motion.div>
  )
}

function ConversationSheet({ onClose, onSuggest }: { onClose: () => void; onSuggest: (t: string) => void }) {
  const { messages, status, busy } = useAgent()
  const engine = useEngineName()
  return (
    <section aria-label="Conversation with the agent" className="flex h-[min(58vh,540px)] flex-col border-b border-rule">
      <header className="flex items-center gap-2 border-b border-rule py-2 pr-2 pl-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-[13px] font-semibold">Agent</h2>
          <p className="flex items-center gap-1.5 truncate text-[11px] text-ink-3">
            <span className={cn('size-1.5 shrink-0 rounded-full', busy ? 'bg-cobalt' : 'bg-ok')} aria-hidden />
            {engine}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-8 text-ink-3" aria-label="Hide conversation" onClick={onClose}>
          <ChevronDown className="size-4" />
        </Button>
      </header>
      <Conversation className="min-h-0 flex-1">
        <ConversationContent className="gap-5 px-4 py-4">
          {messages.map((m) => (
            <Turn key={m.id} message={m} />
          ))}
          {status === 'submitted' && <Shimmer className="text-[13px]">Thinking…</Shimmer>}
        </ConversationContent>
        <ConversationScrollButton className="bottom-3 size-8" />
      </Conversation>
      {!busy && (
        <div className="flex gap-1.5 overflow-x-auto px-3 py-2 [scrollbar-width:none]">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggest(s)}
              className="shrink-0 rounded-full border border-rule px-2.5 py-1 text-[12px] whitespace-nowrap text-ink-2 transition-colors hover:border-cobalt/40 hover:bg-cobalt-soft hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function Turn({ message }: { message: AppUIMessage }) {
  if (message.role === 'user') {
    const answer = message.metadata?.answer
    const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('\n')
    return (
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-md bg-cobalt-soft px-3.5 py-2 text-[13px] leading-relaxed text-ink">
        {answer && <p className="text-[11px] font-medium text-cobalt">Your answers</p>}
        <p className="whitespace-pre-line">{text}</p>
      </div>
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      {message.parts.map((part, i) => {
        switch (part.type) {
          case 'text':
            return (
              <MessageResponse key={i} className="text-[13px] leading-relaxed text-ink [&_li]:my-0.5 [&_p]:my-1.5 [&_ul]:my-1.5">
                {part.text}
              </MessageResponse>
            )
          case 'dynamic-tool':
            return <ToolRow key={part.toolCallId} part={part} />
          case 'data-question':
            return <QuestionNote key={part.id ?? i} question={part.data} />
          default:
            return null
        }
      })}
    </div>
  )
}

function ToolRow({ part }: { part: DynamicToolUIPart }) {
  const running = part.state === 'input-available' || part.state === 'input-streaming'
  return (
    <Collapsible>
      <CollapsibleTrigger className="group flex w-full min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left text-[12px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink">
        {running ? <LoaderCircle className="size-3.5 shrink-0 animate-spin text-cobalt" /> : <Check className="size-3.5 shrink-0 text-ok" />}
        <span className="min-w-0 flex-1 truncate">{part.title ?? part.toolName}</span>
        <span className="hidden shrink-0 font-mono text-[10px] text-ink-3 sm:inline">{part.toolName}</span>
        <ChevronRight className="size-3 shrink-0 text-ink-3 transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <pre className="mt-1 ml-6 overflow-x-auto rounded-md bg-panel-2 p-2 font-mono text-[11px] leading-relaxed text-ink-2">
          {JSON.stringify({ input: part.input, output: part.state === 'output-available' ? part.output : undefined }, null, 2)}
        </pre>
      </CollapsibleContent>
    </Collapsible>
  )
}

function QuestionNote({ question }: { question: QuestionSet }) {
  const answered = useApp((s) => s.answered[question.id])
  const open = useOpenQuestion()
  const draft = useDraft(question)
  const openField = useCanvas((s) => s.openField)
  const setSheetOpen = useCanvas((s) => s.setSheetOpen)
  const p = draftProgress(question, draft)
  const live = !answered && open?.id === question.id
  const next = question.items.find((i) => !isItemAnswered(i, draft[i.fieldId])) ?? question.items[0]
  return (
    <div className="my-1 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-rule bg-panel-2/60 px-3 py-2.5">
      <CircleHelp className="size-4 shrink-0 text-cobalt" aria-hidden />
      <div className="min-w-[170px] flex-1">
        <p className="text-[13px] font-medium text-ink">{question.title}</p>
        <p className="text-[12px] text-ink-3">
          {answered === 'skipped'
            ? 'Skipped. The values stay marked on the page.'
            : answered
              ? 'Answered on the page.'
              : `${p.answered} of ${p.total} answered. They’re marked in the letter.`}
        </p>
      </div>
      {live && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-[12px]"
          onClick={() => {
            setSheetOpen(false)
            openField(next.fieldId, { scroll: true, focus: true })
          }}
        >
          Answer on the page
        </Button>
      )}
    </div>
  )
}
