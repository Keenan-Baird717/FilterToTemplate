import { ArrowUp, Check, FileSearch, Mail, SkipForward, Undo2 } from 'lucide-react'
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import type { QuestionItem, QuestionSet, SourceRef } from '../../../../shared/protocol'
import { markQuote } from '@/components/EvidencePage'
import { locatorText } from '@/components/status'
import { Button } from '@/components/ui/button'
import { skipQuestion, submitAnswers } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useChatUI } from './ui-store'
import { shortDocName } from './shared'

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

/** The block of source text that contains a quote, for a readable snippet. */
function useSnippet(source: SourceRef | undefined) {
  const doc = useApp((s) => (source ? s.docs.find((d) => d.id === source.docId) : undefined))
  if (!source || !doc) return { doc, text: source?.quote ?? '' }
  const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase()
  const page = doc.content.find((p) => p.n === source.page) ?? doc.content[0]
  const block = page?.blocks.find((b) => norm(b).includes(norm(source.quote)))
  return { doc, text: block ?? source.quote }
}

function SourceLine({ source }: { source: SourceRef }) {
  const doc = useApp((s) => s.docs.find((d) => d.id === source.docId))
  return (
    <span className="flex min-w-0 items-center gap-1.5 font-mono text-[11px] text-ink-3">
      <span className="font-medium text-cobalt">{source.docId}</span>
      <span className="truncate font-sans text-[12px]">{doc ? shortDocName(doc.name) : source.docId}</span>
      <span className="shrink-0">{locatorText(source)}</span>
    </span>
  )
}

function ChoiceTiles({
  item,
  value,
  onChange,
  labelId,
  disabled
}: {
  item: QuestionItem
  value: string | undefined
  onChange: (v: string) => void
  labelId: string
  disabled: boolean
}) {
  const openSource = useApp((s) => s.openSource)
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const options = item.options ?? []

  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = (i + step + options.length) % options.length
    onChange(options[next].value)
    refs.current[next]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={labelId} className="mt-3 grid gap-2.5 @md:grid-cols-2">
      {options.map((o, i) => (
        <ChoiceTile
          key={o.value}
          ref={(el) => {
            refs.current[i] = el
          }}
          checked={value === o.value}
          focusable={value ? value === o.value : i === 0}
          display={o.display}
          source={o.sources[0]}
          disabled={disabled}
          onSelect={() => onChange(o.value)}
          onKeyDown={(e) => onKey(e, i)}
          onOpenSource={(s) => openSource({ docId: s.docId, page: s.page, quote: s.quote, locator: s.locator })}
        />
      ))}
    </div>
  )
}

function ChoiceTile({
  ref,
  checked,
  focusable,
  display,
  source,
  disabled,
  onSelect,
  onKeyDown,
  onOpenSource
}: {
  ref: (el: HTMLButtonElement | null) => void
  checked: boolean
  focusable: boolean
  display: string
  source: SourceRef | undefined
  disabled: boolean
  onSelect: () => void
  onKeyDown: (e: KeyboardEvent) => void
  onOpenSource: (s: SourceRef) => void
}) {
  const { text } = useSnippet(source)
  return (
    <div
      className={cn(
        'relative rounded-xl border transition-[border-color,background-color,box-shadow] duration-150',
        checked ? 'border-cobalt bg-cobalt-soft/55 shadow-[0_0_0_1px_var(--cobalt)]' : 'border-rule bg-panel hover:border-ink-3/45 hover:bg-panel-2/50'
      )}
    >
      <button
        ref={ref}
        type="button"
        role="radio"
        aria-checked={checked}
        tabIndex={focusable ? 0 : -1}
        disabled={disabled}
        onClick={onSelect}
        onKeyDown={onKeyDown}
        className="flex w-full flex-col items-start gap-2 rounded-xl px-4 pt-3.5 pb-11 text-left outline-none focus-visible:ring-2 focus-visible:ring-cobalt focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:cursor-not-allowed"
      >
        <span className="chat-display pr-8 text-[19px] leading-tight font-semibold text-ink">{display}</span>
        {source && <span className="line-clamp-3 font-serif text-[13.5px] leading-snug text-ink-2">{markQuote(text, source.quote)}</span>}
      </button>
      <span
        className={cn(
          'pointer-events-none absolute top-3.5 right-3.5 flex size-5 items-center justify-center rounded-full border transition-colors',
          checked ? 'border-cobalt bg-cobalt text-on-cobalt' : 'border-ink-3/50 bg-panel'
        )}
        aria-hidden
      >
        {checked && <Check className="size-3" strokeWidth={3} />}
      </span>
      {source && (
        <div className="absolute inset-x-0 bottom-0 flex min-w-0 items-center gap-2 pr-1.5 pb-1.5 pl-4">
          <span className="pointer-events-none min-w-0 flex-1">
            <SourceLine source={source} />
          </span>
          <button
            type="button"
            onClick={() => onOpenSource(source)}
            className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-[12px] text-ink-2 transition-colors hover:bg-panel hover:text-ink"
            aria-label={`Open the source for ${display}`}
          >
            <FileSearch className="size-3.5" /> Source
          </button>
        </div>
      )}
    </div>
  )
}

