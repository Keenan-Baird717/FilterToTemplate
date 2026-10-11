import { ArrowLeft, ArrowRight, Check, CircleCheck, LoaderCircle, PartyPopper, Send, SkipForward } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { QuestionItem, QuestionSet } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { EvidencePage } from '@/components/EvidencePage'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { shortDocName, SourceChip, useLatestTurn, where } from './parts'

const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())

export interface QuestionDraft {
  index: number
  setIndex: (i: number) => void
  answers: Record<string, string>
  setAnswers: (fn: (a: Record<string, string>) => Record<string, string>) => void
}

export function StepQuestions({
  question,
  draft,
  sentId,
  onSend,
  onSkip,
  onDone
}: {
  question: QuestionSet | null
  draft: QuestionDraft
  sentId: string | null
  onSend: (question: QuestionSet, values: Record<string, string>) => void
  onSkip: (question: QuestionSet) => void
  onDone: () => void
}) {
  const turn = useLatestTurn()
  const answerRunning = turn.busy && turn.mode === 'answer'

  if (question && !sentId) return <Asking question={question} draft={draft} onSend={onSend} onSkip={onSkip} />
  if (sentId || answerRunning) return <Writing questionId={sentId ?? turn.answerId ?? null} onDone={onDone} />
  return <NothingToAnswer onDone={onDone} />
}

// ---------------------------------------------------------------------------
// One question at a time
// ---------------------------------------------------------------------------

