import { Check, ChevronLeft, ChevronRight, Loader2, LocateFixed, Minus, PenLine, X } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { QuestionItem, QuestionSet } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { CitationChip, StatusChip } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { skipQuestion, submitAnswers, useAgent, useOpenQuestion, useSummary } from '@/lib/agent'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { emailOk, isTyping, modalOpen, needsYou, scrollToRow, showRow, useDock } from './model'

type Variant = 'float' | 'sheet'

/**
 * The open question set as one focused card: one question at a time, with
 * the evidence for each option. Floats at the top right of the Fields pane
 * (a bottom sheet on phones), minimizes to a pill, and after Send answers
 * shows the agent applying them before it gets out of the way.
 */
export function FocusCard({ variant }: { variant: Variant }) {
  const open = useOpenQuestion()
  const applying = useDock((s) => s.applying)
  const mode = useDock((s) => s.mode)
  const fields = useApp((s) => s.fields)
  // In Preview, sit below the preview's toolbar so its switch stays reachable.
  const lowered = useApp((s) => s.view === 'preview')
  const reduce = useReducedMotion()
  const pillRef = useRef<HTMLButtonElement>(null)
  const refocusPill = useRef(false)

  useEffect(() => {
    useDock.getState().syncQuestion(open)
  }, [open])

  const q = applying?.question ?? open
  const minimized = mode === 'min' && !applying
  const pending = open ? open.items.filter((i) => needsYou(fields[i.fieldId])).length : 0

  const minimize = () => {
    refocusPill.current = !!document.activeElement?.closest('[data-dock-card]')
    useDock.getState().minimize()
  }

  useEffect(() => {
    if (minimized && refocusPill.current) {
      refocusPill.current = false
      requestAnimationFrame(() => pillRef.current?.focus())
    }
  }, [minimized])

  const sheet = variant === 'sheet'
  const t = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 36 }

  return (
    <AnimatePresence initial={false} mode="popLayout">
      {q && !minimized && (
        <motion.section
          key="card"
          data-dock-card=""
          aria-label="Questions for you"
          initial={sheet ? { y: '100%' } : { opacity: 0, scale: 0.96, y: -6 }}
          animate={sheet ? { y: 0 } : { opacity: 1, scale: 1, y: 0 }}
          exit={sheet ? { y: '100%' } : { opacity: 0, scale: 0.96, y: -6 }}
          transition={t}
          style={{ transformOrigin: 'top right' }}
          className={cn(
            'flex flex-col overflow-hidden border-rule bg-panel shadow-[var(--dock-float)]',
            sheet
              ? 'absolute inset-x-0 -bottom-px z-30 max-h-[82%] rounded-t-2xl border-t pb-px'
              : cn(
                  'absolute right-4 z-30 max-h-[min(600px,calc(100dvh-220px))] w-[372px] max-w-[calc(100%-2rem)] rounded-xl border',
                  lowered ? 'top-14' : 'top-3'
                )
          )}
        >
          {applying ? (
            <ApplyingView question={applying.question} values={applying.values} startedAt={applying.startedAt} sheet={sheet} />
          ) : (
            open && <Steps question={open} onMinimize={minimize} sheet={sheet} />
          )}
        </motion.section>
      )}
      {q && minimized && (
        <motion.div
          key="pill"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          transition={t}
          style={{ transformOrigin: sheet ? 'bottom center' : 'top right' }}
          className={cn('pointer-events-none z-30 flex', sheet ? 'absolute inset-x-0 bottom-4 justify-center' : cn('absolute right-4', lowered ? 'top-14' : 'top-3'))}
        >
          <button
            ref={pillRef}
            type="button"
            onClick={() => open && useDock.getState().openCard(open)}
            aria-label={`Show the ${pending || open?.items.length} questions that need you`}
            className="pointer-events-auto flex h-9 items-center gap-2 rounded-full border border-warn/30 bg-panel pr-2 pl-3.5 text-[13px] font-medium text-ink shadow-[var(--dock-float)] transition-colors hover:border-warn/60"
          >
            <span className="size-2 rounded-full bg-warn" aria-hidden />
            {pending || open?.items.length} need you
            <span className="flex size-6 items-center justify-center rounded-full bg-warn-soft text-warn">
              <ChevronRight className={cn('size-3.5', sheet ? '-rotate-90' : 'rotate-90')} />
            </span>
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ---------------------------------------------------------------------------
// Asking: one question per step
// ---------------------------------------------------------------------------

/** The last "open the card" request that already moved focus (survives remounts). */
let consumedTick = 0

function Steps({ question, onMinimize, sheet }: { question: QuestionSet; onMinimize: () => void; sheet: boolean }) {
  const step = useDock((s) => Math.min(s.step, question.items.length - 1))
  const values = useDock((s) => s.values)
  const focusTick = useDock((s) => s.focusTick)
  const { setStep, setValue } = useDock.getState()
  const { busy } = useAgent()
  const [error, setError] = useState<string | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const advance = useRef<ReturnType<typeof setTimeout>>(undefined)
  const reduce = useReducedMotion()
  const titleId = useId()

  const items = question.items
  const item = items[step]
  const last = step === items.length - 1
  const answered = (i: QuestionItem) => (i.kind === 'choice' ? !!values[i.fieldId] : emailOk(values[i.fieldId] ?? ''))

  useEffect(() => () => clearTimeout(advance.current), [])
  useEffect(() => setError(null), [step])

  // Take focus when the user asked for the card, or keep it inside while stepping
  // (after the step transition has swapped the content in).
  useEffect(() => {
    const root = bodyRef.current?.closest('[data-dock-card]')
    const asked = focusTick > consumedTick
    consumedTick = focusTick
    if (!root || (!asked && !root.contains(document.activeElement))) return
    const t = setTimeout(() => root.querySelector<HTMLElement>('[data-step-focus]')?.focus({ preventScroll: true }), reduce ? 0 : 200)
    return () => clearTimeout(t)
  }, [step, focusTick, reduce])

  // Bring the row being asked about into view next to the card as the user steps (not on first show).
  const shownField = useRef(item.fieldId)
  useEffect(() => {
    if (sheet || shownField.current === item.fieldId) return
    shownField.current = item.fieldId
    scrollToRow(item.fieldId, !reduce)
  }, [item.fieldId, sheet, reduce])

  /** Pick an option; a click or number key moves on to the next question after a beat. */
  const pick = (value: string, moveOn = true) => {
    setValue(item.fieldId, value)
    setError(null)
    clearTimeout(advance.current)
    if (moveOn && !last) {
      const from = step
      advance.current = setTimeout(() => {
        if (useDock.getState().step === from) setStep(from + 1)
      }, 420)
    }
  }

  const next = () => {
    if (item.kind === 'choice' && !values[item.fieldId]) return setError('Pick one to continue.')
    setStep(step + 1)
  }

  const send = () => {
    const missing = items.findIndex((i) => i.kind === 'choice' && !values[i.fieldId])
    if (missing >= 0) {
      setStep(missing)
      setTimeout(() => setError('Pick one to continue.'))
      return
    }
    const bad = items.find((i) => i.inputType === 'email' && (values[i.fieldId] ?? '').trim() && !emailOk(values[i.fieldId] ?? ''))
    if (bad) return setError('Enter an address like name@acmeholdings.com, or leave it blank.')
    useDock.getState().beginApplying({ question, values, startedAt: Date.now() })
    submitAnswers(question, values)
  }

  const skip = () => {
    skipQuestion(question)
    toast('Skipped for now', {
      description: 'The fields stay flagged. Answer them any time from the list.',
      action: { label: 'Undo', onClick: () => useDock.getState().openCard(question) }
    })
  }

  // Number keys pick an option, Esc minimizes. Quiet while typing or when a dialog is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.defaultPrevented || isTyping(e) || modalOpen()) return
      if (e.key === 'Escape') {
        e.preventDefault()
        onMinimize()
        return
      }
      const n = Number(e.key)
      if (item.kind === 'choice' && item.options && Number.isInteger(n) && n >= 1 && n <= item.options.length) {
        e.preventDefault()
        pick(item.options[n - 1].value)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <>
      <header className={cn('flex shrink-0 items-center gap-3 border-b border-rule px-4', sheet ? 'pt-2 pb-2.5' : 'py-2.5')}>
        {sheet && (
          <button type="button" onClick={onMinimize} className="absolute top-1.5 left-1/2 h-1.5 w-10 -translate-x-1/2 rounded-full bg-rule" aria-label="Minimize questions" />
        )}
        <div className={cn('flex min-w-0 flex-1 items-center gap-2', sheet && 'pt-2')}>
          <span className="size-2 shrink-0 rounded-full bg-warn" aria-hidden />
          <h2 className="truncate text-[13px] font-semibold">{question.title}</h2>
        </div>
        <div className={cn('flex shrink-0 items-center gap-2.5', sheet && 'pt-2')}>
          <span className="num text-[12px] text-ink-3" aria-live="polite">
            {step + 1} of {items.length}
          </span>
          <div className="flex items-center gap-1">
            {items.map((it, i) => (
              <button
                key={it.fieldId}
                type="button"
                onClick={() => setStep(i)}
                aria-label={`Question ${i + 1}: ${fieldDefs[it.fieldId]?.label ?? it.label}${answered(it) ? ', answered' : ''}`}
                aria-current={i === step ? 'step' : undefined}
                className="flex h-5 items-center px-0.5"
              >
                <span
                  className={cn(
                    'block h-1.5 rounded-full transition-all duration-200',
                    i === step ? 'w-4 bg-cobalt' : answered(it) ? 'w-1.5 bg-cobalt/50' : 'w-1.5 bg-ink-3/40'
                  )}
                />
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="size-7 text-ink-3" onClick={onMinimize} aria-label="Minimize questions (Esc)" title="Minimize (Esc)">
            <Minus className="size-4" />
          </Button>
        </div>
      </header>

      <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={item.fieldId}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -12 }}
            transition={{ duration: reduce ? 0 : 0.16 }}
            className="flex flex-col gap-3 px-4 pt-3.5 pb-4"
          >
            <FieldContext fieldId={item.fieldId} />
            <div>
              <h3 id={titleId} className="text-[16px] leading-snug font-semibold tracking-[-0.005em] text-ink">
                {item.label}
              </h3>
              {item.help && <p className="mt-1 text-[13px] leading-relaxed text-ink-2">{item.help}</p>}
            </div>
            {item.kind === 'choice' ? (
              <ChoiceTiles item={item} value={values[item.fieldId]} onPick={pick} labelledBy={titleId} disabled={busy} />
            ) : (
              <EmailStep
                item={item}
                value={values[item.fieldId] ?? ''}
                onChange={(v) => {
                  setValue(item.fieldId, v)
                  setError(null)
                }}
                onEnter={() => (last ? send() : next())}
                onEscape={onMinimize}
                invalid={!!error && item.inputType === 'email'}
                labelledBy={titleId}
                disabled={busy}
              />
            )}
            {error && (
              <p className="text-[12px] text-bad" role="alert">
                {error}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <footer className="flex shrink-0 items-center gap-2 border-t border-rule bg-panel-2/50 px-3 py-2.5">
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2 text-[12px]" disabled={step === 0} onClick={() => setStep(step - 1)}>
          <ChevronLeft className="size-3.5" /> Back
        </Button>
        <div className="flex-1" />
        {last ? (
          <>
            <Button variant="ghost" size="sm" className="h-8 text-[12px] text-ink-2" onClick={skip} disabled={busy}>
              Skip for now
            </Button>
            <Button size="sm" className="h-8 text-[12px]" onClick={send} disabled={busy}>
              Send answers
            </Button>
          </>
        ) : (
          <Button size="sm" className="h-8 gap-1 pr-2 text-[12px]" onClick={next}>
            Next <ChevronRight className="size-3.5" />
          </Button>
        )}
      </footer>
    </>
  )
}

function FieldContext({ fieldId }: { fieldId: string }) {
  const field = useApp((s) => s.fields[fieldId])
  const label = fieldDefs[fieldId]?.label ?? fieldId
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => showRow(fieldId)}
        className="group/ctx flex min-w-0 items-center gap-1.5 rounded-sm text-[12px] font-medium text-ink-2 hover:text-ink"
        title="Show this field in the list"
      >
        <LocateFixed className="size-3.5 shrink-0 text-ink-3 group-hover/ctx:text-cobalt-ink" />
        <span className="truncate">{label}</span>
      </button>
      {field && <StatusChip status={field.status} className="h-5 gap-0.5 pr-2 pl-1.5 text-[11px] [&_svg]:size-3" />}
    </div>
  )
}

function ChoiceTiles({
  item,
  value,
  onPick,
  labelledBy,
  disabled
}: {
  item: QuestionItem
  value?: string
  onPick: (v: string, moveOn?: boolean) => void
  labelledBy: string
  disabled: boolean
}) {
  const options = item.options ?? []
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const selectedIdx = options.findIndex((o) => o.value === value)
  const focusIdx = selectedIdx >= 0 ? selectedIdx : 0

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex flex-col gap-2">
      {options.map((o, i) => {
        const checked = o.value === value
        const src = o.sources[0]
        return (
          <div
            key={o.value}
            className={cn(
              'relative rounded-lg border transition-colors',
              checked ? 'border-cobalt/60 bg-cobalt-soft/60' : 'border-rule bg-panel hover:border-cobalt/35 hover:bg-panel-2/60'
            )}
          >
            <button
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={i === focusIdx ? 0 : -1}
              data-step-focus={i === focusIdx ? '' : undefined}
              disabled={disabled}
              onClick={() => onPick(o.value)}
              onKeyDown={(e) => {
                if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
                e.preventDefault()
                const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + options.length) % options.length
                refs.current[n]?.focus()
                onPick(options[n].value, false)
              }}
              aria-label={`${o.display}${src ? `, from ${src.docId} ${src.page ? `page ${src.page}` : (src.locator ?? '')}` : ''}`}
              className="absolute inset-0 rounded-lg"
            />
            <div className="pointer-events-none relative flex items-start gap-3 px-3 py-2.5">
              <span
                className={cn(
                  'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border font-mono text-[11px] font-medium transition-colors',
                  checked ? 'border-cobalt bg-cobalt text-on-cobalt' : 'border-rule bg-panel-2 text-ink-3'
                )}
                aria-hidden
              >
                {checked ? <Check className="size-3" strokeWidth={3} /> : i + 1}
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[14px] font-semibold text-ink">{o.display}</span>
                {src && <span className="font-serif text-[13px] leading-snug text-ink-2 italic">“{src.quote}”</span>}
                <div className="pointer-events-auto flex flex-wrap gap-1">
                  {o.sources.map((s, k) => (
                    <CitationChip key={k} source={s} className="h-5 text-[11px]" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EmailStep({
  item,
  value,
  onChange,
  onEnter,
  onEscape,
  invalid,
  labelledBy,
  disabled
}: {
  item: QuestionItem
  value: string
  onChange: (v: string) => void
  onEnter: () => void
  onEscape: () => void
  invalid: boolean
  labelledBy: string
  disabled: boolean
}) {
  const mention = useApp((s) => s.fields[item.fieldId]?.sources[0])
  const inputId = useId()
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <Input
          id={inputId}
          data-step-focus=""
          type={item.inputType ?? 'text'}
          inputMode="email"
          autoComplete="email"
          placeholder={item.placeholder}
          value={value}
          disabled={disabled}
          aria-labelledby={labelledBy}
          aria-invalid={invalid}
          aria-describedby={`${inputId}-hint`}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onEnter()
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              onEscape()
            }
          }}
          className="h-9 text-[14px]"
        />
        <p id={`${inputId}-hint`} className="text-[12px] text-ink-3">
          Leave it blank to add it later. The letter shows a placeholder until then.
        </p>
      </div>
      {mention && (
        <div className="rounded-lg border border-rule bg-panel-2/60 px-3 py-2.5">
          <div className="eyebrow mb-1.5">Closest mention</div>
          <p className="font-serif text-[13px] leading-snug text-ink-2 italic">“{mention.quote}”</p>
          <div className="mt-2 flex">
            <CitationChip source={mention} className="h-5 text-[11px]" />
          </div>
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// After Send answers: the agent applies them, live, then the card leaves
// ---------------------------------------------------------------------------

function ApplyingView({
  question,
  values,
  startedAt,
  sheet
}: {
  question: QuestionSet
  values: Record<string, string>
  startedAt: number
  sheet: boolean
}) {
  const fields = useApp((s) => s.fields)
  const flash = useApp((s) => s.flash)
  const { busy } = useAgent()
  const { done, total } = useSummary()
  const sawBusy = useRef(false)
  const asked = question.items.map((i) => i.fieldId)

  // Dismiss a moment after the agent finishes (or if it never starts).
  useEffect(() => {
    if (busy) {
      sawBusy.current = true
      return
    }
    const t = setTimeout(() => useDock.getState().endApplying(), sawBusy.current ? 2400 : 6000)
    return () => clearTimeout(t)
  }, [busy])

  const answers = question.items.map((item) => {
    const raw = values[item.fieldId]?.trim() ?? ''
    const shown = item.options?.find((o) => o.value === raw)?.display ?? raw
    const f = fields[item.fieldId]
    const state: RowState = !raw ? 'blank' : f?.status === 'user_answered' || f?.status === 'approved' ? 'done' : 'pending'
    return { id: item.fieldId, label: fieldDefs[item.fieldId]?.label ?? item.label, value: shown || 'Left blank', state }
  })
  // Whatever else the agent changes while applying (e.g. the scope summary it was waiting to write).
  const followOn = Object.keys(fieldDefs)
    .filter((id) => !asked.includes(id) && (fields[id]?.status === 'drafting' || (flash[id] ?? 0) >= startedAt))
    .map((id) => {
      const f = fields[id]
      const state: RowState = f?.status === 'drafting' ? 'writing' : 'done'
      const v = displayValue(f)
      const value = state === 'writing' ? 'Writing…' : fieldDefs[id].kind === 'narrative' ? `${(v ?? '').split('\n\n').length} paragraphs` : (v ?? '')
      return { id, label: fieldDefs[id].label, value, state }
    })
  const finished = !busy && sawBusy.current

  return (
    <div className="flex flex-col">
      <header className={cn('flex items-center gap-2.5 border-b border-rule px-4 py-3', sheet && 'pt-4')}>
        {finished ? (
          <span className="flex size-5 items-center justify-center rounded-full bg-ok text-on-cobalt">
            <Check className="size-3" strokeWidth={3} />
          </span>
        ) : (
          <Loader2 className="size-4 animate-spin text-cobalt" />
        )}
        <div className="min-w-0 flex-1" role="status">
          {finished ? (
            <h2 className="text-[13px] font-semibold">
              Done. {done} of {total} filled
            </h2>
          ) : (
            <Shimmer className="text-[13px] font-semibold" duration={1.6}>
              Applying your answers
            </Shimmer>
          )}
        </div>
        <Button variant="ghost" size="icon" className="size-7 text-ink-3" onClick={() => useDock.getState().endApplying()} aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>
      <ul className="flex flex-col gap-0.5 px-2 py-2">
        <AnimatePresence initial={false}>
          {[...answers, ...followOn].map((r) => (
            <motion.li
              key={r.id}
              layout="position"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5"
            >
              <RowIcon state={r.state} />
              <span className="w-[42%] shrink-0 truncate text-[12px] text-ink-2">{r.label}</span>
              <span className={cn('min-w-0 flex-1 truncate text-right text-[13px]', r.state === 'blank' ? 'text-ink-3 italic' : 'text-ink')}>{r.value}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  )
}

type RowState = 'pending' | 'writing' | 'done' | 'blank'

function RowIcon({ state }: { state: RowState }) {
  if (state === 'done') return <Check className="size-3.5 shrink-0 text-ok" strokeWidth={2.5} aria-label="Done" />
  if (state === 'writing') return <PenLine className="size-3.5 shrink-0 animate-pulse text-cobalt-ink" aria-label="Writing" />
  if (state === 'blank') return <Minus className="size-3.5 shrink-0 text-ink-3" aria-label="Left blank" />
  return <Loader2 className="size-3.5 shrink-0 animate-spin text-ink-3" aria-label="Waiting" />
}
