import { Check, Download, FileText, Highlighter, ListChecks, RotateCcw } from 'lucide-react'
import { useContext, useMemo, useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { toast } from 'sonner'
import { fieldDefs, sections, template, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { DocxView } from '@/components/DocxView'
import { FieldRow, FieldRowContext, ProgressStrip, RatesRow, type FieldRowOptions } from '@/components/FillPane'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { runFill, useAgent } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { DONE, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { AnswerBar, RowExtra, SectionMarker } from './Answers'
import { goToField, isWide, rowOrder, useInplace, useRowMode } from './state'

// The Workbench template column, composed from FillPane's exported pieces so
// section headers can carry a "to answer" marker and rows can host answers.

export function FieldsPane() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const { busy } = useAgent()

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Template">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-5 pt-4 pb-3 sm:px-6">
        <div className="flex min-w-56 flex-1 items-baseline gap-2.5">
          <h1 className="truncate text-[19px] leading-tight font-semibold tracking-[-0.01em]">{template.name}</h1>
          <span className="font-mono text-[12px] text-ink-3">v{template.version}</span>
        </div>
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
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={runFill} disabled={busy}>
                <RotateCcw className="size-3.5" /> Run again
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear the fields and watch the agent fill them</TooltipContent>
          </Tooltip>
          <Button
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))}
          >
            <Download className="size-3.5" /> Export .docx
          </Button>
        </div>
      </header>

      <ProgressStrip />
      <AnswerBar />

      <div className="min-h-0 flex-1">{view === 'fields' ? <FieldList /> : <Preview />}</div>
    </section>
  )
}

const typing = (el: HTMLElement) => !!el.closest('input, textarea, select, [contenteditable=true], [role=radio], [role=radiogroup]')

function FieldList() {
  const selected = useInplace((s) => s.selected)
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useRef<{ chip: HTMLElement; timer: number } | null>(null)

  const options = useMemo<FieldRowOptions>(
    () => ({
      selectedId: selected,
      onSelect: (id) => useInplace.getState().select(id),
      renderExtra: (id) => <RowExtra id={id} />
    }),
    [selected]
  )

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement
    if (e.key === 'Escape' && !typing(target)) {
      useInplace.getState().select(null)
      return
    }
    if ((e.key !== 'ArrowDown' && e.key !== 'ArrowUp') || e.altKey || e.metaKey || e.ctrlKey || typing(target)) return
    e.preventDefault()
    const current = useInplace.getState().selected
    const i = current ? rowOrder.indexOf(current) : -1
    const next = rowOrder[e.key === 'ArrowDown' ? Math.min(rowOrder.length - 1, i + 1) : Math.max(0, i - 1)]
    useInplace.getState().select(next)
    document.getElementById(`field-${next}`)?.scrollIntoView({ block: 'nearest' })
    if (target !== listRef.current) listRef.current?.focus({ preventScroll: true })
  }

  // Hovering a citation chip shows that value's evidence, with the hovered source emphasized.
  const onPointerOver = (e: PointerEvent<HTMLDivElement>) => {
    const chip = (e.target as HTMLElement).closest<HTMLElement>('.group\\/cite')
    if (!chip || hover.current?.chip === chip) return
    if (hover.current) clearTimeout(hover.current.timer)
    const row = chip.closest<HTMLElement>('[id^="field-"]')
    if (!row) return
    const fieldId = row.id.slice('field-'.length)
    const spans = chip.querySelectorAll('span')
    const key = `${spans[0]?.textContent ?? ''}|${spans[spans.length - 1]?.textContent ?? ''}`
    hover.current = { chip, timer: window.setTimeout(() => useInplace.getState().select(fieldId, key), 180) }
  }
  const onPointerOut = (e: PointerEvent<HTMLDivElement>) => {
    const h = hover.current
    if (!h || h.chip.contains(e.relatedTarget as Node | null)) return
    clearTimeout(h.timer)
    hover.current = null
    // The selection stays; the emphasis on the hovered source goes.
    if (useInplace.getState().focusSource) useInplace.setState({ focusSource: null })
  }

  return (
    <ScrollArea className="h-full">
      <div
        ref={listRef}
        tabIndex={0}
        role="group"
        data-inplace-list
        aria-label="Fields. Up and down arrows show each value's evidence."
        onKeyDown={onKeyDown}
        onPointerOver={onPointerOver}
        onPointerOut={onPointerOut}
        onClick={(e) => {
          // A click on a row's plain area keeps arrow keys working from there.
          const t = e.target as HTMLElement
          if (t.closest('[id^="field-"]') && !t.closest('button, a, input, label, [role=radio]')) listRef.current?.focus({ preventScroll: true })
        }}
        className="@container mx-auto flex max-w-[880px] flex-col gap-6 px-5 pt-5 pb-16 outline-none sm:px-6"
      >
        <FieldRowContext.Provider value={options}>
          {sections.map((section) => (
            <Section key={section.id} section={section} />
          ))}
        </FieldRowContext.Provider>
      </div>
    </ScrollArea>
  )
}

