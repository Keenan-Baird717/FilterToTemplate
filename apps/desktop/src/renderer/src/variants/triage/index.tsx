import './theme.css'
import { MotionConfig } from 'motion/react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { isMacLike } from '@/components/PrototypeBar'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useAgent, useEngineName, useOpenQuestion } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { approveAndAdvance, chooseCandidate, focusAsk, move, sendDraft, startEdit } from './actions'
import { AgentBar } from './AgentBar'
import { AnswerBar, isRefilling } from './AnswerBar'
import { Key } from './bits'
import { Detail } from './Detail'
import { Inbox } from './Inbox'
import { LetterPane } from './LetterPane'
import { canEdit, itemById, statusOf } from './model'
import { isTypingTarget, useMediaQuery, useTriage } from './state'
import { TopBar } from './TopBar'

/**
 * Triage: review every value against its evidence, from the keyboard.
 * Inbox on the left, the selected value and its proof in the middle, the
 * real letter on demand at the right.
 */
export default function Triage() {
  const showDetail = useTriage((s) => s.showDetail)
  const letterOpen = useTriage((s) => s.letterOpen)
  const setLetterOpen = useTriage((s) => s.setLetterOpen)
  const selected = useTriage((s) => s.selected)
  const wide = useMediaQuery('(min-width: 1280px)')
  const question = useOpenQuestion()
  const detailRef = useRef<HTMLDivElement>(null)

  useParsingTicker()
  useKeyboard()

  // A new question set starts a fresh draft.
  useEffect(() => {
    const t = useTriage.getState()
    if (t.draft.qid !== (question?.id ?? null)) t.resetDraft(question?.id ?? null)
  }, [question?.id])

  // Each item opens at the top of its evidence.
  useEffect(() => {
    detailRef.current?.scrollTo({ top: 0 })
  }, [selected])

  return (
    <MotionConfig reducedMotion="user">
      <div className="flex h-full min-h-0 flex-col bg-ground font-sans text-ink">
        <TopBar />
        <div
          className={cn(
            'grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] md:grid-cols-[288px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]',
            letterOpen && wide && 'xl:grid-cols-[300px_minmax(0,1fr)_minmax(440px,0.8fr)]'
          )}
        >
          <div className={cn('min-h-0 border-rule md:block md:border-r', showDetail ? 'hidden' : 'block')}>
            <Inbox />
          </div>
          <main className={cn('min-h-0 flex-col bg-panel md:flex', showDetail ? 'flex' : 'hidden')} aria-label="Selected item">
            <div ref={detailRef} className="triage-scroll min-h-0 flex-1 overflow-y-auto">
              <div className="mx-auto max-w-[960px] px-4 pt-4 pb-12 sm:px-8 sm:pt-6">
                <Detail />
              </div>
            </div>
            <AnswerBar />
            <AgentBar />
          </main>
          {letterOpen && wide && (
            <aside className="min-h-0 border-l border-rule">
              <LetterPane />
            </aside>
          )}
        </div>
        <HintBar />
      </div>
      {!wide && (
        <Sheet open={letterOpen} onOpenChange={setLetterOpen}>
          <SheetContent side="right" showCloseButton={false} className="w-full gap-0 border-rule bg-ground p-0 sm:max-w-[640px]">
            <SheetTitle className="sr-only">Letter preview</SheetTitle>
            <SheetDescription className="sr-only">The filled engagement letter with the selected value marked.</SheetDescription>
            <LetterPane />
          </SheetContent>
        </Sheet>
      )}
    </MotionConfig>
  )
}

