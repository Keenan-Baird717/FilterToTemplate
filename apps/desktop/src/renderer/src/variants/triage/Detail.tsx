import { ArrowLeft, Check, ChevronDown, ChevronUp, CircleCheck, Pencil, Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type KeyboardEvent } from 'react'
import type { Candidate, FieldState, FieldStatus, QuestionSet } from '../../../../shared/protocol'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useOpenQuestion } from '@/lib/agent'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { approveAndAdvance, answerState, chooseCandidate, focusAsk, move, sendDraft, startEdit } from './actions'
import { Key, KeyOnAccent, StatusPill } from './bits'
import { EvidenceBlock, EvidenceHeading } from './Evidence'
import { canApprove, canEdit, emailOk, isWaiting, itemById, items, RATES_ID, sourcesOf, statusOf, type Item } from './model'
import { useJustChanged, useTriage } from './state'

/** Main column: the selected value, set large, proven by its evidence. */
export function Detail() {
  const selected = useTriage((s) => s.selected)
  const item = itemById[selected] ?? items[0]
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const stamp = useApp((s) => s.flash[item.id])
  const editing = useTriage((s) => s.editing === item.id)
  const question = useOpenQuestion()
  const status = statusOf(item.id, fields, rates)
  const field = fields[item.id]
  const wash = useJustChanged(stamp)

  return (
    <article aria-labelledby="triage-label" className="@container flex min-w-0 flex-col">
      <DetailHeader item={item} status={status} />

      <div className={cn('-mx-3 mt-5 rounded-[6px] px-3 pt-1 pb-2', wash && 'field-wash')}>
        <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 id="triage-label" className="text-[13px] font-medium text-ink-2">
            {item.label}
            {item.required && <span className="font-normal text-ink-3"> · required</span>}
          </h1>
          <code className="max-w-full truncate font-mono text-[11.5px] text-ink-3" title="Tag in layout.docx">
            {item.tag}
          </code>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item.id + (editing ? ':edit' : '')}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.14, ease: 'easeOut' }}
          >
            {editing ? (
              <EditValue item={item} field={field} />
            ) : status === 'conflict' && field?.candidates ? (
              <ConflictValue item={item} field={field} question={question} />
            ) : status === 'missing' ? (
              <MissingValue item={item} field={field} question={question} />
            ) : item.id === RATES_ID ? (
              <RatesValue />
            ) : (
              <PlainValue item={item} field={field} status={status} />
            )}
          </motion.div>
        </AnimatePresence>

        {field?.note && !editing && status !== 'missing' && status !== 'empty' && <p className="mt-2.5 text-[12px] text-ink-3">{field.note}</p>}
      </div>

      {!editing && <Actions item={item} status={status} />}

      {status !== 'conflict' && <Evidence item={item} field={field} status={status} />}
    </article>
  )
}

function DetailHeader({ item, status }: { item: Item; status: FieldStatus }) {
  const setShowDetail = useTriage((s) => s.setShowDetail)
  return (
    <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink-3">
      <Button variant="ghost" size="sm" className="-ml-2 h-7 gap-1 px-2 text-[12px] text-ink-2 md:hidden" onClick={() => setShowDetail(false)}>
        <ArrowLeft className="size-3.5" /> All items
      </Button>
      <span className="hidden truncate md:inline">{item.section.title}</span>
      <span className="num hidden font-mono text-[11px] md:inline">
        {item.n}/{items.length}
      </span>
      <StatusPill status={status} className="ml-1" />
      <div className="ml-auto flex items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-7 text-ink-3" aria-label="Previous item (K)" onClick={() => move(-1)}>
          <ChevronUp className="size-4" />
        </Button>
        <Button variant="ghost" size="icon" className="size-7 text-ink-3" aria-label="Next item (J)" onClick={() => move(1)}>
          <ChevronDown className="size-4" />
        </Button>
      </div>
    </div>
  )
}

const bigValue = 'mt-1.5 font-mono text-[22px] leading-[1.25] font-[460] tracking-[-0.03em] break-words text-ink sm:text-[28px]'
/** Placeholder states are words, not data, so they're set in the UI face. */
const bigPlaceholder = 'mt-1.5 text-[22px] leading-[1.25] font-[450] tracking-[-0.02em] text-ink-3 sm:text-[28px]'

