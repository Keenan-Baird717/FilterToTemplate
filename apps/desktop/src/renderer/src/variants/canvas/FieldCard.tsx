import { ArrowRight, Check, ChevronLeft, ChevronRight, MessageSquareText, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { FieldState, QuestionItem, QuestionOption, QuestionSet, SourceRef } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { DocBadge, StatusChip, locatorText } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { submitAnswers, useAgent, useOpenQuestion } from '@/lib/agent'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import {
  RATES,
  draftProgress,
  emailOk,
  fieldOrder,
  isItemAnswered,
  labelOf,
  needsYou,
  nextToReview,
  sectionOf,
  statusOf,
  useCanvas,
  useDraft
} from './model'

// The card that opens beside a value on the page: what it is, where it came
// from, and whatever the user can do about it, without leaving the letter.

const editable = new Set(['text', 'email', 'money', 'date', 'narrative'])

export function sendDraft(question: QuestionSet, values: Record<string, string>) {
  submitAnswers(question, values)
  useCanvas.getState().clearDraft()
  useCanvas.getState().closeField()
}

/** Open the next (or previous) value in document order. */
function step(fieldId: string, dir: 1 | -1) {
  const i = fieldOrder.indexOf(fieldId)
  const next = fieldOrder[(i + dir + fieldOrder.length) % fieldOrder.length]
  useCanvas.getState().openField(next, { scroll: true, focus: true })
}

export function FieldCard({ fieldId, onClose, className }: { fieldId: string; onClose: () => void; className?: string }) {
  const field = useApp((s) => s.fields[fieldId])
  const rates = useApp((s) => s.rates)
  const fields = useApp((s) => s.fields)
  const question = useOpenQuestion()
  const item = question?.items.find((i) => i.fieldId === fieldId)
  const status = statusOf(fieldId, fields, rates)
  const section = sectionOf(fieldId)
  const label = labelOf(fieldId)
  const titleId = `cv-card-title-${fieldId.replace(/\W/g, '-')}`

  let body: ReactNode
  let footer: ReactNode
  if (question && item && needsYou(status)) {
    body = <QuestionBody question={question} item={item} field={field} />
    footer = <QuestionFooter question={question} item={item} />
  } else if (fieldId === RATES) {
    body = <RatesBody />
    footer = <ReviewFooter fieldId={fieldId} />
  } else if (status === 'conflict') {
    body = <ConflictBody fieldId={fieldId} field={field} />
    footer = <ReviewFooter fieldId={fieldId} />
  } else if (status === 'missing') {
    body = <MissingBody fieldId={fieldId} field={field} />
    footer = <ReviewFooter fieldId={fieldId} />
  } else if (status === 'drafting') {
    body = (
      <div className="flex flex-col gap-2">
        <Shimmer className="text-[13px] font-medium">The agent is writing this…</Shimmer>
        <p className="line-clamp-4 text-[13px] leading-relaxed text-ink-2">{displayValue(field)}</p>
      </div>
    )
  } else if (status === 'empty') {
    body = <WaitingBody note={field?.note} />
  } else {
    body = <ValueBody fieldId={fieldId} field={field} />
    footer = <ReviewFooter fieldId={fieldId} />
  }

  return (
    <div
      data-cv-card
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={cn('flex max-h-[min(560px,70vh)] flex-col overflow-hidden rounded-xl border border-rule bg-panel text-ink shadow-[var(--cv-float)] outline-none', className)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <header className="flex items-start gap-2 pt-3 pr-2 pl-4">
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[11px] font-medium tracking-wide text-ink-3 uppercase">{section?.title ?? 'Letter'}</p>
          <h3 id={titleId} className="text-[15px] leading-snug font-semibold text-ink">
            {label}
          </h3>
        </div>
        <StatusChip status={status} className="mt-1 h-[22px] text-[11px]" />
        <Button variant="ghost" size="icon" className="size-7 text-ink-3 hover:text-ink" aria-label="Close" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </header>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto px-4 pt-2.5 pb-4">{body}</div>
      {footer}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Bodies
// ---------------------------------------------------------------------------

function QuestionBody({ question, item, field }: { question: QuestionSet; item: QuestionItem; field: FieldState | undefined }) {
  const draft = useDraft(question)
  const setAnswer = useCanvas((s) => s.setAnswer)
  const { busy } = useAgent()
  const value = draft[item.fieldId] ?? ''
  const [touched, setTouched] = useState(false)
  const inputId = `cv-answer-${item.fieldId.replace(/\W/g, '-')}`

  if (item.kind === 'choice') {
    return (
      <>
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-ink">{item.label}</p>
          {item.help && <p className="text-[12px] leading-snug text-ink-3">{item.help}</p>}
        </div>
        <Choices name={item.label} options={item.options ?? []} value={value} disabled={busy} onPick={(v) => setAnswer(question.id, item.fieldId, v)} />
        <p className="text-[12px] text-ink-3">Your pick shows in the letter right away. It’s sent with your other answers.</p>
      </>
    )
  }

  const invalid = item.inputType === 'email' && value.trim() !== '' && !emailOk(value)
  const others = question.items.filter((i) => i !== item && !isItemAnswered(i, draft[i.fieldId]))
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={inputId} className="text-[13px] font-medium text-ink">
          {item.label}
        </label>
        {item.help && <p className="text-[12px] leading-snug text-ink-3">{item.help}</p>}
      </div>
      <Input
        id={inputId}
        type={item.inputType ?? 'text'}
        placeholder={item.placeholder}
        autoComplete="off"
        value={value}
        disabled={busy}
        aria-invalid={touched && invalid}
        aria-describedby={touched && invalid ? `${inputId}-err` : undefined}
        onChange={(e) => setAnswer(question.id, item.fieldId, e.target.value)}
        onBlur={() => setTouched(true)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          setTouched(true)
          if (invalid) return
          const p = draftProgress(question, { ...draft, [item.fieldId]: value })
          if (others.length) useCanvas.getState().openField(others[0].fieldId, { scroll: true, focus: true })
          else if (p.ready) sendDraft(question, { ...draft, [item.fieldId]: value })
        }}
        className="h-9 bg-panel text-[14px]"
      />
      {touched && invalid && (
        <p id={`${inputId}-err`} className="-mt-1 text-[12px] text-bad">
          Enter an address like name@acmeholdings.com.
        </p>
      )}
      {field && field.sources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-ink-3">What the documents say</p>
          {field.sources.map((s, i) => (
            <Evidence key={i} source={s} />
          ))}
        </div>
      )}
    </>
  )
}

function ConflictBody({ fieldId, field }: { fieldId: string; field: FieldState | undefined }) {
  const editField = useApp((s) => s.editField)
  const options: QuestionOption[] = (field?.candidates ?? []).map((c) => ({ value: String(c.value), display: c.display, sources: c.sources }))
  return (
    <>
      <p className="text-[13px] text-ink-2">The documents disagree. Pick the value the letter should use.</p>
      <Choices
        name={labelOf(fieldId)}
        options={options}
        value=""
        onPick={(v) => {
          const c = options.find((o) => o.value === v)
          if (!c) return
          editField(fieldId, c.display)
          toast.success(`${labelOf(fieldId)} set to ${c.display}`)
        }}
      />
    </>
  )
}

function MissingBody({ fieldId, field }: { fieldId: string; field: FieldState | undefined }) {
  const editField = useApp((s) => s.editField)
  const def = fieldDefs[fieldId]
  const [value, setValue] = useState('')
  const inputId = `cv-fill-${fieldId.replace(/\W/g, '-')}`
  const invalid = def?.kind === 'email' && value.trim() !== '' && !emailOk(value)
  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        if (!value.trim() || invalid) return
        editField(fieldId, value)
      }}
    >
      <label htmlFor={inputId} className="text-[13px] text-ink-2">
        {field?.note ?? 'No document has this value.'} Type it here to put it in the letter.
      </label>
      <div className="flex gap-2">
        <Input id={inputId} type={def?.kind === 'email' ? 'email' : 'text'} value={value} onChange={(e) => setValue(e.target.value)} aria-invalid={invalid} className="h-9 bg-panel text-[14px]" />
        <Button type="submit" size="sm" className="h-9" disabled={!value.trim() || invalid}>
          Save
        </Button>
      </div>
      {field && field.sources.length > 0 && field.sources.map((s, i) => <Evidence key={i} source={s} />)}
    </form>
  )
}