function EmailField({
  item,
  id,
  value,
  onChange,
  invalid,
  disabled,
  labelId
}: {
  item: QuestionItem
  id: string
  value: string
  onChange: (v: string) => void
  invalid: boolean
  disabled: boolean
  labelId: string
}) {
  const field = useApp((s) => s.fields[item.fieldId])
  const openSource = useApp((s) => s.openSource)
  const hint = field?.sources[0]
  return (
    <div className="mt-3 flex flex-col gap-2">
      <div className="relative">
        <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" aria-hidden />
        <input
          id={id}
          type={item.inputType ?? 'text'}
          inputMode={item.inputType === 'email' ? 'email' : undefined}
          autoComplete="off"
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={item.placeholder}
          disabled={disabled}
          aria-labelledby={labelId}
          aria-invalid={invalid}
          aria-describedby={invalid ? `${id}-error` : undefined}
          className={cn(
            'h-11 w-full rounded-xl border bg-panel pr-3 pl-10 font-mono text-[14px] text-ink transition-[border-color,box-shadow] outline-none placeholder:font-sans placeholder:text-ink-3 focus:ring-4 disabled:opacity-60',
            invalid ? 'border-bad focus:ring-bad/15' : 'border-rule focus:border-cobalt focus:ring-cobalt/15'
          )}
        />
      </div>
      {invalid && (
        <p id={`${id}-error`} className="text-[12px] text-bad">
          Enter an address like name@acmeholdings.com, or leave it blank to skip.
        </p>
      )}
      {hint && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
          <span>Closest mention:</span>
          <button
            type="button"
            onClick={() => openSource({ docId: hint.docId, page: hint.page, quote: hint.quote, locator: hint.locator })}
            className="min-w-0 truncate rounded px-1 text-left font-serif text-[13px] text-ink-2 underline decoration-rule underline-offset-[3px] transition-colors hover:text-ink hover:decoration-cobalt"
          >
            “{hint.quote}”
          </button>
          <SourceLine source={hint} />
        </div>
      )}
    </div>
  )
}