function PlainValue({ item, field, status }: { item: Item; field: FieldState | undefined; status: FieldStatus }) {
  const value = displayValue(field)
  if (isWaiting(status) && !value) {
    return (
      <>
        <p className={bigPlaceholder}>Not written yet</p>
        <p className="mt-2 max-w-[60ch] text-[13px] text-ink-2">{field?.note ?? 'The agent fills this after the open questions are answered.'}</p>
      </>
    )
  }
  if (item.kind === 'narrative') {
    return (
      <div className="mt-2 flex max-w-[68ch] flex-col gap-3 text-[15px] leading-[1.65] text-ink">
        {status === 'drafting' ? (
          <p className="triage-caret whitespace-pre-line">{value?.trimEnd()}</p>
        ) : (
          value?.split('\n\n').map((p, i) => <p key={i}>{p}</p>)
        )}
      </div>
    )
  }
  if (item.kind === 'boolean') {
    return (
      <p className={cn(bigValue, 'flex items-center gap-3')}>
        <span className="font-serif text-[0.9em] leading-none text-ink-2" aria-hidden>
          {field?.value ? '☒' : '☐'}
        </span>
        {value}
      </p>
    )
  }
  return <p className={bigValue}>{value}</p>
}

function EditValue({ item, field }: { item: Item; field: FieldState | undefined }) {
  const initial = displayValue(field) ?? ''
  const [v, setV] = useState(initial)
  const editField = useApp((s) => s.editField)
  const setEditing = useTriage((s) => s.setEditing)
  const cancel = () => setEditing(null)
  const save = () => {
    if (v.trim() !== initial.trim()) editField(item.id, v)
    setEditing(null)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancel()
    }
    if (e.key === 'Enter' && (item.kind !== 'narrative' || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      save()
    }
  }

  return (
    <form
      className="mt-2 flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label htmlFor="triage-edit" className="sr-only">
        {item.label}
      </label>
      {item.kind === 'narrative' ? (
        <Textarea id="triage-edit" value={v} onChange={(e) => setV(e.target.value)} onKeyDown={onKeyDown} rows={9} className="rounded-[4px] text-[14px] leading-relaxed" />
      ) : (
        <Input
          id="triage-edit"
          type={item.kind === 'email' ? 'email' : 'text'}
          value={v}
          onChange={(e) => setV(e.target.value)}
          onKeyDown={onKeyDown}
          className="h-11 rounded-[4px] font-mono text-[17px] tracking-[-0.01em] md:text-[17px]"
        />
      )}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm" className="h-8 gap-2 rounded-[4px]">
          Save value <KeyOnAccent>{item.kind === 'narrative' ? 'Ctrl ↵' : '↵'}</KeyOnAccent>
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-2 rounded-[4px]" onClick={cancel}>
          Cancel <Key touch={false}>Esc</Key>
        </Button>
        <span className="ml-1 text-[12px] text-ink-3">The agent won’t overwrite a value you set.</span>
      </div>
    </form>
  )
}

function ConflictValue({ item, field, question }: { item: Item; field: FieldState; question: QuestionSet | null }) {
  const qItem = question?.items.find((i) => i.fieldId === item.id)
  const draft = useTriage((s) => (question && s.draft.qid === question.id ? s.draft.values[item.id] : undefined))
  const chosen = field.candidates?.find((c) => String(c.value) === draft)
  const candidates = field.candidates ?? []

  return (
    <>
      <p className={chosen ? bigValue : bigPlaceholder}>
        {chosen ? chosen.display : 'Two values'}
        {chosen && <DraftTag />}
      </p>
      <p className="mt-2 max-w-[64ch] text-[13px] text-ink-2">
        {candidates.length} documents disagree. {qItem?.help ?? ''} Pick the date the letter should use.
      </p>
      <div className="mt-5 grid gap-4 @3xl:grid-cols-2">
        {candidates.map((c, i) => (
          <CandidateOption key={String(c.value)} index={i} candidate={c} chosen={c === chosen} onChoose={() => chooseCandidate(item.id, c, question)} />
        ))}
      </div>
    </>
  )
}

function DraftTag() {
  return <span className="ml-3 inline-flex h-5 translate-y-[-4px] items-center rounded-[3px] bg-cobalt-soft px-1.5 align-middle font-sans text-[11px] font-medium tracking-normal text-cobalt">Draft · not sent</span>
}

