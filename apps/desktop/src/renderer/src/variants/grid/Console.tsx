import { Check, ChevronUp, CornerDownLeft, Loader2, Square, SquareTerminal, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { AppUIMessage } from '../../../../shared/protocol'
import { ChatMessage } from '@/components/ChatPane'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { sendPrompt, useAgent, useEngineName } from '@/lib/agent'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useGrid, useMediaQuery } from './state'

// A slim console under the sheet: a monospace log of what the agent and the
// user did, a one-line prompt, and the full conversation on demand.

type Kind = 'tool' | 'agent' | 'you' | 'ask' | 'set' | 'approve' | 'edit' | 'status'

interface Line {
  key: string
  kind: Kind
  name: string
  text: string
  state?: 'running' | 'done' | 'error'
  msgId?: string
}

const plain = (s: string) =>
  s
    .replace(/\*\*|__|\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()

function linesFrom(messages: AppUIMessage[]): Line[] {
  const out: Line[] = []
  for (const m of messages) {
    m.parts.forEach((p, i) => {
      const key = `${m.id}:${i}`
      if (p.type === 'text') {
        const text = plain(p.text)
        if (text) out.push({ key, msgId: m.id, kind: m.role === 'user' ? 'you' : 'agent', name: m.role === 'user' ? 'you' : 'agent', text })
      } else if (p.type === 'dynamic-tool') {
        out.push({
          key,
          msgId: m.id,
          kind: 'tool',
          name: p.toolName,
          text: p.title ?? p.toolName,
          state: p.state === 'output-available' ? 'done' : p.state === 'output-error' ? 'error' : 'running'
        })
      } else if (p.type === 'data-question') {
        out.push({ key, msgId: m.id, kind: 'ask', name: 'ask_user', text: `${p.data.title}: ${p.data.items.map((x) => x.label).join(' ')}` })
      }
    })
  }
  return out
}

const label = (id: string) => (id === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[id]?.label ?? id))

/** Merge chat parts and fill-state changes into one ordered log. */
function useConsoleLog(messages: AppUIMessage[]) {
  const [lines, setLines] = useState<Line[]>(() => linesFrom(messages))
  const seq = useRef(0)

  useEffect(() => {
    const fresh = linesFrom(messages)
    setLines((prev) => {
      const ids = new Set(messages.map((m) => m.id))
      if (prev.some((l) => l.msgId && !ids.has(l.msgId))) return fresh
      const byKey = new Map(fresh.map((l) => [l.key, l]))
      const have = new Set(prev.map((l) => l.key))
      const next = prev.map((l) => byKey.get(l.key) ?? l)
      for (const l of fresh) if (!have.has(l.key)) next.push(l)
      return next.slice(-300)
    })
  }, [messages])

  useEffect(
    () =>
      useApp.subscribe((s, p) => {
        const add: Line[] = []
        const push = (kind: Kind, name: string, text: string) => add.push({ key: `e${seq.current++}`, kind, name, text })
        if (s.activity && s.activity !== p.activity) push('status', 'status', `${s.activity}…`)
        if (s.fields !== p.fields) {
          for (const id of Object.keys(s.fields)) {
            const f = s.fields[id]
            const o = p.fields[id]
            if (f === o || f.status === 'drafting' || f.status === 'empty') continue
            if (f.status === 'approved' && o?.status !== 'approved') push('approve', 'approve', label(id))
            else if (f.by === 'user' && /Edited/.test(f.note ?? '')) push('edit', 'edit', `${id} = ${displayValue(f) ?? '(cleared)'}`)
            else if (f.status === 'conflict') push('set', 'flag', `${id} has ${f.candidates?.length ?? 2} candidates`)
            else if (f.status === 'missing') push('set', 'flag', `${id} not found`)
            else push('set', 'set', `${id} = ${displayValue(f)}`)
          }
        }
        if (s.rates !== p.rates) {
          if (s.rates.status === 'approved' && p.rates.status !== 'approved') push('approve', 'approve', 'Hourly rates')
          else if (s.rates.rows.length && s.rates.rows !== p.rates.rows) push('set', 'set', `hourlyRates = ${s.rates.rows.length} rows`)
        }
        if (add.length) setLines((prev) => [...prev, ...add].slice(-300))
      }),
    []
  )
  return lines
}

const nameTone: Record<Kind, string> = {
  tool: 'text-cobalt',
  agent: 'text-ink',
  you: 'text-ink font-medium',
  ask: 'text-warn',
  set: 'text-ink-2',
  approve: 'text-ok',
  edit: 'text-ink',
  status: 'text-ink-3'
}

function LogLine({ line, n }: { line: Line; n: number }) {
  return (
    <li className="grid grid-cols-[26px_92px_minmax(0,1fr)_14px] items-center gap-x-2 px-3 font-mono text-[11.5px] leading-[20px] sm:grid-cols-[30px_132px_minmax(0,1fr)_14px] sm:px-4">
      <span className="text-right text-ink-3/70 select-none">{n}</span>
      <span className={cn('truncate', nameTone[line.kind])}>{line.name}</span>
      <span className={cn('truncate', line.kind === 'status' ? 'text-ink-3 italic' : line.kind === 'you' || line.kind === 'agent' ? 'text-ink' : 'text-ink-2')} title={line.text}>
        {line.text}
      </span>
      <span className="flex justify-end">
        {line.state === 'running' ? (
          <Loader2 className="size-3 animate-spin text-cobalt" aria-label="Running" />
        ) : line.state === 'done' ? (
          <Check className="size-3 text-ok" aria-label="Done" />
        ) : line.state === 'error' ? (
          <X className="size-3 text-bad" aria-label="Failed" />
        ) : null}
      </span>
    </li>
  )
}

