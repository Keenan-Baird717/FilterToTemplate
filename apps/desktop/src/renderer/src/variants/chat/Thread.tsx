import type { DynamicToolUIPart } from 'ai'
import {
  BookOpenText,
  ChevronRight,
  CircleDashed,
  FileText,
  GitCompareArrows,
  Library,
  Loader2,
  PenLine,
  Quote,
  Search,
  ShieldCheck,
  Sheet,
  Wrench,
  XCircle,
  type LucideIcon
} from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { Fragment, useMemo, useRef, useState, type ReactNode } from 'react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { AppUIMessage, QuestionSet } from '../../../../shared/protocol'
import { MessageResponse } from '@/components/ai-elements/message'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { questionsIn } from '@/lib/agent'
import { cn } from '@/lib/utils'
import { DocUpdatedCard, ProgressCard } from './cards'
import { QuestionPrompt } from './QuestionPrompt'
import { IrisMark, mentionRe } from './shared'

const FILL_TOOLS = new Set(['set_field', 'set_narrative', 'flag_conflict', 'mark_missing', 'build_catalog'])
const UPDATE_TOOLS = new Set(['set_field', 'set_narrative'])

const toolIcon: Record<string, LucideIcon> = {
  search_documents: Search,
  get_sheet_range: Sheet,
  set_field: PenLine,
  set_narrative: ShieldCheck,
  read_document_section: BookOpenText,
  collect_evidence: Quote,
  build_catalog: Library,
  flag_conflict: GitCompareArrows,
  mark_missing: CircleDashed
}

type Block =
  | { kind: 'text'; key: string; text: string; streaming: boolean }
  | { kind: 'tools'; key: string; parts: DynamicToolUIPart[] }
  | { kind: 'question'; key: string; question: QuestionSet }
  | { kind: 'progress'; key: string }
  | { kind: 'updated'; key: string; fieldIds: string[] }

function updatedFields(parts: DynamicToolUIPart[]) {
  const ids: string[] = []
  for (const p of parts) {
    const id = (p.input as { fieldId?: unknown } | undefined)?.fieldId
    if (UPDATE_TOOLS.has(p.toolName) && typeof id === 'string' && fieldDefs[id] && !ids.includes(id)) ids.push(id)
  }
  return ids
}

function blocksOf(message: AppUIMessage, withProgress: boolean): Block[] {
  const blocks: Block[] = []
  message.parts.forEach((part, i) => {
    if (part.type === 'text') {
      if (part.text.trim()) blocks.push({ kind: 'text', key: `t${i}`, text: part.text, streaming: part.state === 'streaming' })
    } else if (part.type === 'dynamic-tool') {
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'tools') last.parts.push(part)
      else blocks.push({ kind: 'tools', key: `g${i}`, parts: [part] })
    } else if (part.type === 'data-question') {
      blocks.push({ kind: 'question', key: `q${part.id ?? i}`, question: part.data })
    }
  })

  // A "Document updated" card follows each run of tools that changed specific fields.
  for (let i = blocks.length - 1; i >= 0; i--) {
    const b = blocks[i]
    if (b.kind !== 'tools') continue
    const ids = updatedFields(b.parts)
    if (ids.length) blocks.splice(i + 1, 0, { kind: 'updated', key: `u${b.key}`, fieldIds: ids })
  }

  // The live progress card sits in the newest message that filled fields: right
  // after its bulk tool run, or at the end when that run already has an update card.
  if (withProgress) {
    const lastTools = blocks.findLastIndex((b) => b.kind === 'tools')
    const followedByUpdate = blocks[lastTools + 1]?.kind === 'updated'
    let at = lastTools >= 0 && !followedByUpdate ? lastTools + 1 : blocks.length
    if (at === blocks.length && blocks[at - 1]?.kind === 'question') at--
    blocks.splice(at, 0, { kind: 'progress', key: 'progress' })
  }
  return blocks
}

function hasFillTools(m: AppUIMessage) {
  return m.role === 'assistant' && m.parts.some((p) => p.type === 'dynamic-tool' && FILL_TOOLS.has(p.toolName))
}