function WaitingBody({ note }: { note?: string }) {
  const question = useOpenQuestion()
  const openField = useCanvas((s) => s.openField)
  return (
    <div className="flex flex-col items-start gap-2.5">
      <p className="text-[13px] leading-relaxed text-ink-2">{note ?? 'The agent hasn’t filled this yet.'}</p>
      {question && (
        <Button variant="outline" size="sm" onClick={() => openField(question.items[0].fieldId, { scroll: true, focus: true })}>
          Answer the open questions
          <ArrowRight className="size-3.5" />
        </Button>
      )}
    </div>
  )
}

function ValueBody({ fieldId, field }: { fieldId: string; field: FieldState | undefined }) {
  const def = fieldDefs[fieldId]
  const editField = useApp((s) => s.editField)
  const value = displayValue(field)
  const [editing, setEditing] = useState(false)
  const canEdit = !!def && editable.has(def.kind)
  const narrative = def?.kind === 'narrative'
  const sources = narrative ? dedupe(field?.sources ?? []) : (field?.sources ?? [])

  return (
    <>
      {editing ? (
        <EditForm
          label={def?.label ?? fieldId}
          initial={value ?? ''}
          multiline={narrative}
          type={def?.kind === 'email' ? 'email' : 'text'}
          onCancel={() => setEditing(false)}
          onSave={(v) => {
            setEditing(false)
            if (v.trim() !== (value ?? '')) {
              editField(fieldId, v)
              toast.success(`${def?.label ?? fieldId} updated`, { description: 'The agent won’t overwrite your edit.' })
            }
          }}
        />
      ) : (
        <div className="flex items-start gap-2">
          {narrative ? (
            <div className="min-w-0 flex-1">
              <p className="line-clamp-3 text-[13px] leading-relaxed text-ink">{value}</p>
              <p className="num mt-1 text-[12px] text-ink-3">
                {(value ?? '').split(/\n{2,}/).length} paragraphs · {(value ?? '').split(/\s+/).filter(Boolean).length} words · in full on the page
              </p>
            </div>
          ) : (
            <div className="min-w-0 flex-1 text-[16px] leading-snug font-medium break-words text-ink">
              {def?.kind === 'boolean' ? (field?.value ? 'Yes, included' : 'No, not included') : value}
            </div>
          )}
          {canEdit && (
            <Button variant="ghost" size="icon" className="-mt-0.5 size-7 shrink-0 text-ink-3 hover:text-ink" aria-label={`Edit ${def?.label ?? fieldId}`} onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
          )}
        </div>
      )}
      {field?.note && <p className="-mt-1 text-[12px] text-ink-3">{field.note}</p>}
      {!canEdit && !editing && <p className="-mt-1 text-[12px] text-ink-3">To change this, ask the agent below.</p>}
      {sources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[11px] font-medium text-ink-3">{sources.length === 1 ? 'Source' : `${sources.length} sources`}</p>
          {sources.map((s, i) => (
            <Evidence key={i} source={s} />
          ))}
        </div>
      )}
    </>
  )
}

