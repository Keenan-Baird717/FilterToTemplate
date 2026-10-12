import { ArrowDown, Check, Circle, PanelLeftOpen, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useState } from 'react'
import { fieldDefs, type SectionDef } from '../../../../agent-core/demo-data'
import type { QuestionItem } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { CitationChip } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { submitAnswers, useAgent } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { emailOk, goToField, goToNextQuestion, sendDrafts, shortLabelOf, useAsk, useInplace, useRowMode } from './state'

// Answer controls that live inside the field rows, the slim bar that
// collects them, and the "n to answer" marker on section headers.

const send = () => sendDrafts(submitAnswers)
const editableKinds = new Set(['text', 'email', 'money', 'date'])

/** Extra content under a row's value (FieldRowContext.renderExtra). */
export function RowExtra({ id }: { id: string }) {
  const mode = useRowMode(id)
  const ask = useAsk()
  const sentValue = useInplace((s) => s.sent?.values[id])
  const status = useApp((s) => s.fields[id]?.status)
  const selected = useInplace((s) => s.selected === id)
  const item = ask.items.find((i) => i.fieldId === id)

  return (
    <>
      {mode === 'ask' && item && ask.question && (
        <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
          {item.kind === 'choice' ? <ChoiceTiles item={item} questionId={ask.question.id} /> : <TextAnswer item={item} questionId={ask.question.id} />}
        </div>
      )}
      {mode === 'none' && status === 'missing' && editableKinds.has(fieldDefs[id]?.kind ?? '') && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            document.getElementById(`field-${id}`)?.querySelector<HTMLButtonElement>('button[aria-label^="Edit "]')?.click()
          }}
          className="w-fit text-[12px] font-medium text-cobalt-ink hover:underline [[id^=field-]:has(input[id^=edit-])_&]:hidden"
        >
          Add it yourself
        </button>
      )}
      {mode === 'applying' && status === 'missing' && sentValue && (
        <Shimmer className="text-[13px]" duration={1.4}>{`Adding ${sentValue}…`}</Shimmer>
      )}
      {selected && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            useApp.getState().setPane('sources')
          }}
          className="flex w-fit items-center gap-1.5 rounded-md border border-rule bg-panel px-2 py-1 text-[12px] font-medium text-cobalt-ink lg:hidden"
        >
          <PanelLeftOpen className="size-3.5" /> Show evidence
        </button>
      )}
    </>
  )
}