function HintBar() {
  const engine = useEngineName()
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const selected = useTriage((s) => s.selected)
  const letterOpen = useTriage((s) => s.letterOpen)
  const openQuestion = useOpenQuestion()
  const { busy, messages } = useAgent()
  const question = busy && isRefilling(messages) ? null : openQuestion
  const status = statusOf(selected, fields, rates)
  const mod = isMacLike() ? '⌘' : 'Ctrl'

  const hints: { keys: string[]; label: string; on?: boolean }[] = [
    { keys: ['J', 'K'], label: 'Next / previous' },
    { keys: ['A'], label: 'Approve' },
    { keys: ['E'], label: 'Edit' },
    { keys: ['/'], label: 'Ask the agent' },
    { keys: ['D'], label: letterOpen ? 'Hide letter' : 'Show letter' }
  ]
  if (status === 'conflict') hints.push({ keys: ['1', '2'], label: 'Pick a date', on: true })
  if (question) hints.push({ keys: [mod, '↵'], label: 'Send answers', on: true })

  return (
    <footer className="hidden h-8 shrink-0 items-center gap-4 border-t border-rule bg-panel px-4 text-[11px] text-ink-3 md:flex" aria-label="Keyboard shortcuts">
      {hints.map((h) => (
        <span key={h.label} className={cn('flex items-center gap-1.5 whitespace-nowrap', h.on && 'text-ink-2')}>
          <span className="flex items-center gap-0.5">
            {h.keys.map((k) => (
              <Key key={k} className={cn(h.on && 'border-cobalt/40 text-cobalt')}>
                {k}
              </Key>
            ))}
          </span>
          {h.label}
        </span>
      ))}
      <span className="ml-auto hidden truncate lg:inline">{engine}</span>
    </footer>
  )
}

function useKeyboard() {
  const question = useOpenQuestion()
  const { busy, messages } = useAgent()
  const questionRef = useRef(question)
  // A fresh fill replaces the open question, so it can't be answered meanwhile.
  questionRef.current = busy && isRefilling(messages) ? null : question
  const agentBusy = useRef(busy)
  agentBusy.current = busy

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const q = questionRef.current
      // Send answers from anywhere, including the email field.
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !e.altKey && q) {
        if (e.target instanceof HTMLTextAreaElement) return
        e.preventDefault()
        if (!agentBusy.current) sendDraft(q)
        return
      }
      if (e.defaultPrevented || e.altKey || e.metaKey || e.ctrlKey) return
      if (isTypingTarget(e.target)) return
      if (useApp.getState().commandOpen || useApp.getState().source || useTriage.getState().transcriptOpen) return
      if (document.querySelector('[role="dialog"][data-state="open"], [role="menu"][data-state="open"]')) return
      const target = e.target as HTMLElement | null
      const inWidget = !!target?.closest('[role="radiogroup"], [role="tablist"], [role="menu"]')

      const t = useTriage.getState()
      const { fields, rates } = useApp.getState()
      const id = t.selected
      const item = itemById[id]
      const status = statusOf(id, fields, rates)
      const key = e.key

      if (key === 'j' || (key === 'ArrowDown' && !inWidget)) {
        e.preventDefault()
        move(1)
      } else if (key === 'k' || (key === 'ArrowUp' && !inWidget)) {
        e.preventDefault()
        move(-1)
      } else if (key === 'a' || key === 'A') {
        e.preventDefault()
        approveAndAdvance(id)
      } else if (key === 'e' || key === 'E') {
        e.preventDefault()
        if (item && canEdit(item, status)) {
          t.setShowDetail(true)
          startEdit(id)
        } else if (status === 'missing') {
          t.setShowDetail(true)
          requestAnimationFrame(() => document.getElementById(`triage-answer-${id}`)?.focus())
        } else if (status === 'conflict') toast('Pick one of the two dates with 1 or 2.')
        else toast('This value can’t be edited here. Ask the agent to change it.')
      } else if (key === '/') {
        e.preventDefault()
        t.setShowDetail(true)
        focusAsk()
      } else if (key === 'd' || key === 'D') {
        e.preventDefault()
        t.setLetterOpen(!t.letterOpen)
      } else if ((key === '1' || key === '2') && status === 'conflict') {
        const c = fields[id]?.candidates?.[Number(key) - 1]
        if (c) {
          e.preventDefault()
          chooseCandidate(id, c, questionRef.current)
        }
      } else if (key === 'Escape' && t.showDetail) {
        t.setShowDetail(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Files added in the preview finish "parsing" on a timer, as in the workbench. */
function useParsingTicker() {
  const docs = useApp((s) => s.docs)
  const advanceParsing = useApp((s) => s.advanceParsing)
  const parsing = docs.some((d) => d.status === 'parsing' && d.id !== 'D8')
  useEffect(() => {
    if (!parsing) return
    const t = setInterval(() => {
      const done = advanceParsing()
      if (done.length) toast.success(done.length === 1 ? `Indexed ${done[0]}` : `Indexed ${done.length} files`)
    }, 450)
    return () => clearInterval(t)
  }, [parsing, advanceParsing])
}