function CandidateOption({ candidate, index, chosen, onChoose }: { candidate: Candidate; index: number; chosen: boolean; onChoose: () => void }) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col gap-3 rounded-[6px] border p-3 transition-colors',
        chosen ? 'border-cobalt bg-cobalt-soft/50' : 'border-rule'
      )}
    >
      <div className="flex items-center gap-2.5">
        <Key className={cn(chosen && 'border-cobalt/40 text-cobalt')}>{index + 1}</Key>
        <span className="font-mono text-[18px] font-[450] tracking-[-0.01em] text-ink">{candidate.display}</span>
        {chosen && (
          <span className="ml-auto inline-flex items-center gap-1 text-[12px] font-medium text-cobalt">
            <Check className="size-3.5" /> Chosen
          </span>
        )}
      </div>
      {candidate.sources.map((s, i) => (
        <EvidenceBlock key={i} source={s} />
      ))}
      <Button
        type="button"
        variant={chosen ? 'default' : 'outline'}
        size="sm"
        aria-pressed={chosen}
        className="mt-auto h-8 justify-center gap-2 rounded-[4px]"
        onClick={onChoose}
      >
        {chosen ? (
          <>
            <Check className="size-3.5" /> Using this date
          </>
        ) : (
          'Use this date'
        )}
      </Button>
    </div>
  )
}

function MissingValue({ item, field, question }: { item: Item; field: FieldState | undefined; question: QuestionSet | null }) {
  const qItem = question?.items.find((i) => i.fieldId === item.id)
  const draftValues = useTriage((s) => (question && s.draft.qid === question.id ? s.draft.values : null))
  const setDraft = useTriage((s) => s.setDraft)
  const editField = useApp((s) => s.editField)
  const [local, setLocal] = useState('')
  const [touched, setTouched] = useState(false)
  const inQuestion = !!(question && qItem)
  const value = inQuestion ? (draftValues?.[item.id] ?? '') : local
  const isEmail = item.kind === 'email'
  const invalid = isEmail && value.trim() !== '' && !emailOk(value)
  const state = inQuestion ? answerState(question!, draftValues ?? {}) : null
  const otherLeft = state?.missingChoice

  const submit = () => {
    setTouched(true)
    if (invalid) return
    if (inQuestion) {
      if (otherLeft) {
        useTriage.getState().select(otherLeft.fieldId)
        return
      }
      sendDraft(question!)
    } else if (value.trim()) editField(item.id, value)
  }

  return (
    <>
      <p className={value.trim() && !invalid ? bigValue : bigPlaceholder}>
        {value.trim() && !invalid ? value : 'Missing'}
        {inQuestion && value.trim() && !invalid && <DraftTag />}
      </p>
      <p className="mt-2 max-w-[64ch] text-[13px] text-ink-2">{qItem?.help ?? 'No document has this value.'}</p>
      {field?.note && <p className="mt-1 text-[12px] text-ink-3">{field.note}</p>}
      <form
        className="mt-5 flex max-w-[560px] flex-col gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <label htmlFor={`triage-answer-${item.id}`} className="text-[12px] font-medium text-ink">
          {qItem?.label ?? item.label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`triage-answer-${item.id}`}
            type={isEmail ? 'email' : 'text'}
            inputMode={isEmail ? 'email' : undefined}
            autoComplete="off"
            placeholder={qItem?.placeholder ?? (isEmail ? 'name@company.com' : '')}
            value={value}
            onChange={(e) => (inQuestion ? setDraft(question!.id, item.id, e.target.value) : setLocal(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === 'Escape') (e.target as HTMLInputElement).blur()
            }}
            aria-invalid={touched && invalid}
            className="h-10 flex-1 rounded-[4px] font-mono text-[15px] md:text-[15px]"
          />
          <Button type="submit" className="h-10 gap-2 rounded-[4px]" variant={inQuestion && otherLeft ? 'outline' : 'default'} disabled={!inQuestion && !value.trim()}>
            {!inQuestion ? 'Save value' : otherLeft ? 'Next: pick the date' : `Send ${state!.count || ''} answer${state!.count === 1 ? '' : 's'}`.replace('  ', ' ')}
          </Button>
        </div>
        {touched && invalid ? (
          <p className="text-[12px] text-bad">Enter an address like name@acmeholdings.com, or leave it blank to skip.</p>
        ) : inQuestion ? (
          <p className="text-[12px] text-ink-3">{otherLeft ? 'One more answer and the agent can finish the letter.' : 'Optional. Leave it blank and the letter keeps a placeholder.'}</p>
        ) : null}
      </form>
    </>
  )
}

