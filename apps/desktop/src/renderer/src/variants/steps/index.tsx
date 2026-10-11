import './theme.css'
import { MessagesSquare } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { project } from '../../../../agent-core/demo-data'
import type { QuestionSet } from '../../../../shared/protocol'
import { Button } from '@/components/ui/button'
import { runFill, skipQuestion, submitAnswers, useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { AgentSheet } from './AgentSheet'
import { useCurrentQuestion, type StepId } from './parts'
import { StepDocuments, useParsingTicker } from './StepDocuments'
import { Stepper, type StepInfo } from './Stepper'
import { StepFound, useFillProgress } from './StepFound'
import { StepQuestions } from './StepQuestions'
import { StepReview } from './StepReview'

/** Steps: one decision at a time, for people who fill a letter now and then. */
export default function Steps() {
  const question = useCurrentQuestion()
  const { counts, total, done } = useSummary()
  const docs = useApp((s) => s.docs)
  const progress = useFillProgress()
  const reduce = useReducedMotion()
  useParsingTicker()

  const [step, setStep] = useState<StepId>(() => (question ? 3 : done === total ? 4 : 2))
  const [dir, setDir] = useState(1)
  const [qIndex, setQIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [sentId, setSentId] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const stageRef = useRef<HTMLDivElement>(null)
  const moved = useRef(false)

  const go = (to: StepId) => {
    if (to === step) return
    moved.current = true
    setDir(to > step ? 1 : -1)
    setStep(to)
  }

  // A new question set (after a fresh run) starts a clean draft.
  const qid = question?.id
  useEffect(() => {
    if (!qid) return
    setQIndex(0)
    setAnswers({})
    setSentId(null)
  }, [qid])

  // A fresh fill, from anywhere (button, chat or the command menu), is watched on step 2.
  const running = progress.running
  const stepRef = useRef(step)
  stepRef.current = step
  useEffect(() => {
    if (!running || stepRef.current === 2) return
    moved.current = true
    setDir(stepRef.current > 2 ? -1 : 1)
    setStep(2)
    setSentId(null)
  }, [running])

  const startFill = () => {
    runFill()
    go(2)
  }

  const send = (q: QuestionSet, values: Record<string, string>) => {
    submitAnswers(q, values)
    setSentId(q.id)
  }

  const skip = (q: QuestionSet) => {
    skipQuestion(q)
    toast('Skipped for now', { description: 'Those items stay empty. You can fill them in during review.' })
    go(4)
  }

  const resolve = (fieldId: string) => {
    const idx = question?.items.findIndex((it) => it.fieldId === fieldId) ?? -1
    if (idx >= 0) {
      setQIndex(idx)
      go(3)
    } else {
      setSelected(fieldId)
      go(4)
    }
  }

  const ready = docs.filter((d) => d.status === 'indexed').length
  const reading = docs.length - ready
  const writing = progress.turn.busy && progress.turn.mode === 'answer'
  const open = counts.conflict + counts.missing
  const steps: Record<StepId, StepInfo> = {
    1: { id: 1, state: ready ? 'done' : 'todo', hint: `${docs.length} files${reading ? ` · ${reading} reading` : ''}` },
    2: { id: 2, state: running ? 'todo' : done ? 'done' : 'todo', hint: running ? 'Reading now…' : `${done} of ${total} filled` },
    3: {
      id: 3,
      state: question && !sentId ? 'attention' : writing || open ? 'todo' : 'done',
      hint: question && !sentId ? `${question.items.length} to answer` : writing ? 'Writing…' : open ? `${open} left open` : 'All answered'
    },
    4: { id: 4, state: counts.approved === total ? 'done' : 'todo', hint: done === total ? (counts.approved === total ? 'Approved' : 'Ready to review') : `${total - done} left` }
  }

  // Keep each step starting at the top, and move focus to its heading after a change.
  useEffect(() => {
    if (!moved.current) return
    const t = setTimeout(() => stageRef.current?.querySelector<HTMLElement>('h1, h2')?.focus({ preventScroll: true }), reduce ? 0 : 260)
    return () => clearTimeout(t)
  }, [step, reduce])

  const offset = reduce ? 0 : 28

  return (
    <div className="steps-root flex h-full min-h-0 flex-col bg-ground text-ink">
      <header className="flex shrink-0 items-center gap-3 px-4 py-3 sm:px-6 lg:gap-6">
        <div className="hidden w-[180px] min-w-0 shrink-0 xl:block">
          <p className="truncate text-[12.5px] leading-tight text-ink-3">{project.client}</p>
          <p className="steps-display truncate text-[17px] leading-tight text-ink">{project.title}</p>
        </div>
        <Stepper steps={steps} current={step} onSelect={go} />
        <Button
          variant="ghost"
          className="relative h-10 shrink-0 gap-2 rounded-full px-3 text-[14.5px] text-ink-2 hover:bg-panel hover:text-ink sm:px-4"
          onClick={() => setChatOpen(true)}
          aria-label="Ask the agent"
        >
          <MessagesSquare className="size-[18px]" />
          <span className="hidden sm:inline">Ask the agent</span>
          {progress.turn.busy && <span className="absolute top-2 right-2 size-2 animate-pulse rounded-full bg-cobalt sm:static sm:ml-0.5" aria-hidden />}
        </Button>
      </header>

      <main className="min-h-0 flex-1 sm:px-3">
        <div ref={stageRef} className="steps-stage relative h-full overflow-hidden border-t border-rule bg-panel sm:rounded-t-[20px] sm:border-x">
          <AnimatePresence mode="wait" custom={dir} initial={false}>
            <motion.div
              key={step}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * offset }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: d * -offset })
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={cn('h-full', step !== 4 && 'overflow-y-auto overscroll-contain')}
            >
              {step === 1 && <StepDocuments onNext={() => go(2)} onRunFill={startFill} />}
              {step === 2 && (
                <StepFound
                  progress={progress}
                  question={sentId ? null : question}
                  onBack={() => go(1)}
                  onNext={() => go(question && !sentId ? 3 : 4)}
                  onResolve={resolve}
                  onRunFill={startFill}
                />
              )}
              {step === 3 && (
                <StepQuestions
                  question={question}
                  draft={{ index: qIndex, setIndex: setQIndex, answers, setAnswers }}
                  sentId={sentId}
                  onSend={send}
                  onSkip={skip}
                  onDone={() => {
                    setSentId(null)
                    go(4)
                  }}
                />
              )}
              {step === 4 && <StepReview selected={selected} onSelect={setSelected} onAsk={() => setChatOpen(true)} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <AgentSheet open={chatOpen} onOpenChange={setChatOpen} />
    </div>
  )
}
