import { ArrowRight, CircleHelp, FileSearch, FileText, ListChecks, MessagesSquare, PenLine, type LucideIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { FieldStatus } from '../../../../shared/protocol'
import { ChatPane } from '@/components/ChatPane'
import { FieldRowContext, FillPane, type FieldRowOptions } from '@/components/FillPane'
import { TitleBar } from '@/components/TitleBar'
import { useOpenQuestion, useParsingTicker } from '@/lib/agent'
import { useApp, type Pane } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ContextColumn } from './ContextColumn'
import { answerField, isWide, liveItems, phaseLabel, useColumn, useNewestQuestion, usePhaseSync, type Phase } from './state'

const phaseIcon: Record<Phase, LucideIcon> = { reading: FileSearch, needs: CircleHelp, writing: PenLine, review: ListChecks }

/** Workbench's three columns; the left one follows the job: reading, then questions, then review. */
export default function Phases() {
  usePhaseSync()
  useParsingTicker()

  const pane = useApp((s) => s.pane)
  const setPane = useApp((s) => s.setPane)
  const fields = useApp((s) => s.fields)
  const reveal = useApp((s) => s.reveal)
  const phase = useColumn((s) => s.phase) ?? 'needs'
  const seen = useColumn((s) => s.seen)
  const open = useOpenQuestion()
  const pending = liveItems(open, fields).length
  const wide = useWide()

  // The phone tab badge clears once the user has looked at the column.
  useEffect(() => {
    if (wide || pane === 'sources') useColumn.getState().markSeen(phase)
  }, [wide, pane, phase])

  // Command menu: bring the field into view; question fields open Needs you.
  const openRef = useRef(open)
  openRef.current = open
  useEffect(() => {
    if (!reveal) return
    const isQuestion = liveItems(openRef.current, useApp.getState().fields).some((i) => i.fieldId === reveal.fieldId)
    if (isQuestion) {
      useColumn.getState().openNeeds(reveal.fieldId)
      if (isWide()) useApp.getState().focusField(reveal.fieldId)
      else useApp.getState().setPane('sources')
    } else {
      useApp.getState().focusField(reveal.fieldId)
    }
  }, [reveal])

  const showNeeds = () => {
    useColumn.getState().openNeeds()
    if (!isWide()) setPane('sources')
  }

  const rowOptions = useMemo<FieldRowOptions>(
    () => ({
      conflictNote: 'Two documents disagree.',
      renderExtra: (fieldId, field) =>
        field && (field.status === 'conflict' || field.status === 'missing') ? <AnswerLink fieldId={fieldId} status={field.status} /> : null
    }),
    []
  )

  const PhaseIcon = phaseIcon[phase]
  const badge = phase === 'needs' && pending ? String(pending) : phase !== seen && pane !== 'sources' ? 'dot' : null
  const tabs: { id: Pane; label: string; icon: LucideIcon; badge?: string | null }[] = [
    { id: 'sources', label: phaseLabel[phase], icon: PhaseIcon, badge },
    { id: 'template', label: 'Template', icon: FileText },
    { id: 'chat', label: 'Agent', icon: MessagesSquare }
  ]

  return (
    <div className="flex h-full flex-col bg-ground text-ink" data-phase={phase}>
      <TitleBar />
      {/* Wide: three columns side by side. Narrow: one at a time with a tab bar. */}
      {/* Viewports are positioned so sr-only text inside scroll areas can't overflow the page; clip keeps reveals from scrolling the frame. */}
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-clip lg:grid-cols-[280px_minmax(0,1fr)_320px] xl:grid-cols-[328px_minmax(0,1fr)_380px] [&_[data-slot=scroll-area-viewport]]:relative">
        <div className={cn('min-h-0 border-rule lg:block lg:border-r', pane === 'sources' ? 'block' : 'hidden')}>
          <ContextColumn />
        </div>
        <div className={cn('min-h-0 lg:block', pane === 'template' ? 'block' : 'hidden')}>
          <FieldRowContext.Provider value={rowOptions}>
            <FillPane />
          </FieldRowContext.Provider>
        </div>
        <div className={cn('min-h-0 border-rule lg:block lg:border-l', pane === 'chat' ? 'block' : 'hidden')}>
          <ChatPane questions="pointer" onQuestionPointer={showNeeds} />
        </div>
      </main>
      <nav className="grid shrink-0 grid-cols-3 border-t border-rule bg-panel lg:hidden" aria-label="Panes">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPane(t.id)}
            aria-current={pane === t.id ? 'page' : undefined}
            aria-label={t.badge ? `${t.label} (${t.badge === 'dot' ? 'updated' : `${t.badge} waiting`})` : undefined}
            className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', pane === t.id ? 'text-cobalt' : 'text-ink-3')}
          >
            <span className="relative">
              <t.icon className="size-4.5" />
              {t.badge === 'dot' ? (
                <span className="absolute -top-0.5 -right-1 size-2 rounded-full bg-cobalt ring-2 ring-panel" aria-hidden />
              ) : t.badge ? (
                <span
                  className="num absolute -top-1.5 -right-2.5 grid h-4 min-w-4 place-items-center rounded-full bg-warn px-1 font-mono text-[10px] leading-none font-semibold text-on-cobalt ring-2 ring-panel"
                  aria-hidden
                >
                  {t.badge}
                </span>
              ) : null}
            </span>
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

/** Under a flagged field row: a link to where it gets answered. */
function AnswerLink({ fieldId, status }: { fieldId: string; status: FieldStatus }) {
  const newest = useNewestQuestion()
  const fields = useApp((s) => s.fields)
  if (!liveItems(newest, fields).some((i) => i.fieldId === fieldId)) return null
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        answerField(fieldId)
      }}
      className="flex w-fit items-center gap-1 rounded-sm text-[12px] font-medium text-cobalt-ink hover:underline"
    >
      {status === 'conflict' ? 'Choose one in Needs you' : 'Answer in Needs you'}
      <ArrowRight className="size-3.5" />
    </button>
  )
}

function useWide() {
  const [wide, setWide] = useState(isWide)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const on = () => setWide(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return wide
}