export function Thread({ messages, busy, status, activity }: { messages: AppUIMessage[]; busy: boolean; status: string; activity: string | null }) {
  const reduce = useReducedMotion()
  const initialIds = useRef(new Set(messages.map((m) => m.id)))
  const progressIn = useMemo(() => messages.findLast(hasFillTools)?.id, [messages])
  const latestQuestion = useMemo(() => questionsIn(messages).at(-1)?.id, [messages])
  const last = messages[messages.length - 1]
  const lastToolRunning = last?.role === 'assistant' && last.parts.some((p) => p.type === 'dynamic-tool' && p.state === 'input-available')
  const showWorking = busy && (status === 'submitted' || !!activity || lastToolRunning || last?.role === 'user')

  return (
    <>
      {messages.map((m) => (
        <motion.div
          key={m.id}
          initial={reduce || initialIds.current.has(m.id) ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.2, 0.7, 0.3, 1] }}
        >
          {m.role === 'user' ? (
            <UserMessage message={m} messages={messages} />
          ) : (
            <AssistantMessage
              message={m}
              withProgress={m.id === progressIn}
              busy={busy}
              streaming={busy && m.id === last?.id}
              latestQuestion={latestQuestion}
            />
          )}
        </motion.div>
      ))}
      {showWorking && (
        <div className="grid grid-cols-1 gap-x-3.5 sm:grid-cols-[28px_minmax(0,1fr)]" aria-live="polite">
          <IrisMark live className="hidden sm:inline-flex" />
          <div className="flex min-h-7 items-center gap-2.5">
            <span className="chat-breathe size-2 rounded-full bg-cobalt sm:hidden" aria-hidden />
            <Shimmer className="text-[13.5px] font-medium" duration={1.6}>{`${activity ?? (status === 'submitted' ? 'Thinking' : 'Working')}…`}</Shimmer>
          </div>
        </div>
      )}
    </>
  )
}

/** User text with @Field mentions rendered as chips. */
function withMentions(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let lastIdx = 0
  for (const m of text.matchAll(mentionRe)) {
    if (m.index > lastIdx) out.push(text.slice(lastIdx, m.index))
    out.push(
      <span key={m.index} className="mx-px inline-flex items-center rounded-md bg-cobalt-soft px-1.5 py-px text-[13px] font-medium text-cobalt">
        @{m[1]}
      </span>
    )
    lastIdx = m.index + m[0].length
  }
  if (lastIdx < text.length) out.push(text.slice(lastIdx))
  return out
}

function UserMessage({ message, messages }: { message: AppUIMessage; messages: AppUIMessage[] }) {
  const answer = message.metadata?.answer
  if (answer) {
    const q = questionsIn(messages).find((x) => x.id === answer.questionId)
    const items = q?.items ?? Object.keys(answer.answers).map((fieldId) => ({ fieldId, label: fieldDefs[fieldId]?.label ?? fieldId, options: undefined }))
    return (
      <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md border border-rule bg-panel-2 px-4 py-3 sm:max-w-[75%]">
        <div className="text-[12px] font-medium text-ink-3">Your answers</div>
        <dl className="mt-1.5 grid grid-cols-1 gap-x-5 gap-y-1 text-[13.5px] sm:grid-cols-[auto_minmax(0,1fr)]">
          {items.map((it) => {
            const raw = answer.answers[it.fieldId]?.trim()
            const shown = it.options?.find((o) => o.value === raw)?.display ?? raw
            return (
              <Fragment key={it.fieldId}>
                <dt className="text-ink-2">{fieldDefs[it.fieldId]?.label ?? it.label}</dt>
                <dd className={cn('min-w-0 break-words', shown ? 'font-medium text-ink' : 'text-ink-3 italic')}>{shown || 'Skipped'}</dd>
              </Fragment>
            )
          })}
        </dl>
      </div>
    )
  }
  const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')
  return (
    <div className="ml-auto w-fit max-w-[88%] rounded-2xl rounded-br-md bg-panel-2 px-4 py-2.5 text-[14.5px] leading-relaxed break-words whitespace-pre-line text-ink sm:max-w-[75%]">
      {withMentions(text)}
    </div>
  )
}

function AssistantMessage({
  message,
  withProgress,
  busy,
  streaming,
  latestQuestion
}: {
  message: AppUIMessage
  withProgress: boolean
  busy: boolean
  streaming: boolean
  latestQuestion: string | undefined
}) {
  const blocks = blocksOf(message, withProgress)
  if (!blocks.length) return null
  return (
    <div className="grid grid-cols-1 gap-x-3.5 sm:grid-cols-[28px_minmax(0,1fr)]">
      <IrisMark className="mt-0.5 hidden sm:inline-flex" />
      <div className="flex min-w-0 flex-col gap-3.5 self-start [&>*]:shrink-0">
        {blocks.map((b, i) => {
          switch (b.kind) {
            case 'text':
              return (
                <MessageResponse key={b.key} className="chat-prose" isAnimating={b.streaming}>
                  {b.text}
                </MessageResponse>
              )
            case 'tools':
              return <ActivityGroup key={b.key} parts={b.parts} live={streaming && i === blocks.length - 1} />
            case 'question':
              return <QuestionPrompt key={b.key} question={b.question} busy={busy} latest={b.question.id === latestQuestion} />
            case 'progress':
              return <ProgressCard key={b.key} />
            case 'updated':
              return <DocUpdatedCard key={b.key} fieldIds={b.fieldIds} />
          }
        })}
      </div>
    </div>
  )
}