function RatesBody() {
  const rates = useApp((s) => s.rates)
  const openSource = useApp((s) => s.openSource)
  const doc = useApp((s) => s.docs.find((d) => d.id === rates.rows[0]?.source?.docId))
  if (!rates.rows.length) return <WaitingBody note="The agent reads the rate card during the fill." />
  return (
    <>
      <table className="w-full text-[13px]">
        <thead>
          <tr className="text-left text-[11px] text-ink-3">
            <th className="pb-1.5 font-medium">Role</th>
            <th className="pb-1.5 text-right font-medium">Per hour</th>
            <th className="pb-1.5 pl-3 text-right font-medium">Cell</th>
          </tr>
        </thead>
        <tbody>
          {rates.rows.map((r) => (
            <tr key={r.key} className="border-t border-rule">
              <td className="py-1.5 text-ink">{r.role}</td>
              <td className="num py-1.5 text-right font-medium text-ink">${r.rate.toLocaleString('en-US')}</td>
              <td className="py-1.5 pl-3 text-right">
                {r.source && (
                  <button
                    type="button"
                    className="rounded font-mono text-[11px] text-cobalt hover:underline"
                    aria-label={`View ${r.role} rate in the rate card`}
                    onClick={() => openSource({ docId: r.source!.docId, locator: r.source!.locator, quote: r.source!.quote })}
                  >
                    {r.source.locator?.replace(/^Rates!/, '')}
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {doc && (
        <p className="flex items-center gap-1.5 text-[12px] text-ink-3">
          <DocBadge kind={doc.kind} className="h-4 w-8 text-[9px]" />
          <span className="truncate">{doc.name}</span>
        </p>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function Choices({
  name,
  options,
  value,
  onPick,
  disabled
}: {
  name: string
  options: QuestionOption[]
  value: string
  onPick: (v: string) => void
  disabled?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const onKey = (e: KeyboardEvent, i: number) => {
    const d = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const j = (i + d + options.length) % options.length
    refs.current[j]?.focus()
    onPick(options[j].value)
  }
  const selectedIndex = options.findIndex((o) => o.value === value)
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-col gap-2">
      {options.map((o, i) => {
        const on = value === o.value
        return (
          <div
            key={o.value}
            className={cn('rounded-lg border transition-colors', on ? 'border-cobalt bg-cobalt-soft/60' : 'border-rule bg-panel hover:border-ink-3/60')}
          >
            <button
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on || (selectedIndex < 0 && i === 0) ? 0 : -1}
              disabled={disabled}
              onClick={() => onPick(o.value)}
              onKeyDown={(e) => onKey(e, i)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 pt-2.5 pb-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-cobalt/40 disabled:opacity-60"
            >
              <span
                className={cn(
                  'grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
                  on ? 'border-cobalt bg-cobalt text-on-cobalt' : 'border-ink-3/70 bg-panel'
                )}
                aria-hidden
              >
                {on && <Check className="size-2.5" strokeWidth={3.5} />}
              </span>
              <span className="text-[14px] font-medium text-ink">{o.display}</span>
            </button>
            <div className="flex flex-col gap-1 px-3 pb-2.5 pl-[38px]">
              {o.sources.map((s, k) => (
                <Evidence key={k} source={s} bare />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** A cited quote with its document and a way to open the page it came from. */
function Evidence({ source, bare }: { source: SourceRef; bare?: boolean }) {
  const openSource = useApp((s) => s.openSource)
  const doc = useApp((s) => s.docs.find((d) => d.id === source.docId))
  const name = doc?.name.replace(/\.[^.]+$/, '').replace(/_/g, ' ') ?? source.docId
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', !bare && 'rounded-lg bg-panel-2 px-3 py-2.5')}>
      <p className={cn('leading-snug text-ink-2', bare ? 'text-[12px]' : 'text-[13px] text-ink')}>“{source.quote}”</p>
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-3">
        {doc && <DocBadge kind={doc.kind} className="h-4 w-8 text-[9px]" />}
        <span className="min-w-0 truncate">{name}</span>
        <span className="shrink-0 font-mono">{locatorText(source)}</span>
        <button
          type="button"
          onClick={() => openSource({ docId: source.docId, page: source.page, quote: source.quote, locator: source.locator })}
          className="ml-auto shrink-0 rounded px-1 font-medium text-cobalt hover:underline focus-visible:ring-2 focus-visible:ring-cobalt/40 focus-visible:outline-none"
        >
          View source
        </button>
      </div>
    </div>
  )
}

function EditForm({
  label,
  initial,
  multiline,
  type,
  onSave,
  onCancel
}: {
  label: string
  initial: string
  multiline: boolean
  type: string
  onSave: (v: string) => void
  onCancel: () => void
}) {
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus({ preventScroll: true })
    ref.current?.select()
  }, [])
  const keys = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
    if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSave(v)
    }
  }
  return (
    <div className="flex flex-col gap-2">
      {multiline ? (
        <Textarea ref={ref} aria-label={`New value for ${label}`} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys} className="min-h-40 bg-panel text-[13px] leading-relaxed" />
      ) : (
        <Input ref={ref} aria-label={`New value for ${label}`} type={type} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys} className="h-9 bg-panel text-[14px]" />
      )}
      <div className="flex justify-end gap-1.5">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => onSave(v)}>
          Save
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Footers
// ---------------------------------------------------------------------------

function QuestionFooter({ question, item }: { question: QuestionSet; item: QuestionItem }) {
  const draft = useDraft(question)
  const { busy } = useAgent()
  const p = draftProgress(question, draft)
  const here = isItemAnswered(item, draft[item.fieldId])
  const next = question.items.find((i) => i !== item && !isItemAnswered(i, draft[i.fieldId]))
  const go = (id: string) => useCanvas.getState().openField(id, { scroll: true, focus: true })

  return (
    <footer className="flex items-center gap-2 border-t border-rule bg-panel-2/50 px-4 py-2.5">
      <AnswerDots question={question} draft={draft} />
      <span className="num text-[12px] text-ink-2">
        {p.answered} of {p.total} answered
      </span>
      <div className="ml-auto flex items-center gap-1.5">
        {next ? (
          <Button size="sm" variant={here ? 'default' : 'outline'} onClick={() => go(next.fieldId)}>
            Next question
            <ArrowRight className="size-3.5" />
          </Button>
        ) : (
          <Button size="sm" disabled={!p.ready || busy} onClick={() => sendDraft(question, draft)}>
            {here ? 'Send answers' : 'Send without this'}
          </Button>
        )}
      </div>
    </footer>
  )
}

export function AnswerDots({ question, draft }: { question: QuestionSet; draft: Record<string, string> }) {
  return (
    <span className="flex items-center gap-1" aria-hidden>
      {question.items.map((i) => (
        <span key={i.fieldId} className={cn('size-1.5 rounded-full transition-colors', isItemAnswered(i, draft[i.fieldId]) ? 'bg-cobalt' : 'bg-ink-3/40')} />
      ))}
    </span>
  )
}

function ReviewFooter({ fieldId }: { fieldId: string }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveField = useApp((s) => s.approveField)
  const askAbout = useCanvas((s) => s.askAbout)
  const status = statusOf(fieldId, fields, rates)
  const approvable = status === 'verified' || status === 'user_answered'
  const next = nextToReview(fields, rates, fieldId)
  const shown = fieldId === RATES ? null : displayValue(fields[fieldId])
  const prompt =
    fieldId === RATES ? 'Which rates did you use?' : shown ? `Where does “${shown}” for ${labelOf(fieldId).toLowerCase()} come from?` : `What do you know about the ${labelOf(fieldId).toLowerCase()}?`

  return (
    <footer className="flex items-center gap-0.5 border-t border-rule bg-panel-2/50 py-2 pr-3 pl-2">
      <Button variant="ghost" size="icon" className="size-8 text-ink-2" aria-label="Previous value" onClick={() => step(fieldId, -1)}>
        <ChevronLeft className="size-4" />
      </Button>
      <Button variant="ghost" size="icon" className="size-8 text-ink-2" aria-label="Next value" onClick={() => step(fieldId, 1)}>
        <ChevronRight className="size-4" />
      </Button>
      <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-ink-2" onClick={() => askAbout(prompt)}>
        <MessageSquareText className="size-3.5" />
        Ask about this
      </Button>
      <div className="ml-auto flex items-center">
        {approvable ? (
          <Button size="sm" onClick={() => approveField(fieldId)}>
            <Check className="size-3.5" />
            Approve
          </Button>
        ) : status === 'approved' && next ? (
          <Button size="sm" variant="outline" onClick={() => useCanvas.getState().openField(next, { scroll: true, focus: true })}>
            Next to review
            <ArrowRight className="size-3.5" />
          </Button>
        ) : status === 'approved' ? (
          <span className="flex items-center gap-1 text-[12px] font-medium text-ok">
            <Check className="size-3.5" /> All reviewed
          </span>
        ) : null}
      </div>
    </footer>
  )
}

function dedupe(sources: SourceRef[]) {
  const seen = new Set<string>()
  return sources.filter((s) => {
    const k = `${s.docId}:${s.quote}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