/** The conflict's candidates as choice tiles, each with the line it was read from. */
function ChoiceTiles({ item, questionId }: { item: QuestionItem; questionId: string }) {
  const value = useInplace((s) => s.drafts[questionId]?.[item.fieldId] ?? '')
  const nudged = useInplace((s) => s.nudgeAt > 0)
  const setDraft = useInplace((s) => s.setDraft)
  const choose = (v: string) => {
    setDraft(questionId, item.fieldId, v)
    useInplace.getState().select(item.fieldId)
  }

  return (
    <div data-answer-control className="flex flex-col gap-2">
      {item.help && <p className="text-[12px] text-ink-3">{item.help}</p>}
      <RadioGroup value={value} onValueChange={choose} aria-label={item.label} className="grid gap-2 @lg:grid-cols-2">
        {item.options?.map((o) => {
          const id = `inplace-${questionId}-${item.fieldId}-${o.value}`
          const chosen = value === o.value
          return (
            <div
              key={o.value}
              onClick={() => choose(o.value)}
              className={cn(
                'flex min-w-0 cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors',
                chosen ? 'border-cobalt/60 bg-cobalt-soft/70' : 'border-rule bg-panel hover:border-cobalt/35'
              )}
            >
              <RadioGroupItem value={o.value} id={id} className="mt-[3px] bg-panel" />
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={id} className="cursor-pointer text-[14px] leading-snug font-medium text-ink">
                  {o.display}
                </Label>
                {o.sources.map((s, i) => (
                  <div key={i} className="flex min-w-0 flex-col items-start gap-1.5">
                    <p className="text-[12px] leading-snug text-ink-2">“{s.quote}”</p>
                    <span className="max-w-full" onClick={(e) => e.stopPropagation()}>
                      <CitationChip source={s} className="h-5 text-[11px]" />
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </RadioGroup>
      {nudged && !value && <p className="text-[12px] text-bad">Pick a date to send your answers.</p>}
    </div>
  )
}

/** A missing value: type it here, with the closest mention as a hint. */
function TextAnswer({ item, questionId }: { item: QuestionItem; questionId: string }) {
  const value = useInplace((s) => s.drafts[questionId]?.[item.fieldId] ?? '')
  const nudged = useInplace((s) => s.nudgeAt > 0)
  const setDraft = useInplace((s) => s.setDraft)
  const field = useApp((s) => s.fields[item.fieldId])
  const [blurred, setBlurred] = useState(false)
  const id = `inplace-${questionId}-${item.fieldId}`
  const invalid = item.inputType === 'email' && value.trim() !== '' && !emailOk(value)
  const showError = invalid && (blurred || nudged)
  const mention = field?.sources[0]

  return (
    <div data-answer-control className="flex flex-col gap-2.5">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="flex items-baseline gap-2 text-[12px] font-medium text-ink-2">
          {item.label}
          <span className="font-normal text-ink-3">Optional</span>
        </label>
        <Input
          id={id}
          type={item.inputType ?? 'text'}
          inputMode={item.inputType === 'email' ? 'email' : undefined}
          autoComplete="off"
          placeholder={item.placeholder}
          value={value}
          onChange={(e) => setDraft(questionId, item.fieldId, e.target.value)}
          onFocus={() => useInplace.getState().select(item.fieldId)}
          onBlur={() => setBlurred(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              setBlurred(true)
              send()
            }
          }}
          aria-invalid={showError || undefined}
          aria-describedby={showError ? `${id}-error` : undefined}
          className="h-8 max-w-[360px] bg-panel text-[14px]"
        />
        {showError && (
          <p id={`${id}-error`} className="text-[12px] text-bad">
            Enter an address like name@acmeholdings.com, or leave it blank.
          </p>
        )}
      </div>
      {mention && (
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-ink-3">
          <p>
            Closest mention: <span className="text-ink-2">“{mention.quote}”</span>
          </p>
          <CitationChip source={mention} className="h-5 text-[11px]" />
        </div>
      )}
      {field?.note && <p className="text-[12px] text-ink-3">{field.note}</p>}
    </div>
  )
}

/** Pinned under the progress strip once an answer is drafted; then shows the agent applying them. */
export function AnswerBar() {
  const ask = useAsk()
  const sent = useInplace((s) => s.sent)
  const show = (!!ask.question && ask.anyDrafted) || !!sent

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="answer-bar"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
          className="shrink-0 overflow-hidden"
        >
          <div
            role="region"
            aria-label="Your answers"
            className={cn(
              'flex min-h-11 flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-1.5 sm:px-6',
              sent?.phase === 'done' ? 'border-rule bg-ok-soft/60' : 'border-cobalt/15 bg-cobalt-soft/60'
            )}
          >
            {sent ? <SentState /> : <DraftState />}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function DraftState() {
  const ask = useAsk()
  const { busy } = useAgent()
  const allDone = ask.answered === ask.items.length

  return (
    <>
      <span className="num text-[13px] font-semibold text-ink" aria-live="polite">
        {ask.answered} of {ask.items.length} answered
      </span>
      <ul className="hidden min-w-0 flex-1 items-center gap-1 sm:flex" aria-label="Questions">
        {ask.items.map((item) => {
          const done = ask.done(item)
          return (
            <li key={item.fieldId} className="flex items-center gap-1 text-ink-3 before:text-[12px] first:before:hidden before:content-['·']">
              <button
                type="button"
                onClick={() => goToField(item.fieldId, { focus: true })}
                className={cn(
                  'inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[12px] transition-colors hover:bg-panel/80',
                  done ? 'text-ink' : 'text-ink-2'
                )}
              >
                {shortLabelOf(item.fieldId)}
                {done ? <Check className="size-3.5 text-ok" aria-label="answered" /> : <Circle className="size-2.5 text-ink-3" aria-label="not answered" />}
              </button>
            </li>
          )
        })}
      </ul>
      <div className="ml-auto flex items-center gap-1.5">
        {!allDone && (
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px] hover:bg-panel/70" onClick={() => goToNextQuestion()}>
            <ArrowDown className="size-3.5" /> Next
          </Button>
        )}
        <Button size="sm" className="h-7 px-3 text-[12px]" disabled={busy} onClick={send}>
          Send answers
        </Button>
      </div>
    </>
  )
}

function SentState() {
  const sent = useInplace((s) => s.sent)
  if (!sent) return null
  if (sent.phase !== 'done') {
    return (
      <span className="flex items-center gap-2 text-[13px]">
        <span className="size-1.5 animate-pulse rounded-full bg-cobalt" aria-hidden />
        <Shimmer as="span" className="text-[13px] font-medium" duration={1.6}>
          Applying your answers…
        </Shimmer>
      </span>
    )
  }
  const n = sent.changed ?? 0
  return (
    <>
      <span className="flex items-center gap-1.5 text-[13px] font-medium text-ok" role="status">
        <Check className="size-4" /> Updated {n} value{n === 1 ? '' : 's'}
      </span>
      <Button
        variant="ghost"
        size="icon"
        className="ml-auto size-7 text-ink-3 hover:bg-panel/70"
        aria-label="Dismiss"
        onClick={() => useInplace.setState({ sent: null })}
      >
        <X className="size-3.5" />
      </Button>
    </>
  )
}

/** "1 to answer" next to a section's count; jumps to the row. */
export function SectionMarker({ section }: { section: SectionDef }) {
  const ask = useAsk()
  const open = ask.items.filter((i) => section.fields.includes(i.fieldId) && !ask.done(i))
  return (
    <AnimatePresence initial={false}>
      {open.length > 0 && (
        <motion.button
          key="marker"
          type="button"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={{ duration: 0.15 }}
          onClick={() => goToField(open[0].fieldId, { focus: true })}
          className="inline-flex h-5 shrink-0 items-center gap-1.5 rounded-full bg-warn-soft px-2 text-[11px] font-medium text-warn transition-colors hover:bg-warn-soft/70"
        >
          <span className="size-1.5 rounded-full bg-warn" aria-hidden />
          {open.length} to answer
        </motion.button>
      )}
    </AnimatePresence>
  )
}