/** Tool calls as compact rows; long runs fold into one line once they finish. */
function ActivityGroup({ parts, live }: { parts: DynamicToolUIPart[]; live: boolean }) {
  const running = parts.some((p) => p.state === 'input-available' || p.state === 'input-streaming')
  const [userOpen, setUserOpen] = useState<boolean | null>(null)
  const foldable = parts.length > 3
  const open = !foldable || (userOpen ?? (live || running))

  return (
    <div className="flex flex-col">
      {foldable && (
        <button
          type="button"
          onClick={() => setUserOpen(!open)}
          aria-expanded={open}
          className="group/fold -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 text-left text-[13px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <ChevronRight className={cn('size-3.5 text-ink-3 transition-transform', open && 'rotate-90')} />
          <span>{running ? `Working through ${parts.length} steps` : `Ran ${parts.length} steps`}</span>
          <span className="flex items-center gap-1 text-ink-3" aria-hidden>
            {[...new Set(parts.map((p) => p.toolName))].slice(0, 5).map((n) => {
              const Icon = toolIcon[n] ?? Wrench
              return <Icon key={n} className="size-3.5" />
            })}
          </span>
        </button>
      )}
      {open && (
        <ul className={cn('flex flex-col', foldable && 'mt-0.5 ml-[7px] border-l border-rule pl-3')}>
          {parts.map((p) => (
            <ToolRow key={p.toolCallId} part={p} />
          ))}
        </ul>
      )}
    </div>
  )
}

function fmt(v: unknown): string {
  if (typeof v === 'string') return v
  if (Array.isArray(v)) return v.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(', ')
  return JSON.stringify(v)
}

function KeyValues({ label, value }: { label: string; value: unknown }) {
  const entries = value && typeof value === 'object' && !Array.isArray(value) ? Object.entries(value as Record<string, unknown>) : [['value', value] as const]
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[11px] font-medium text-ink-3">{label}</div>
      <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[11.5px]">
        {entries.map(([k, v]) => (
          <Fragment key={k}>
            <dt className="text-ink-3">{k}</dt>
            <dd className="break-words text-ink-2">{fmt(v)}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}

function ToolRow({ part }: { part: DynamicToolUIPart }) {
  const [open, setOpen] = useState(false)
  const Icon = toolIcon[part.toolName] ?? Wrench
  const running = part.state === 'input-available' || part.state === 'input-streaming'
  const failed = part.state === 'output-error'
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="group/tool -mx-1.5 flex w-[calc(100%+12px)] min-w-0 items-center gap-2.5 rounded-md px-1.5 py-[5px] text-left transition-colors hover:bg-panel-2"
      >
        <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', running ? 'bg-cobalt-soft text-cobalt' : 'text-ink-3')}>
          {running ? <Loader2 className="size-3.5 animate-spin" /> : failed ? <XCircle className="size-3.5 text-bad" /> : <Icon className="size-3.5" />}
        </span>
        <span className={cn('min-w-0 flex-1 truncate text-[13px]', running ? 'text-ink' : 'text-ink-2')}>{part.title ?? part.toolName}</span>
        <ChevronRight className={cn('size-3.5 shrink-0 text-ink-3 opacity-0 transition group-hover/tool:opacity-100 group-focus-visible/tool:opacity-100', open && 'rotate-90 opacity-100')} />
      </button>
      {open && (
        <div className="mt-1 mb-2 ml-[30px] flex flex-col gap-2.5 rounded-lg border border-rule bg-panel-2/50 px-3 py-2.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
            <FileText className="size-3" /> {part.toolName}
          </div>
          <KeyValues label="Input" value={part.input} />
          {part.state === 'output-available' && <KeyValues label="Result" value={part.output} />}
          {failed && <p className="text-[12px] text-bad">{part.errorText}</p>}
        </div>
      )}
    </li>
  )
}