function Asking({ question, draft, onSend, onSkip }: { question: QuestionSet; draft: QuestionDraft; onSend: (q: QuestionSet, v: Record<string, string>) => void; onSkip: (q: QuestionSet) => void }) {
  const { index, setIndex, answers, setAnswers } = draft
  const reduce = useReducedMotion()
  const items = question.items
  const i = Math.min(index, items.length - 1)
  const item = items[i]
  const last = i === items.length - 1
  const [error, setError] = useState<string | null>(null)
  const [dir, setDir] = useState(1)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigated = useRef(false)
  const current = useRef(item.fieldId)
  current.current = item.fieldId

  const go = (to: number) => {
    if (to === i || to < 0 || to >= items.length) return
    navigated.current = true
    setDir(to > i ? 1 : -1)
    setError(null)
    setIndex(to)
  }

  const choose = (value: string) => {
    setAnswers((a) => ({ ...a, [item.fieldId]: value }))
    setError(null)
  }

  const next = (override?: string) => {
    const v = override ?? answers[item.fieldId] ?? ''
    if (item.kind === 'choice' && !v) return setError('Choose one to continue.')
    if (item.inputType === 'email' && v.trim() && !emailOk(v)) return setError('That doesn’t look like an email address. Fix it, or clear it to skip.')
    setError(null)
    if (!last) return go(i + 1)
    const values = { ...answers, [item.fieldId]: v }
    const unanswered = items.findIndex((it) => it.kind === 'choice' && !values[it.fieldId])
    if (unanswered >= 0) {
      go(unanswered)
      return setError('Choose one to continue.')
    }
    onSend(question, values)
  }

  // Move focus with the question (once it has entered) so keyboard and screen-reader users follow along.
  const focusIn = (fieldId: string, kind: QuestionItem['kind']) => {
    if (!navigated.current || current.current !== fieldId) return
    navigated.current = false
    if (kind === 'text') inputRef.current?.focus()
    else headingRef.current?.focus({ preventScroll: true })
  }

  // 1/2 to choose, Enter to continue, Esc to go back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return
      if (document.querySelector('[role="dialog"][data-state="open"]')) return
      const t = e.target as HTMLElement
      const typing = !!t.closest('input, textarea, [contenteditable="true"]')
      if (item.kind === 'choice' && !typing && /^[1-9]$/.test(e.key)) {
        const opt = item.options?.[Number(e.key) - 1]
        if (opt) {
          e.preventDefault()
          choose(opt.value)
        }
      } else if (e.key === 'Enter' && !e.shiftKey) {
        const option = t.closest<HTMLElement>('[data-option]')?.dataset.option
        if (!option && !typing && t.closest('button, a, [role="button"]')) return
        e.preventDefault()
        if (option) choose(option)
        next(option)
      } else if (e.key === 'Escape' && i > 0) {
        e.preventDefault()
        go(i - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="mx-auto w-full max-w-[960px] px-4 pt-6 pb-16 sm:px-8 sm:pt-10">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <p className="text-[13px] font-medium text-ink-3 tabular-nums">
          <span className="hidden md:inline">Step 3 of 4 · </span>Question {i + 1} of {items.length}
        </p>
        <ol className="flex items-center gap-1" aria-label="Questions">
          {items.map((it, n) => {
            const answered = !!answers[it.fieldId]?.trim()
            return (
              <li key={it.fieldId}>
                <button
                  type="button"
                  onClick={() => go(n)}
                  aria-current={n === i ? 'step' : undefined}
                  aria-label={`Question ${n + 1}: ${it.label}${answered ? ' (answered)' : ''}`}
                  className="flex h-6 items-center rounded-full px-1"
                >
                  <span className={cn('block h-2 rounded-full transition-all duration-300', n === i ? 'w-7 bg-cobalt' : answered ? 'w-2 bg-ink-2' : 'w-2 bg-ink-3/35')} />
                </button>
              </li>
            )
          })}
        </ol>
        <button type="button" onClick={() => onSkip(question)} className="ml-auto rounded-full px-3 py-1.5 text-[14px] text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink">
          Skip for now
        </button>
      </div>

      <AnimatePresence mode="wait" custom={dir} initial={false}>
        <motion.div
          key={item.fieldId}
          custom={dir}
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: dir * 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: dir * -12 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          onAnimationComplete={() => focusIn(item.fieldId, item.kind)}
        >
          <p className="mt-8 flex items-center gap-2 text-[14px] font-semibold text-ink-2 sm:mt-12">
            <span className="flex items-center gap-1 text-ink-3 tabular-nums">
              {i + 1}
              <ArrowRight className="size-3.5" aria-hidden />
            </span>
            {fieldDefs[item.fieldId]?.label}
          </p>
          <h2 ref={headingRef} id={`q-${item.fieldId}`} tabIndex={-1} className="steps-display mt-3 max-w-[22ch] text-[30px] leading-[1.12] text-ink focus:outline-none sm:text-[42px]">
            {item.label}
          </h2>
          {item.help && <p className="mt-4 max-w-[60ch] text-[17px] leading-relaxed text-ink-2">{item.help}</p>}

          <div className="mt-8 sm:mt-10">
            {item.kind === 'choice' ? (
              <Choices item={item} value={answers[item.fieldId] ?? ''} onChoose={choose} onConfirm={(v) => next(v)} />
            ) : (
              <TextAnswer item={item} inputRef={inputRef} value={answers[item.fieldId] ?? ''} invalid={!!error} onChange={(v) => setAnswers((a) => ({ ...a, [item.fieldId]: v }))} />
            )}
          </div>

          <p role="alert" className={cn('min-h-6 pt-4 text-[14.5px] font-medium text-bad', !error && 'invisible')}>
            {error}
          </p>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3">
            <Button className="h-12 gap-2 rounded-full px-7 text-[16px] font-semibold" onClick={() => next()}>
              {last ? (
                <>
                  Send answers <Send className="size-4" />
                </>
              ) : (
                <>
                  Continue <ArrowRight className="size-4" />
                </>
              )}
            </Button>
            <span className="hidden items-center gap-1.5 text-[13px] text-ink-3 sm:flex">
              or press <Kbd className="h-6 bg-panel-2 px-1.5 text-ink-2">Enter ↵</Kbd>
            </span>
            {i > 0 && (
              <Button variant="ghost" className="ml-auto h-11 gap-2 rounded-full px-4 text-[15px] text-ink-2" onClick={() => go(i - 1)}>
                <ArrowLeft className="size-4" /> Back
                <Kbd className="hidden h-6 bg-panel-2 px-1.5 text-ink-3 sm:inline-flex">Esc</Kbd>
              </Button>
            )}
          </div>
          {item.kind === 'text' && <WhatDocumentsSay fieldId={item.fieldId} />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}

function Choices({ item, value, onChoose, onConfirm }: { item: QuestionItem; value: string; onChoose: (v: string) => void; onConfirm: (v: string) => void }) {
  const openSource = useApp((s) => s.openSource)
  const docs = useApp((s) => s.docs)
  const options = item.options ?? []
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIdx = options.findIndex((o) => o.value === value)

  const onKeyDown = (e: ReactKeyboardEvent, n: number) => {
    const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!delta) return
    e.preventDefault()
    const to = (n + delta + options.length) % options.length
    onChoose(options[to].value)
    refs.current[to]?.focus()
  }

  return (
    <div role="radiogroup" aria-labelledby={`q-${item.fieldId}`} className="grid gap-4 md:grid-cols-2">
      {options.map((o, n) => {
        const selected = o.value === value
        const src = o.sources[0]
        const doc = src ? docs.find((d) => d.id === src.docId) : undefined
        return (
          <div
            key={o.value}
            onClick={() => onChoose(o.value)}
            onDoubleClick={() => onConfirm(o.value)}
            className={cn(
              'group flex min-w-0 cursor-pointer flex-col rounded-2xl border-2 p-2 transition-colors',
              selected ? 'border-cobalt bg-cobalt-soft/60' : 'border-rule bg-panel hover:border-ink-3/40'
            )}
          >
            <button
              ref={(el) => {
                refs.current[n] = el
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected || (selectedIdx < 0 && n === 0) ? 0 : -1}
              data-option={o.value}
              aria-describedby={`ev-${item.fieldId}-${n}`}
              onClick={(e) => {
                e.stopPropagation()
                onChoose(o.value)
              }}
              onKeyDown={(e) => onKeyDown(e, n)}
              className="flex min-w-0 items-center gap-3.5 rounded-xl px-3 py-3 text-left"
            >
              <span
                className={cn(
                  'flex size-9 shrink-0 items-center justify-center rounded-lg border text-[15px] font-semibold tabular-nums transition-colors',
                  selected ? 'border-transparent bg-cobalt text-on-cobalt' : 'border-rule bg-panel text-ink-2 group-hover:border-ink-3/40'
                )}
                aria-hidden
              >
                {selected ? <Check className="size-4.5" strokeWidth={2.75} /> : n + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[21px] leading-tight font-semibold text-ink">{o.display}</span>
                {src && (
                  <span className="mt-0.5 block truncate text-[13.5px] text-ink-3">
                    From {doc ? shortDocName(doc.name) : src.docId} · {where(src)}
                  </span>
                )}
              </span>
            </button>
            <div id={`ev-${item.fieldId}-${n}`} className="flex flex-1 flex-col gap-2 px-1 pt-1 pb-1">
              {o.sources.map((s, k) => (
                <EvidencePage key={k} docId={s.docId} page={s.page} quote={s.quote} locator={s.locator} compact className="flex-1 rounded-lg" />
              ))}
            </div>
            {src && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  openSource({ docId: src.docId, page: src.page, quote: src.quote, locator: src.locator })
                }}
                className="mx-2 mt-1.5 mb-1 self-start rounded px-1 text-[13.5px] text-ink-3 underline-offset-4 hover:text-ink hover:underline"
              >
                Open the full document
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}

function TextAnswer({
  item,
  value,
  invalid,
  onChange,
  inputRef
}: {
  item: QuestionItem
  value: string
  invalid: boolean
  onChange: (v: string) => void
  inputRef: React.RefObject<HTMLInputElement | null>
}) {
  return (
    <div>
      <input
        ref={inputRef}
        id={`answer-${item.fieldId}`}
        type={item.inputType ?? 'text'}
        inputMode={item.inputType === 'email' ? 'email' : undefined}
        autoComplete={item.inputType === 'email' ? 'email' : 'off'}
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={item.placeholder ?? 'Type your answer'}
        aria-labelledby={`q-${item.fieldId}`}
        aria-describedby={`hint-${item.fieldId}`}
        aria-invalid={invalid || undefined}
        className={cn(
          'steps-answer w-full max-w-[640px] border-0 border-b-2 bg-transparent pb-3 text-[24px] text-ink transition-colors outline-none focus:[border-color:var(--steps-focus)] focus-visible:outline-none sm:text-[30px]',
          invalid ? 'border-bad' : 'border-rule'
        )}
      />
      <p id={`hint-${item.fieldId}`} className="mt-3 text-[14.5px] text-ink-3">
        Leave it blank to skip. The letter keeps a placeholder until you add one.
      </p>
    </div>
  )
}

/** For a missing value: the closest thing the documents say, so the user knows why we're asking. */
function WhatDocumentsSay({ fieldId }: { fieldId: string }) {
  const field = useApp((s) => s.fields[fieldId])
  const evidence = field?.sources ?? []
  if (!evidence.length) return null
  return (
    <div className="mt-12 max-w-[560px] border-t border-rule pt-6">
      <p className="text-[14px] font-semibold text-ink-2">What your documents say</p>
      <div className="mt-3 flex flex-col gap-3">
        {evidence.map((s, k) => (
          <EvidencePage key={k} docId={s.docId} page={s.page} quote={s.quote} locator={s.locator} compact className="rounded-lg" />
        ))}
      </div>
      {field?.note && <p className="mt-3 text-[13.5px] text-ink-3">{field.note}.</p>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// After sending: watch the agent finish the letter
// ---------------------------------------------------------------------------

function Writing({ questionId, onDone }: { questionId: string | null; onDone: () => void }) {
  const turn = useLatestTurn()
  const reduce = useReducedMotion()
  const scope = useApp((s) => s.fields.scopeSummary)
  const answered = useApp((s) => (questionId ? s.answered[questionId] : undefined))
  const { done, total } = useSummary()
  const finished = !turn.busy && turn.mode === 'answer'
  const tools = turn.mode === 'answer' ? turn.tools : []
  const text = typeof scope?.value === 'string' ? scope.value : ''
  const drafting = scope?.status === 'drafting'
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    if (!finished) return
    const t = setTimeout(() => onDoneRef.current(), 2600)
    return () => clearTimeout(t)
  }, [finished])

  const recap = answered && answered !== 'skipped' ? Object.entries(answered).filter(([, v]) => v.trim()) : []

  return (
    <div className="mx-auto w-full max-w-[880px] px-4 pt-8 pb-16 sm:px-8 sm:pt-12" aria-live="polite">
      <p className="text-[13px] font-medium text-ink-3">Step 3 of 4 · Answers sent</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.h1
          key={finished ? 'done' : 'writing'}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          tabIndex={-1}
          className="steps-display mt-1.5 text-[28px] leading-[1.15] text-ink focus:outline-none sm:text-[38px]"
        >
          {finished ? (done === total ? `All ${total} items are filled` : 'Your letter is updated') : 'Writing the scope of engagement'}
        </motion.h1>
      </AnimatePresence>
      <p className="mt-2.5 text-[16px] text-ink-2">
        {finished ? 'Next, review each section and export the letter.' : 'The agent is using your answers to finish the letter. This takes a few seconds.'}
      </p>

      {recap.length > 0 && (
        <ul className="mt-6 flex flex-wrap gap-2">
          {recap.map(([fieldId, v]) => (
            <li key={fieldId} className="flex items-center gap-2 rounded-full bg-cobalt-soft px-3 py-1 text-[14px] text-ink">
              <Check className="size-3.5" strokeWidth={2.5} aria-hidden />
              <span className="text-ink-2">{fieldDefs[fieldId]?.label}:</span>
              <span className="font-medium [overflow-wrap:anywhere]">{displayAnswer(fieldId, v)}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8 grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ol className="flex flex-col gap-1" aria-label="What the agent did">
          {tools.length === 0 && (
            <li className="flex items-center gap-3 py-1.5">
              <LoaderCircle className="size-[18px] shrink-0 animate-spin text-ink-2" aria-hidden />
              <Shimmer as="span" className="text-[14.5px] font-medium" duration={1.6}>
                Sending your answers…
              </Shimmer>
            </li>
          )}
          {tools.map((t) => {
            const ok = t.state === 'output-available'
            return (
              <motion.li
                key={t.toolCallId}
                initial={reduce ? false : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex min-w-0 items-start gap-3 py-1.5"
              >
                {ok ? (
                  <CircleCheck className="mt-0.5 size-[18px] shrink-0 text-ok" aria-label="Done" />
                ) : (
                  <LoaderCircle className="mt-0.5 size-[18px] shrink-0 animate-spin text-ink-2" aria-label="Working" />
                )}
                <span className={cn('min-w-0 text-[14.5px] leading-snug [overflow-wrap:anywhere]', ok ? 'text-ink-2' : 'font-medium text-ink')}>{t.title ?? t.toolName}</span>
              </motion.li>
            )
          })}
        </ol>

        <article className="min-w-0 rounded-xl bg-paper px-6 py-6 text-paper-ink sm:px-9 sm:py-8" style={{ boxShadow: 'var(--shadow-page)' }} aria-label="Scope of engagement">
          <p className="font-sans text-[11px] font-semibold tracking-[0.08em] text-paper-ink/50 uppercase">Scope of engagement</p>
          {text ? (
            <div className={cn('mt-4 flex flex-col gap-3 font-serif text-[17px] leading-[1.7]', drafting && 'caret')}>
              {text.split('\n\n').map((p, k) => (
                <p key={k}>{p}</p>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex flex-col gap-3" aria-hidden>
              {[92, 100, 84, 96, 60].map((w, k) => (
                <span key={k} className="block h-3 animate-pulse rounded-full bg-paper-rule/60" style={{ width: `${w}%` }} />
              ))}
            </div>
          )}
          {scope?.status === 'verified' && scope.sources.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-1.5 border-t border-paper-rule pt-4">
              {dedupeDocs(scope.sources).map((s, k) => (
                <SourceChip key={k} source={s} onPaper />
              ))}
            </div>
          )}
        </article>
      </div>

      <AnimatePresence>
        {finished && (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3"
          >
            <Button className="h-12 gap-2 rounded-full px-7 text-[16px] font-semibold" onClick={onDone}>
              Review and export <ArrowRight className="size-4" />
            </Button>
            <span className="flex items-center gap-3 text-[14px] text-ink-3">
              <span className="relative h-1 w-24 overflow-hidden rounded-full bg-rule" aria-hidden>
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-cobalt"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 2.6, ease: 'linear' }}
                />
              </span>
              Opening review…
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function displayAnswer(fieldId: string, v: string) {
  if (fieldId === 'effectiveDate') {
    const d = new Date(`${v}T00:00:00`)
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
  }
  return v
}

function dedupeDocs<T extends { docId: string; page?: number; locator?: string }>(sources: T[]) {
  const seen = new Set<string>()
  return sources.filter((s) => {
    const k = `${s.docId}:${s.page ?? s.locator}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// ---------------------------------------------------------------------------

function NothingToAnswer({ onDone }: { onDone: () => void }) {
  const { counts } = useSummary()
  const turn = useLatestTurn()
  const left = counts.conflict + counts.missing
  const filling = turn.busy && turn.mode === 'fill'
  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pt-14 pb-16 sm:px-8 sm:pt-24">
      <span className={cn('flex size-14 items-center justify-center rounded-full', left ? 'bg-panel-2 text-ink-2' : 'bg-ok-soft text-ok')}>
        {filling ? <LoaderCircle className="size-6 animate-spin" /> : left ? <SkipForward className="size-6" strokeWidth={1.75} /> : <PartyPopper className="size-6" strokeWidth={1.75} />}
      </span>
      <p className="mt-7 text-[13px] font-medium text-ink-3">Step 3 of 4</p>
      <h1 tabIndex={-1} className="steps-display mt-1.5 text-[30px] leading-[1.15] text-ink focus:outline-none sm:text-[38px]">
        Nothing to answer
      </h1>
      <p className="mt-3 max-w-[56ch] text-[17px] leading-relaxed text-ink-2">
        {filling
          ? 'The agent is still reading your documents. If it needs you, the questions show up here.'
          : left
            ? `You skipped the open questions, so ${left} item${left === 1 ? ' is' : 's are'} still empty. You can fill ${left === 1 ? 'it' : 'them'} in during review.`
            : 'The agent has everything it needs. Next, check the letter and export it.'}
      </p>
      <Button className="mt-9 h-12 gap-2 rounded-full px-7 text-[16px] font-semibold" onClick={onDone}>
        Review and export <ArrowRight className="size-4" />
      </Button>
    </div>
  )
}