const suggestions = ['Where did Net 30 come from?', 'Which rates did you use?', 'Why is litigation excluded?']

export function AgentConsole() {
  const { messages, status, busy, activity, stop } = useAgent()
  const engine = useEngineName()
  const open = useGrid((s) => s.consoleOpen)
  const set = useGrid((s) => s.set)
  const lines = useConsoleLog(messages)
  const [input, setInput] = useState('')
  const [tab, setTab] = useState<'log' | 'chat'>('chat')
  const wide = useMediaQuery('(min-width: 900px)')
  const phone = !useMediaQuery('(min-width: 640px)')
  const tailRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    const el = tailRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines, open, tab])

  const submit = (text: string) => {
    const t = text.trim()
    if (!t || busy) return
    sendPrompt(t)
    setInput('')
  }

  const tail = lines.slice(phone ? -2 : -3)
  const offset = lines.length - tail.length

  return (
    <section aria-label="Agent console" className="shrink-0 border-t border-rule bg-panel">
      <div className="flex h-11 items-center gap-2 px-3 sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => set({ consoleOpen: !open })}
          aria-expanded={open}
          aria-controls="grid-console-body"
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-[5px] px-1.5 text-[12px] font-medium text-ink hover:bg-panel-2"
        >
          <SquareTerminal className="size-4 text-ink-3" aria-hidden />
          Agent
          <ChevronUp className={cn('size-3.5 text-ink-3 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
          <span className="sr-only">{open ? 'Hide conversation' : 'Show conversation'}</span>
        </button>
        <div className="hidden min-w-0 flex-1 items-center gap-2 text-[12px] md:flex" aria-live="polite">
          <span className={cn('size-1.5 shrink-0 rounded-full', busy ? 'animate-pulse bg-cobalt' : 'bg-ok')} aria-hidden />
          {busy ? (
            <Shimmer as="span" className="truncate text-[12px]" duration={1.6}>
              {activity ? `${activity}…` : status === 'submitted' ? 'Thinking…' : 'Working…'}
            </Shimmer>
          ) : (
            <span className="truncate text-ink-3">Idle · {engine}</span>
          )}
        </div>
        <form
          className="ml-auto flex h-8 min-w-0 flex-1 items-center gap-1 rounded-[6px] border border-rule bg-panel pr-1 pl-2.5 transition-[border-color,box-shadow] focus-within:border-cobalt/60 focus-within:ring-3 focus-within:ring-cobalt/15 md:max-w-[440px]"
          onSubmit={(e) => {
            e.preventDefault()
            submit(input)
          }}
        >
          <label htmlFor="grid-ask" className="sr-only">
            Ask the agent
          </label>
          <input
            id="grid-ask"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the agent…"
            autoComplete="off"
            className="h-full min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
          {busy ? (
            <Button type="button" variant="ghost" size="icon-xs" className="size-6 text-ink-2" onClick={() => void stop()} aria-label="Stop the agent">
              <Square className="size-2.5 fill-current" />
            </Button>
          ) : (
            <Button type="submit" variant="ghost" size="icon-xs" className="size-6 text-ink-3 hover:text-cobalt" disabled={!input.trim()} aria-label="Send">
              <CornerDownLeft className="size-3.5" />
            </Button>
          )}
        </form>
      </div>

      {!open && (
        <ol className="border-t border-rule/70 pt-1 pb-1.5" aria-label="Recent activity">
          {tail.map((l, i) => (
            <LogLine key={l.key} line={l} n={offset + i + 1} />
          ))}
        </ol>
      )}

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id="grid-console-body"
            key="body"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
            className="overflow-hidden border-t border-rule"
          >
            {!wide && (
              <div className="flex gap-1 border-b border-rule px-3 py-1.5" role="tablist" aria-label="Console view">
                {(['chat', 'log'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={cn('h-7 rounded-[5px] px-2.5 text-[12px]', tab === t ? 'bg-panel-2 font-medium text-ink' : 'text-ink-2 hover:text-ink')}
                  >
                    {t === 'chat' ? 'Conversation' : 'Log'}
                  </button>
                ))}
              </div>
            )}
            <div className={cn('grid h-[min(40vh,360px)] min-h-0', wide ? 'grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]' : 'grid-cols-1')}>
              {(wide || tab === 'log') && (
                <ol ref={tailRef} className="grid-thin-scroll min-h-0 overflow-y-auto border-rule py-2 md:border-r" aria-label="Agent log">
                  {lines.map((l, i) => (
                    <LogLine key={l.key} line={l} n={i + 1} />
                  ))}
                </ol>
              )}
              {(wide || tab === 'chat') && (
                <div className="flex min-h-0 flex-col">
                  <Conversation className="min-h-0 flex-1">
                    <ConversationContent className="gap-4 px-4 py-4">
                      {messages.map((m) => (
                        <ChatMessage key={m.id} message={m} busy={busy} />
                      ))}
                      {status === 'submitted' && <Shimmer className="text-[13px]">Thinking…</Shimmer>}
                    </ConversationContent>
                    <ConversationScrollButton />
                  </Conversation>
                  {!busy && (
                    <div className="flex gap-1.5 overflow-x-auto border-t border-rule px-4 py-2 [scrollbar-width:none]">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => submit(s)}
                          className="h-7 shrink-0 rounded-[5px] border border-rule px-2.5 text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:text-ink"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}