function RatesValue() {
  const rates = useApp((s) => s.rates)
  const [active, setActive] = useState(0)
  const row = rates.rows[active] ?? rates.rows[0]
  if (!rates.rows.length) return <p className={bigPlaceholder}>Not found yet</p>
  return (
    <div className="mt-3 grid gap-5 @3xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div role="radiogroup" aria-label="Rate to check" className="flex flex-col">
        {rates.rows.map((r, i) => (
          <button
            key={r.key}
            type="button"
            role="radio"
            aria-checked={i === active}
            onClick={() => setActive(i)}
            onMouseEnter={() => setActive(i)}
            className={cn(
              'flex items-baseline justify-between gap-4 border-b border-rule px-2 py-2 text-left transition-colors first:border-t',
              i === active ? 'bg-cobalt-soft' : 'hover:bg-panel-2'
            )}
          >
            <span className="text-[14px] text-ink">{r.role}</span>
            <span className="num font-mono text-[20px] font-[450] tracking-[-0.02em] text-ink">
              ${r.rate}
              <span className="text-[12px] text-ink-3">/hr</span>
            </span>
          </button>
        ))}
        <p className="mt-2 text-[12px] text-ink-3">Point at a rate to see its cell.</p>
      </div>
      {row?.source && <EvidenceBlock source={row.source} />}
    </div>
  )
}

function Actions({ item, status }: { item: Item; status: FieldStatus }) {
  const approvable = canApprove(status)
  const editable = canEdit(item, status)
  const reason =
    status === 'conflict'
      ? 'Pick a date to approve.'
      : status === 'missing'
        ? 'Answer this to approve.'
        : isWaiting(status)
          ? 'You can review this once the agent writes it.'
          : null

  return (
    <div className="mt-5 flex flex-wrap items-center gap-2">
      {status === 'approved' ? (
        <span className="inline-flex h-8 items-center gap-1.5 pr-2 text-[13px] font-medium text-ok">
          <CircleCheck className="size-4" /> Approved
        </span>
      ) : (
        <Button
          variant={approvable ? 'default' : 'outline'}
          className="h-8 gap-2 rounded-[4px] px-3"
          disabled={!approvable}
          onClick={() => approveAndAdvance(item.id)}
        >
          <Check className="size-4" /> Approve {approvable ? <KeyOnAccent>A</KeyOnAccent> : <Key touch={false}>A</Key>}
        </Button>
      )}
      {item.id !== RATES_ID && (
        <Button variant="outline" className="h-8 gap-2 rounded-[4px] px-3" disabled={!editable} onClick={() => startEdit(item.id)}>
          <Pencil className="size-3.5" /> Edit <Key touch={false}>E</Key>
        </Button>
      )}
      <Button variant="ghost" className="h-8 gap-2 rounded-[4px] px-3 text-ink-2" onClick={focusAsk}>
        <Sparkles className="size-3.5" /> Ask the agent <Key touch={false}>/</Key>
      </Button>
      {reason && <span className="text-[12px] text-ink-3">{reason}</span>}
    </div>
  )
}

function Evidence({ item, field, status }: { item: Item; field: FieldState | undefined; status: FieldStatus }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  if (item.id === RATES_ID) return null
  const sources = sourcesOf(item.id, fields, rates)

  return (
    <section aria-labelledby="triage-evidence" className="mt-8 flex flex-col gap-3">
      <EvidenceHeading id="triage-evidence" title={status === 'missing' ? 'Why it’s missing' : 'Evidence'} count={sources.length || undefined} />
      {sources.length ? (
        <div className={cn('grid gap-x-4 gap-y-5', sources.length > 1 && '@3xl:grid-cols-2')}>
          {sources.map((s, i) => (
            <EvidenceBlock key={`${s.docId}-${i}`} source={s} className={cn(sources.length === 1 && 'max-w-[560px]')} />
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-ink-3">
          {field?.by === 'user' ? 'You set this value, so there’s no document quote to check.' : isWaiting(status) ? 'Quotes appear here as the agent writes.' : 'No quotes yet.'}
        </p>
      )}
    </section>
  )
}
