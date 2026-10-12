import { Check, ChevronRight, ChevronsDownUp, ChevronsUpDown, ChevronUp, Download, FileText, Highlighter, ListChecks, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { fieldDefs, sections, template, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState, FieldStatus, RatesState } from '../../../../shared/protocol'
import { DocxView } from '@/components/DocxView'
import { FieldRow, ProgressStrip, RatesRow } from '@/components/FillPane'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { runFill, useAgent } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { DONE, displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useFocus } from './state'

/** The reading column: ~860px of content, centered between the rail and the right edge. */
export const COLUMN = 'mx-auto w-full max-w-[908px] px-4 sm:px-6'

const ease = [0.22, 1, 0.36, 1] as const
/** How long a finished section stays open after the agent changes it. */
const HOLD_MS = 4200

const sectionOf: Record<string, string> = Object.fromEntries([
  ...sections.flatMap((s) => s.fields.map((id) => [id, s.id] as const)),
  ['hourlyRates', sections.find((s) => s.hasRates)?.id ?? 'fees']
])

function statusesOf(section: SectionDef, fields: Record<string, FieldState>, rates: RatesState): FieldStatus[] {
  return [...section.fields.map((id) => fields[id]?.status ?? 'empty'), ...(section.hasRates ? [rates.status] : [])]
}

const isFinished = (statuses: FieldStatus[]) => statuses.every((s) => DONE.includes(s))

/** Would this section be folded right now? (Read outside React, e.g. before revealing a field.) */
function wouldFold(sectionId: string) {
  const section = sections.find((s) => s.id === sectionId)
  if (!section) return false
  const { fields, rates } = useApp.getState()
  const f = useFocus.getState()
  return isFinished(statusesOf(section, fields, rates)) && !f.showAll && !f.opened[sectionId] && !((f.peek[sectionId] ?? 0) > Date.now()) && !f.held[sectionId]
}

/**
 * Bring a field into view: open its section if it is folded, switch to the
 * Fields tab, then scroll to the row and wash it.
 */
export function showField(fieldId: string) {
  const app = useApp.getState()
  const sectionId = sectionOf[fieldId]
  const opening = !!sectionId && wouldFold(sectionId)
  if (opening) useFocus.getState().openSection(sectionId)
  if (opening || app.view !== 'fields' || app.pane === 'sources') {
    app.setView('fields')
    app.setPane('template')
    window.setTimeout(() => useApp.getState().focusField(fieldId), 340)
  } else app.focusField(fieldId)
}

// ---------------------------------------------------------------------------
// Watching the agent: a value change opens its section for a few seconds.
// ---------------------------------------------------------------------------

/** What counts as a change: the value, or leaving/entering a finished state. Approvals don't count. */
function itemKey(f: FieldState | undefined) {
  if (!f) return 'none'
  return `${DONE.includes(f.status) ? 'done' : f.status}|${JSON.stringify(f.value)}|${f.candidates?.length ?? 0}`
}
const ratesKey = (r: RatesState) => `${DONE.includes(r.status) ? 'done' : r.status}|${r.rows.map((x) => `${x.key}:${x.rate}`).join(',')}`

function useFoldWatcher() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const prev = useRef<Record<string, string> | null>(null)

  useEffect(() => {
    const keys: Record<string, string> = { hourlyRates: ratesKey(rates) }
    for (const id of Object.keys(fieldDefs)) keys[id] = itemKey(fields[id])
    const before = prev.current
    prev.current = keys
    const focus = useFocus.getState()
    // A section that is no longer finished forgets "keep open" (and any hover hold), so it folds again once it is.
    for (const s of sections) if (!isFinished(statusesOf(s, fields, rates))) focus.forgetOpened(s.id)
    if (!before) return
    const until = Date.now() + HOLD_MS
    const changed = new Set(Object.keys(keys).filter((id) => keys[id] !== before[id]).map((id) => sectionOf[id]))
    changed.forEach((id) => id && focus.peekSection(id, until))
  }, [fields, rates])
}

/** Re-render when the next peek runs out. */
function usePeekClock(peek: Record<string, number>) {
  const [tick, force] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    const now = Date.now()
    const next = Math.min(...Object.values(peek).filter((t) => t > now))
    if (!Number.isFinite(next)) return
    const t = window.setTimeout(force, next - now + 30)
    return () => window.clearTimeout(t)
  }, [peek, tick])
  return Date.now()
}

// ---------------------------------------------------------------------------
// The pane
// ---------------------------------------------------------------------------