function Section({ section }: { section: SectionDef }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveSection = useApp((s) => s.approveSection)
  const statuses = [...section.fields.map((id) => fields[id]?.status ?? 'empty'), ...(section.hasRates ? [rates.status] : [])]
  const doneCount = statuses.filter((s) => DONE.includes(s)).length
  const approvable = statuses.some((s) => s === 'verified' || s === 'user_answered')
  const allApproved = statuses.every((s) => s === 'approved')

  return (
    <div className="flex flex-col" id={`section-${section.id}`}>
      <div className="flex items-center gap-3 pb-2">
        <h2 className="eyebrow">{section.title}</h2>
        <span className="num text-[12px] text-ink-3">
          {doneCount}/{statuses.length}
        </span>
        <SectionMarker section={section} />
        <div className="h-px flex-1 bg-rule" />
        {allApproved ? (
          <span className="flex items-center gap-1 text-[12px] font-medium text-ok">
            <Check className="size-3.5" /> Approved
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px] text-ink-2"
            disabled={!approvable}
            onClick={() => {
              approveSection(section.id)
              toast.success(`${section.title} approved`)
            }}
          >
            Approve section
          </Button>
        )}
      </div>
      <div
        className={cn(
          'flex flex-col divide-y divide-rule overflow-hidden rounded-lg border border-rule bg-panel',
          '[&>*]:transition-colors [&>:not([data-selected]):hover]:bg-panel-2/60 [&>[data-selected]]:bg-cobalt-soft/45',
          // The list's own keyboard focus shows on the selected row.
          '[[data-inplace-list]:focus-visible_&>[data-selected]]:shadow-[inset_0_0_0_2px_var(--cobalt)]'
        )}
      >
        {section.fields.map((id) => (
          <Row key={id} id={id} />
        ))}
        {section.hasRates && <SelectableRates />}
      </div>
    </div>
  )
}

/**
 * A shared FieldRow. While its question is open (or its answer is being
 * applied) the built-in candidate list and edit pencil make way for the
 * answer controls rendered through renderExtra.
 */
function Row({ id }: { id: string }) {
  const base = useContext(FieldRowContext)
  const field = useApp((s) => s.fields[id])
  const mode = useRowMode(id)
  const def = fieldDefs[id]
  if (mode === 'none' || !field) return <FieldRow def={def} field={field} />

  const conflict = field.status === 'conflict'
  const shown: FieldState = conflict ? { ...field, candidates: [] } : { ...field, sources: [], note: undefined }
  // A non-editable kind hides the pencil: the answer input below is the one place to type.
  const shownDef = conflict ? def : { ...def, kind: 'enum' as const }
  const note =
    mode === 'ask' ? (
      def.kind === 'date' ? 'Pick the date the letter should use' : 'Pick the value the letter should use'
    ) : (
      <Shimmer as="span" className="text-[13px]" duration={1.4}>
        Applying your choice…
      </Shimmer>
    )

  return (
    <FieldRowContext.Provider value={{ ...base, conflictNote: note }}>
      <FieldRow def={shownDef} field={shown} />
    </FieldRowContext.Provider>
  )
}

function SelectableRates() {
  const selected = useInplace((s) => s.selected === 'hourlyRates')
  return (
    <div data-selected={selected || undefined} onClick={() => useInplace.getState().select('hourlyRates')}>
      <RatesRow />
    </div>
  )
}

/** Workbench's preview; clicking a value shows its evidence on the left. */
function Preview() {
  const highlight = useApp((s) => s.highlight)
  const setHighlight = useApp((s) => s.setHighlight)
  const selected = useInplace((s) => s.selected)

  return (
    <div className="flex h-full min-h-0 flex-col bg-ground">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-panel px-5 py-2 text-[12px] text-ink-3 sm:px-6">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText className="size-3.5 shrink-0" />
          <span>Click a value to see its evidence</span>
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-ink-2" htmlFor="inplace-highlight">
          <Highlighter className="size-3.5" /> Highlight filled values
          <Switch id="inplace-highlight" checked={highlight} onCheckedChange={setHighlight} />
        </label>
      </div>
      <DocxView
        className="flex-1"
        highlight={highlight}
        selectedField={selected}
        onValueClick={(id) => (isWide() ? useInplace.getState().select(id) : goToField(id))}
      />
    </div>
  )
}
