import { ArrowUp, ChevronDown, Paperclip, Plus, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DocBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { sendPrompt, useOpenQuestion, useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { runExport } from './cards'
import { useChatUI } from './ui-store'
import { fieldLabel, shortDocName } from './shared'

const asks = ['Where did Net 30 come from?', 'Which rates did you use?', 'Why is litigation excluded?']

function Suggestions({ onAsk }: { onAsk: (text: string) => void }) {
  const open = useOpenQuestion()
  const { done, total } = useSummary()
  const focusQuestion = useChatUI((s) => s.focusQuestion)
  const chip = 'h-8 shrink-0 rounded-full border border-rule bg-panel px-3 text-[13px] whitespace-nowrap text-ink-2 transition-colors hover:border-cobalt/40 hover:text-ink'
  return (
    <div className="chat-no-scrollbar chat-fade-x -mx-4 mb-2.5 flex gap-1.5 overflow-x-auto px-4 sm:-mx-1 sm:px-1" aria-label="Suggestions">
      {open && (
        <button type="button" onClick={focusQuestion} className={cn(chip, 'border-cobalt/35 bg-cobalt-soft text-cobalt hover:text-cobalt')}>
          Answer the {open.items.length} open questions
        </button>
      )}
      {done === total && !open && (
        <button type="button" onClick={runExport} className={cn(chip, 'border-cobalt/35 bg-cobalt-soft text-cobalt hover:text-cobalt')}>
          Export the Word file
        </button>
      )}
      {asks.map((s) => (
        <button key={s} type="button" onClick={() => onAsk(s)} className={chip}>
          {s}
        </button>
      ))}
    </div>
  )
}

/** Documents in the project, one chip each (shown expanded, or while new files index). */
function FileChips({ expanded, onAdd }: { expanded: boolean; onAdd: () => void }) {
  const docs = useApp((s) => s.docs)
  const openSource = useApp((s) => s.openSource)
  const shown = expanded ? docs : docs.filter((d) => d.added === 'Just now')
  if (!shown.length) return null
  return (
    <div className="chat-scroll flex max-h-[136px] flex-wrap items-center gap-1.5 overflow-y-auto px-3 pt-3" aria-label="Documents in this project">
      {shown.map((d) => (
        <button
          key={d.id}
          type="button"
          title={d.name}
          disabled={d.status === 'parsing'}
          onClick={() => openSource({ docId: d.id, page: d.content[0]?.n })}
          className="relative inline-flex h-7 max-w-[220px] min-w-0 items-center gap-1.5 overflow-hidden rounded-lg border border-rule bg-panel pr-2 pl-1 text-[12.5px] text-ink-2 transition-colors enabled:hover:border-cobalt/40 enabled:hover:text-ink disabled:cursor-default"
        >
          <DocBadge kind={d.kind} className="h-[18px] w-8 text-[9px]" />
          <span className="truncate">{shortDocName(d.name)}</span>
          {d.status === 'parsing' && (
            <>
              <span className="num shrink-0 font-mono text-[10.5px] text-ink-3">{d.progress ?? 0}%</span>
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-rule" aria-hidden>
                <span className="block h-full bg-cobalt transition-[width] duration-300" style={{ width: `${d.progress ?? 0}%` }} />
              </span>
            </>
          )}
        </button>
      ))}
      {expanded && (
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-dashed border-ink-3/40 px-2 text-[12.5px] text-ink-2 transition-colors hover:border-cobalt/50 hover:text-ink"
        >
          <Plus className="size-3.5" /> Add files
        </button>
      )}
    </div>
  )
}

function ContextChips() {
  const chips = useChatUI((s) => s.chips)
  const removeChip = useChatUI((s) => s.removeChip)
  if (!chips.length) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 px-3 pt-3" aria-label="Values this message is about">
      {chips.map((id) => (
        <span key={id} className="inline-flex h-7 items-center gap-0.5 rounded-lg bg-cobalt-soft pr-0.5 pl-2 text-[12.5px] font-medium text-cobalt">
          @{fieldLabel(id)}
          <button
            type="button"
            onClick={() => removeChip(id)}
            className="flex size-6 items-center justify-center rounded-md transition-colors hover:bg-cobalt/15"
            aria-label={`Remove ${fieldLabel(id)} from the message`}
          >
            <X className="size-3" />
          </button>
        </span>
      ))}
    </div>
  )
}

function FilesToggle({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  const docs = useApp((s) => s.docs)
  const parsing = docs.filter((d) => d.status === 'parsing').length
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-label={`${docs.length} files${parsing ? `, ${parsing} indexing` : ''}. ${expanded ? 'Hide' : 'Show'} the list`}
      className="inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full border border-rule bg-panel-2/60 pr-2 pl-2.5 text-[12.5px] text-ink-2 transition-colors hover:border-ink-3/40 hover:text-ink"
    >
      <Paperclip className="size-3.5 shrink-0 text-ink-3" />
      <span className="num font-medium whitespace-nowrap text-ink">{docs.length} files</span>
      {parsing > 0 && <span className="num truncate text-ink-3">· {parsing} indexing</span>}
      <ChevronDown className={cn('size-3.5 shrink-0 text-ink-3 transition-transform', expanded && 'rotate-180')} />
    </button>
  )
}

export function Composer({ busy, stop, onAddFiles }: { busy: boolean; stop: () => void; onAddFiles: () => void }) {
  const [text, setText] = useState('')
  const [filesOpen, setFilesOpen] = useState(false)
  const chips = useChatUI((s) => s.chips)
  const clearChips = useChatUI((s) => s.clearChips)
  const removeChip = useChatUI((s) => s.removeChip)
  const composerTick = useChatUI((s) => s.composerTick)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (composerTick) ref.current?.focus()
  }, [composerTick])

  const send = (raw: string) => {
    if (busy) return
    const t = raw.trim()
    if (!t && !chips.length) return
    const mentions = chips.map((id) => `@${fieldLabel(id)}`).join(' ')
    const body = t || (chips.length === 1 ? 'Where did this value come from?' : 'Where did these values come from?')
    sendPrompt(mentions ? `${mentions} ${body}` : body)
    setText('')
    clearChips()
  }

  const placeholder = chips.length ? `Ask about ${chips.map(fieldLabel).join(', ')}` : 'Ask, or tell the agent what to change'

  return (
    <div className="shrink-0 px-4 pt-2 pb-4 sm:px-6 sm:pb-5">
      <div className="mx-auto w-full max-w-[760px]">
        {!busy && <Suggestions onAsk={send} />}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            send(text)
          }}
          className="rounded-[20px] border border-rule bg-panel shadow-[var(--chat-lift)] transition-[border-color,box-shadow] focus-within:border-cobalt/45 focus-within:shadow-[var(--chat-lift),0_0_0_4px_color-mix(in_srgb,var(--cobalt)_12%,transparent)]"
        >
          <FileChips expanded={filesOpen} onAdd={onAddFiles} />
          <ContextChips />
          <label htmlFor="chat-composer" className="sr-only">
            Message the agent
          </label>
          <textarea
            id="chat-composer"
            ref={ref}
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                send(text)
              }
              if (e.key === 'Backspace' && !text && chips.length) removeChip(chips[chips.length - 1])
            }}
            placeholder={placeholder}
            className="block max-h-44 min-h-[56px] w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-relaxed text-ink outline-none [field-sizing:content] placeholder:text-ink-3"
          />
          <div className="flex min-w-0 items-center gap-1.5 px-2.5 pb-2.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 rounded-full text-ink-2" aria-label="Add documents" onClick={onAddFiles}>
                  <Plus className="size-[18px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Add documents, or drop them on the conversation</TooltipContent>
            </Tooltip>
            <FilesToggle expanded={filesOpen} onToggle={() => setFilesOpen(!filesOpen)} />
            <span className="min-w-0 flex-1" />
            {busy ? (
              <Button type="button" size="icon" variant="secondary" className="size-9 shrink-0 rounded-full" onClick={stop} aria-label="Stop the agent">
                <Square className="size-3.5 fill-current" />
              </Button>
            ) : (
              <Button type="submit" size="icon" className="size-9 shrink-0 rounded-full" disabled={!text.trim() && !chips.length} aria-label="Send message">
                <ArrowUp className="size-[18px]" strokeWidth={2.4} />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