export function FocusPane({ belowProgress, stripStatus }: { belowProgress?: ReactNode; stripStatus?: ReactNode | null }) {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const { busy } = useAgent()
  useFoldWatcher()

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Template">
      <header className="border-b border-rule">
        <div className={cn(COLUMN, 'flex flex-wrap items-center gap-x-4 gap-y-3 pt-4 pb-3')}>
          <div className="flex min-w-48 flex-1 items-baseline gap-2.5">
            <h1 className="truncate text-[19px] leading-tight font-semibold tracking-[-0.01em]">{template.name}</h1>
            <span className="font-mono text-[12px] text-ink-3">v{template.version}</span>
          </div>
          {/* Phones: tabs and actions share one row, so the open tray keeps its room. */}
          <div className="flex w-full items-center gap-2 sm:w-auto sm:gap-4">
            <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
              <TabsList className="h-8">
                <TabsTrigger value="fields" className="h-6 gap-1.5 px-2.5 text-[13px]">
                  <ListChecks className="size-3.5" /> Fields
                </TabsTrigger>
                <TabsTrigger value="preview" className="h-6 gap-1.5 px-2.5 text-[13px]">
                  <FileText className="size-3.5" /> Preview
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-8 gap-1.5 max-sm:w-8 max-sm:px-0" onClick={runFill} disabled={busy} aria-label="Run again">
                    <RotateCcw className="size-3.5" />
                    <span className="max-sm:hidden">Run again</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Clear the fields and watch the agent fill them</TooltipContent>
              </Tooltip>
              <Button size="sm" className="h-8 gap-1.5" onClick={() => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))}>
                <Download className="size-3.5" /> Export .docx
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* The shared strip, re-banded so its content lines up with the reading column. */}
      <div className="border-b border-rule bg-panel-2/60">
        <div className="mx-auto w-full max-w-[908px] [&>div]:border-0 [&>div]:bg-transparent [&>div]:px-4 sm:[&>div]:px-6">
          <ProgressStrip status={stripStatus} />
        </div>
      </div>
      {belowProgress}

      <div className="min-h-0 flex-1">
        {view === 'fields' ? (
          <ScrollArea className="h-full">
            <FocusList />
          </ScrollArea>
        ) : (
          <Preview />
        )}
      </div>
    </section>
  )
}

/** PreviewPane, but a click on a value opens its section if it is folded. */
function Preview() {
  const highlight = useApp((s) => s.highlight)
  const setHighlight = useApp((s) => s.setHighlight)
  return (
    <div className="flex h-full min-h-0 flex-col bg-ground">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-panel px-4 py-2 text-[12px] text-ink-3 sm:px-6">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText className="size-3.5 shrink-0" />
          <span>Filled layout.docx · page breaks approximate</span>
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-ink-2" htmlFor="focus-highlight-fields">
          <Highlighter className="size-3.5" /> Highlight filled values
          <Switch id="focus-highlight-fields" checked={highlight} onCheckedChange={setHighlight} />
        </label>
      </div>
      <DocxView className="flex-1" highlight={highlight} onValueClick={(id) => showField(id)} />
    </div>
  )
}