/** The open follow-up, inline in the conversation: large choice tiles and the email field. */
export function QuestionPrompt({ question, busy, latest }: { question: QuestionSet; busy: boolean; latest: boolean }) {
  const answered = useApp((s) => s.answered[question.id])
  const [values, setValues] = useState<Record<string, string>>({})
  const [tried, setTried] = useState(false)
  const questionTick = useChatUI((s) => s.questionTick)
  const formRef = useRef<HTMLFormElement>(null)
  const uid = useId()

  useEffect(() => {
    if (!questionTick || answered) return
    const form = formRef.current
    if (!form) return
    form.scrollIntoView({ behavior: 'smooth', block: 'center' })
    form.querySelector<HTMLElement>('[role=radio][tabindex="0"], input')?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questionTick])

  if (answered) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-dashed border-rule px-3.5 py-2.5 text-[13px] text-ink-2">
        {answered === 'skipped' ? <SkipForward className="size-4 text-ink-3" /> : <Check className="size-4 text-ok" strokeWidth={2.4} />}
        <span className="min-w-0 flex-1">
          {answered === 'skipped' ? `Skipped “${question.title}”. Those fields stay flagged.` : `Answered “${question.title}”.`}
        </span>
        {answered === 'skipped' && latest && !busy && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-[12.5px]"
            onClick={() => useApp.getState().reopenQuestion(question.id)}
          >
            <Undo2 className="size-3.5" /> Answer now
          </Button>
        )}
      </div>
    )
  }

  const choiceItems = question.items.filter((i) => i.kind === 'choice')
  const missingChoice = choiceItems.some((i) => !values[i.fieldId])
  const invalidOf = (item: QuestionItem) => item.inputType === 'email' && (values[item.fieldId] ?? '').trim() !== '' && !emailOk(values[item.fieldId] ?? '')
  const anyInvalid = question.items.some(invalidOf)
  const filled = question.items.filter((i) => (values[i.fieldId] ?? '').trim() && !invalidOf(i)).length

  const submit = () => {
    setTried(true)
    if (missingChoice || anyInvalid || busy) return
    submitAnswers(question, values)
  }

  return (
    <form
      ref={formRef}
      aria-labelledby={`${uid}-title`}
      className="overflow-hidden rounded-2xl border border-cobalt/35 bg-panel shadow-[var(--chat-lift)]"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          submit()
        }
      }}
    >
      <header className="flex items-start gap-3 px-4 pt-4 pb-1 sm:px-5">
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-cobalt">Waiting on you</p>
          <h3 id={`${uid}-title`} className="chat-display mt-0.5 text-[19px] leading-tight font-semibold text-ink">
            {question.title}
          </h3>
          <p className="mt-0.5 text-[13px] text-ink-2">{question.reason}</p>
        </div>
        <div className="mt-1 flex items-center gap-1" aria-label={`${filled} of ${question.items.length} answered`}>
          {question.items.map((it, i) => (
            <span key={it.fieldId} className={cn('h-1.5 w-5 rounded-full transition-colors', i < filled ? 'bg-cobalt' : 'bg-rule')} />
          ))}
        </div>
      </header>

      <div className="flex flex-col divide-y divide-rule">
        {question.items.map((item, idx) => {
          const labelId = `${uid}-${idx}-label`
          return (
            <div key={item.fieldId} role="group" aria-labelledby={labelId} className="px-4 py-4 sm:px-5">
              <div className="flex items-baseline gap-2.5">
                <span className="num w-3 shrink-0 font-mono text-[11px] text-ink-3">{idx + 1}</span>
                <h4 id={labelId} className="text-[14.5px] font-medium text-ink">
                  {item.label}
                </h4>
              </div>
              {item.help && <p className="mt-0.5 pl-[22px] text-[13px] text-ink-3">{item.help}</p>}
              <div className="@container sm:pl-[22px]">
                {item.kind === 'choice' ? (
                  <ChoiceTiles
                    item={item}
                    labelId={labelId}
                    value={values[item.fieldId]}
                    disabled={busy}
                    onChange={(v) => setValues((s) => ({ ...s, [item.fieldId]: v }))}
                  />
                ) : (
                  <EmailField
                    item={item}
                    id={`${uid}-${idx}-input`}
                    labelId={labelId}
                    value={values[item.fieldId] ?? ''}
                    invalid={invalidOf(item)}
                    disabled={busy}
                    onChange={(v) => setValues((s) => ({ ...s, [item.fieldId]: v }))}
                  />
                )}
              </div>
            </div>
          )
        })}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-rule bg-panel-2/50 px-4 py-3 sm:px-5">
        <p className={cn('min-w-0 text-[12.5px]', tried && missingChoice ? 'text-bad' : 'text-ink-3')} aria-live="polite">
          {tried && missingChoice ? 'Choose a date to continue.' : busy ? 'The agent is working. You can answer when it’s done.' : 'Your answers go straight into the letter.'}
        </p>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-9 px-3 text-[13px] text-ink-2" disabled={busy} onClick={() => skipQuestion(question)}>
            Skip for now
          </Button>
          <Button type="submit" size="sm" className="h-9 gap-1.5 rounded-lg px-3.5 text-[13px]" disabled={busy}>
            Send answers <ArrowUp className="size-3.5" strokeWidth={2.4} />
          </Button>
        </div>
      </footer>
    </form>
  )
}