function FocusList() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const showAll = useFocus((s) => s.showAll)
  const setShowAll = useFocus((s) => s.setShowAll)
  const opened = useFocus((s) => s.opened)
  const peek = useFocus((s) => s.peek)
  const held = useFocus((s) => s.held)
  const now = usePeekClock(peek)

  const states = sections.map((section) => {
    const statuses = statusesOf(section, fields, rates)
    const finished = isFinished(statuses)
    const peeking = finished && !showAll && !opened[section.id] && ((peek[section.id] ?? 0) > now || !!held[section.id])
    return { section, statuses, finished, peeking, folded: finished && !showAll && !opened[section.id] && !peeking }
  })
  const anyFinished = states.some((s) => s.finished)
  const allFinished = states.every((s) => s.finished)
  const allApproved = states.every((s) => s.statuses.every((x) => x === 'approved'))
  const foldedSections = states.filter((s) => s.folded).map((s) => s.section)

  return (
    <div className={cn(COLUMN, '@container flex flex-col pt-3 pb-28')}>
      <div className="flex min-h-8 items-center gap-3 pb-2">
        <AnimatePresence initial={false}>
          {allFinished && (
            <motion.p
              key="done"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease }}
              className="flex min-w-0 items-center gap-1.5 text-[13px] text-ink-2"
            >
              <Check className="size-3.5 shrink-0 text-ok" strokeWidth={2.5} aria-hidden />
              {allApproved
                ? 'Every section is approved. Export the letter when you’re ready.'
                : showAll
                  ? 'Every field is filled. Check each section, then export.'
                  : 'Every field is filled. Open a section to check it, then export.'}
            </motion.p>
          )}
        </AnimatePresence>
        {!allFinished && foldedSections.length > 0 && (
          <p className="min-w-0 truncate text-[12px] text-ink-3">
            {foldedSections.map((sec, i) => (
              <Fragment key={sec.id}>
                {i > 0 && (i === foldedSections.length - 1 ? ' and ' : ', ')}
                <button
                  type="button"
                  aria-label={`Go to ${sec.title}`}
                  className="rounded-sm underline-offset-2 hover:text-ink hover:underline"
                  onClick={() => document.getElementById(`focus-sec-${sec.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                >
                  {sec.title}
                </button>
              </Fragment>
            ))}
            {foldedSections.length === 1 ? ' is' : ' are'} finished and folded.
          </p>
        )}
        {anyFinished && (
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-[12px] text-ink-3 transition-colors hover:text-ink"
          >
            {showAll ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
            {showAll ? 'Fold finished sections' : 'Show all fields'}
          </button>
        )}
      </div>
      {states.map((st, i) => (
        <FocusSection key={st.section.id} {...st} gap={i === 0 ? 0 : st.folded && states[i - 1].folded ? 8 : 24} />
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// A section: full rows, or one summary line once everything in it is done
// ---------------------------------------------------------------------------

const countWord: Partial<Record<FieldStatus, string>> = { verified: 'verified', user_answered: 'from you', approved: 'approved' }

function countText(statuses: FieldStatus[]) {
  const order: FieldStatus[] = ['verified', 'user_answered', 'approved']
  return order
    .map((st) => [st, statuses.filter((s) => s === st).length] as const)
    .filter(([, n]) => n > 0)
    .map(([st, n]) => `${n} ${countWord[st]}`)
    .join(' · ')
}

/** "Acme Holdings LLC, 500 Market Street…, Dana Whitfield…" */
function previewText(section: SectionDef, fields: Record<string, FieldState>, rates: RatesState) {
  const many = section.fields.length + (section.hasRates ? 1 : 0) > 1
  const short = (v: string) => {
    let out = v.split('\n')[0]
    const comma = out.indexOf(',')
    if (many && comma > 6) out = `${out.slice(0, comma)}…`
    if (out.length > 34) out = `${out.slice(0, out.lastIndexOf(' ', 32))}…`
    return out
  }
  const parts = section.fields.map((id) => {
    const def = fieldDefs[id]
    const v = displayValue(fields[id])
    if (!v) return null
    return def.kind === 'boolean' ? `${def.label}: ${v}` : short(v)
  })
  if (section.hasRates && rates.rows.length) parts.push(`${rates.rows.length} hourly rates`)
  return parts.filter(Boolean).join(', ')
}

function Dots({ statuses }: { statuses: FieldStatus[] }) {
  return (
    <span className="flex shrink-0 items-center gap-1" aria-hidden>
      {statuses.map((s, i) => (
        <span
          key={i}
          className={cn(
            'size-2 rounded-full transition-colors duration-300',
            s === 'approved' ? 'bg-ok' : s === 'user_answered' ? 'bg-cobalt' : 'shadow-[inset_0_0_0_1.5px_var(--ok)]'
          )}
        />
      ))}
    </span>
  )
}

function useApproveSection(section: SectionDef) {
  const approveSection = useApp((s) => s.approveSection)
  return () => {
    const { fields, rates, unapproveField } = useApp.getState()
    const ids = section.fields.filter((id) => fields[id]?.status === 'verified' || fields[id]?.status === 'user_answered')
    if (section.hasRates && rates.status === 'verified') ids.push('hourlyRates')
    approveSection(section.id)
    toast.success(`${section.title} approved`, { action: { label: 'Undo', onClick: () => ids.forEach((id) => unapproveField(id)) } })
  }
}

function ApproveAction({ section, statuses, compact }: { section: SectionDef; statuses: FieldStatus[]; compact?: boolean }) {
  const approve = useApproveSection(section)
  const approvable = statuses.some((s) => s === 'verified' || s === 'user_answered')
  if (statuses.every((s) => s === 'approved')) {
    return (
      <span className="flex h-7 shrink-0 items-center gap-1 px-2 text-[12px] font-medium text-ok">
        <Check className="size-3.5" /> Approved
      </span>
    )
  }
  return (
    <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[12px] text-ink-2" disabled={!approvable} onClick={approve}>
      {compact ? (
        <span>
          Approve<span className="hidden @lg:inline"> section</span>
        </span>
      ) : (
        'Approve section'
      )}
    </Button>
  )
}

function FocusSection({
  section,
  statuses,
  finished,
  folded,
  peeking,
  gap
}: {
  section: SectionDef
  statuses: FieldStatus[]
  finished: boolean
  folded: boolean
  peeking: boolean
  gap: number
}) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const showAll = useFocus((s) => s.showAll)
  const openSection = useFocus((s) => s.openSection)
  const foldSection = useFocus((s) => s.foldSection)
  const holdSection = useFocus((s) => s.holdSection)
  const lineRef = useRef<HTMLButtonElement>(null)
  const refocusLine = useRef(false)
  const doneCount = statuses.filter((s) => DONE.includes(s)).length
  const preview = useMemo(() => previewText(section, fields, rates), [section, fields, rates])
  const bodyId = `focus-section-${section.id}`

  useEffect(() => {
    if (folded && refocusLine.current) {
      refocusLine.current = false
      lineRef.current?.focus()
    }
  }, [folded])

  // While the agent's change is on show: hovering waits, touching keeps it open.
  const peekHandlers = peeking
    ? {
        onPointerMove: () => holdSection(section.id, true),
        onPointerLeave: () => {
          holdSection(section.id, false)
          useFocus.getState().peekSection(section.id, Date.now() + 1500)
        },
        onPointerDown: () => openSection(section.id),
        onFocus: () => openSection(section.id)
      }
    : {}

  return (
    <motion.section
      id={`focus-sec-${section.id}`}
      initial={false}
      animate={{ marginTop: gap }}
      transition={{ duration: 0.28, ease }}
      aria-labelledby={`${bodyId}-title`}
      {...peekHandlers}
    >
      <AnimatePresence initial={false}>
        {folded ? (
          <motion.div
            key="line"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease }}
            className="overflow-clip"
          >
            <div className="group flex min-h-11 items-center gap-2 rounded-lg border border-rule bg-panel pr-2 transition-colors hover:bg-panel-2/60">
              <h2 className="flex min-w-0 flex-1 self-stretch">
                <button
                  ref={lineRef}
                  type="button"
                  aria-expanded={false}
                  aria-controls={bodyId}
                  onClick={() => openSection(section.id)}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 rounded-l-lg py-2 pl-3 text-left focus-visible:-outline-offset-2"
                >
                  <ChevronRight className="size-3.5 shrink-0 text-ink-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
                  <span id={`${bodyId}-title`} className="eyebrow w-[88px] shrink-0">
                    {section.title}
                  </span>
                  <Dots statuses={statuses} />
                  <span className="num shrink-0 text-[12px] font-normal text-ink-2">{countText(statuses)}</span>
                  <span className="min-w-0 basis-full truncate pl-[26px] text-[13px] font-normal text-ink-3 @lg:flex-1 @lg:basis-0 @lg:pl-0">{preview}</span>
                </button>
              </h2>
              <ApproveAction section={section} statuses={statuses} compact />
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="full"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease }}
            className="overflow-clip"
          >
            <div className="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 pb-2">
              <h2 id={`${bodyId}-title`} className="eyebrow">
                {section.title}
              </h2>
              <span className="num text-[12px] text-ink-3">
                {doneCount}/{statuses.length}
              </span>
              <AnimatePresence initial={false}>
                {peeking && (
                  <motion.span
                    key="peek"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-1.5 text-[12px] text-ink-3"
                  >
                    <span className="size-1.5 rounded-full bg-cobalt" aria-hidden />
                    Just updated
                    <button type="button" onClick={() => openSection(section.id)} className="font-medium text-cobalt-ink underline-offset-2 hover:underline">
                      Keep open
                    </button>
                  </motion.span>
                )}
              </AnimatePresence>
              <div className="h-px min-w-6 flex-1 bg-rule" />
              <div className="flex items-center gap-0.5">
                {finished && !showAll && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1 px-2 text-[12px] text-ink-3"
                    aria-expanded
                    aria-controls={bodyId}
                    onClick={(e) => {
                      e.stopPropagation()
                      refocusLine.current = e.detail === 0
                      foldSection(section.id)
                    }}
                  >
                    <ChevronUp className="size-3.5" /> Fold
                  </Button>
                )}
                <ApproveAction section={section} statuses={statuses} />
              </div>
            </div>
            <div id={bodyId} className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-panel">
              {section.fields.map((id) => (
                <FieldRow key={id} def={fieldDefs[id]} field={fields[id]} />
              ))}
              {section.hasRates && <RatesRow />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  )
}
