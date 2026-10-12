import { Check, CircleHelp, Download, FileText, FolderOpen, Keyboard, ListTree, PanelRight, RotateCcw, Rows4, Search, Upload, X } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { project, sections, template } from '../../../../agent-core/demo-data'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { DocBadge, statusMeta } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { runFill, skipQuestion, useAgent, useSummary } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { segmentTone } from './bits'
import type { GridActions } from './Grid'
import { buildItems, canApprove, filterCounts } from './model'
import { emailOk, useGrid, useLiveQuestion, type Filter } from './state'

const doExport = () => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))

export function Header({ openPicker }: { openPicker: () => void }) {
  const { busy } = useAgent()
  return (
    <header className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-panel px-4 py-2 sm:px-5">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="truncate text-[15px] font-semibold tracking-[-0.01em] text-ink">{template.name}</h1>
        <span className="font-mono text-[11px] text-ink-3">v{template.version}</span>
        <span className="hidden truncate text-[12px] text-ink-2 lg:inline">· {project.client}</span>
      </div>
      <ProgressMap className="order-last basis-full md:order-none md:basis-auto" />
      <div className="ml-auto flex items-center gap-1">
        <SourcesMenu openPicker={openPicker} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[12.5px] text-ink-2" onClick={runFill} disabled={busy}>
              <RotateCcw className="size-3.5" />
              <span className="max-sm:sr-only">Run again</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear the sheet and watch the agent fill it again</TooltipContent>
        </Tooltip>
        <Button size="sm" className="h-8 gap-1.5 px-2.5 text-[12.5px]" onClick={doExport}>
          <Download className="size-3.5" />
          <span className="max-sm:sr-only">Export .docx</span>
        </Button>
      </div>
    </header>
  )
}

function ProgressMap({ className }: { className?: string }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const activity = useApp((s) => s.activity)
  const revealRow = useGrid((s) => s.revealRow)
  const { counts, total, done } = useSummary()
  const items = useMemo(() => buildItems(fields, rates), [fields, rates])
  const needs = counts.conflict + counts.missing

  return (
    <div className={cn('flex min-w-0 items-center gap-3', className)}>
      <span className="shrink-0 text-[12.5px]" aria-live="polite">
        <span className="font-semibold text-ink">{done}</span>
        <span className="text-ink-3"> of {total} filled</span>
      </span>
      <div className="flex items-center gap-1.5" aria-hidden>
        {sections.map((s) => (
          <span key={s.id} className="flex gap-[2px]">
            {items
              .filter((i) => i.sectionId === s.id)
              .map((i) => (
                <span
                  key={i.key}
                  title={`${i.label}: ${statusMeta[i.status].label}`}
                  onClick={() => revealRow(i.key, i.sectionId)}
                  className={cn('h-3 w-2 cursor-pointer rounded-[2px] transition-[background-color,transform] duration-500 hover:scale-y-125', segmentTone[i.status])}
                />
              ))}
          </span>
        ))}
      </div>
      <span className="min-w-0 truncate text-[12px]">
        {activity ? (
          <Shimmer as="span" className="text-[12px]" duration={1.6}>{`${activity}…`}</Shimmer>
        ) : needs ? (
          <span className="text-warn">
            {needs} need{needs === 1 ? 's' : ''} you
          </span>
        ) : done === total ? (
          <span className="inline-flex items-center gap-1 text-ok">
            <Check className="size-3.5" /> Ready to export
          </span>
        ) : null}
      </span>
    </div>
  )
}

const parserLabel = { 'text-layer': 'Text layer', ocr: 'OCR', word: 'Word', sheet: 'Sheet', email: 'Email' } as const

function SourcesMenu({ openPicker }: { openPicker: () => void }) {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const openSource = useApp((s) => s.openSource)
  const cites = citationsByDoc(fields, rates)
  const pages = docs.reduce((n, d) => n + d.pages, 0)
  const parsing = docs.filter((d) => d.status === 'parsing').length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-[12.5px] text-ink-2" aria-label={`Sources, ${docs.length} files`}>
          <FolderOpen className="size-3.5" />
          <span className="max-sm:hidden">Sources</span>
          <span className="font-mono text-[11px] text-ink-3">{docs.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(360px,calc(100vw-32px))] p-0">
        <div className="flex items-baseline justify-between gap-2 border-b border-rule px-3 py-2.5">
          <span className="text-[13px] font-semibold text-ink">Sources</span>
          <span className="text-[11px] text-ink-3">
            {docs.length} files · {pages} pages{parsing ? ` · ${parsing} parsing` : ''}
          </span>
        </div>
        <ul className="grid-thin-scroll max-h-[320px] overflow-y-auto py-1">
          {docs.map((d) => {
            const count = cites[d.id]?.length ?? 0
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={d.status === 'parsing'}
                  onClick={() => openSource({ docId: d.id, page: d.content[0]?.n })}
                  className="flex w-full min-w-0 items-center gap-2.5 px-3 py-1.5 text-left transition-colors hover:bg-panel-2 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <span className="w-6 shrink-0 font-mono text-[11px] text-ink-3">{d.id}</span>
                  <DocBadge kind={d.kind} className="w-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] text-ink">{d.name}</span>
                    {d.status === 'parsing' ? (
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-rule">
                          <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${d.progress ?? 0}%` }} />
                        </span>
                        <span className="font-mono text-[10px] text-ink-3">{d.parser === 'ocr' ? 'OCR' : 'Parsing'}</span>
                      </span>
                    ) : (
                      <span className="block text-[11px] text-ink-3">
                        {d.kind === 'xlsx' ? '1 sheet' : d.kind === 'eml' ? '1 message' : `${d.pages} pages`} · {parserLabel[d.parser]}
                      </span>
                    )}
                  </span>
                  {count > 0 && (
                    <span className="shrink-0 font-mono text-[10.5px] text-cobalt" title={`Cited ${count} times`}>
                      {count}×
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="border-t border-rule p-2">
          <button
            type="button"
            onClick={openPicker}
            className="flex w-full items-center gap-2.5 rounded-[6px] border border-dashed border-ink-3/40 px-3 py-2 text-left text-[12px] text-ink-2 transition-colors hover:border-cobalt/60 hover:bg-cobalt-soft/50"
          >
            <Upload className="size-4 shrink-0 text-ink-3" />
            <span>
              Add files
              <span className="block text-ink-3">PDF, Word, Excel or email. You can also drop them on the sheet.</span>
            </span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

const filterLabels: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs you' },
  { id: 'unreviewed', label: 'Unreviewed' },
  { id: 'approved', label: 'Approved' }
]

export function Toolbar({ wide, actions, onDocument, onDetails }: { wide: boolean; actions: GridActions; onDocument: () => void; onDetails: () => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const filter = useGrid((s) => s.filter)
  const query = useGrid((s) => s.query)
  const grouped = useGrid((s) => s.grouped)
  const density = useGrid((s) => s.density)
  const panel = useGrid((s) => s.panel)
  const selected = useGrid((s) => s.selected)
  const set = useGrid((s) => s.set)
  const setPref = useGrid((s) => s.setPref)
  const items = useMemo(() => buildItems(fields, rates), [fields, rates])
  const counts = filterCounts(items)
  const searchRef = useRef<HTMLInputElement>(null)

  const selKeys = Object.keys(selected)
  const approvable = items.filter((i) => selected[i.key] && canApprove(i.status))

  // "/" jumps to search from anywhere outside a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.altKey || e.ctrlKey || e.metaKey) return
      const t = e.target as HTMLElement
      if (t.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const approveSelected = () => {
    for (const i of approvable) useApp.getState().approveField(i.key)
    toast.success(`Approved ${approvable.length} value${approvable.length === 1 ? '' : 's'}`)
    useGrid.getState().clearSelection()
  }

  const docOn = wide ? panel === 'document' : false
  const detailsOn = wide ? panel === 'inspector' : false

  return (
    <div role="toolbar" aria-label="Sheet tools" className="flex flex-wrap items-center gap-x-2 gap-y-2 border-b border-rule bg-panel px-4 py-2 sm:px-5">
      <div className="relative min-w-0 flex-1 sm:max-w-[240px] sm:flex-none">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-ink-3" aria-hidden />
        <label htmlFor="grid-search" className="sr-only">
          Search fields, values and quotes
        </label>
        <input
          id="grid-search"
          ref={searchRef}
          value={query}
          onChange={(e) => set({ query: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              set({ query: '' })
              e.currentTarget.blur()
            }
            if (e.key === 'ArrowDown' || e.key === 'Enter') {
              e.preventDefault()
              document.querySelector<HTMLElement>('[role="treegrid"] tbody tr')?.focus()
            }
          }}
          placeholder="Search fields, values, quotes"
          autoComplete="off"
          className="h-8 w-full rounded-[6px] border border-rule bg-panel pr-8 pl-8 text-[12.5px] text-ink transition-[border-color,box-shadow] outline-none placeholder:text-ink-3 focus:border-cobalt/60 focus:ring-3 focus:ring-cobalt/15"
        />
        {query ? (
          <button
            type="button"
            onClick={() => set({ query: '' })}
            aria-label="Clear search"
            className="absolute top-1/2 right-1.5 flex size-5 -translate-y-1/2 items-center justify-center rounded-[4px] text-ink-3 hover:bg-panel-2 hover:text-ink"
          >
            <X className="size-3" />
          </button>
        ) : (
          <Kbd className="absolute top-1/2 right-2 h-[18px] -translate-y-1/2 rounded-[4px] border border-rule bg-panel-2 font-mono text-[10px] text-ink-3">/</Kbd>
        )}
      </div>

      <ToggleGroup
        type="single"
        value={filter}
        onValueChange={(v) => v && set({ filter: v as Filter })}
        aria-label="Show rows"
        className="order-last w-full gap-0.5 overflow-x-auto rounded-[7px] bg-panel-2 p-0.5 [scrollbar-width:none] sm:order-none sm:w-auto"
      >
        {filterLabels.map((f) => (
          <ToggleGroupItem
            key={f.id}
            value={f.id}
            className="h-7 flex-1 gap-1.5 rounded-[5px] px-2.5 text-[12px] font-normal text-ink-2 hover:bg-transparent hover:text-ink data-[state=on]:bg-panel data-[state=on]:font-medium data-[state=on]:text-ink data-[state=on]:shadow-[0_0_0_1px_var(--rule),0_1px_2px_rgb(0_0_0/0.04)] data-[spacing=0]:rounded-[5px] sm:flex-none"
          >
            {f.label}
            <span
              className={cn(
                'rounded-[4px] px-1 font-mono text-[10.5px] leading-4',
                f.id === 'needs' && counts.needs > 0 ? 'bg-warn-soft text-warn' : 'text-ink-3'
              )}
            >
              {counts[f.id]}
            </span>
          </ToggleGroupItem>
        ))}
      </ToggleGroup>

      <div className="flex items-center gap-0.5 max-sm:hidden">
        <IconToggle on={grouped} label="Group by section" onClick={() => setPref('grouped', !grouped)}>
          <ListTree className="size-4" />
        </IconToggle>
        <IconToggle on={density === 'compact'} label="Compact rows" onClick={() => setPref('density', density === 'compact' ? 'comfortable' : 'compact')}>
          <Rows4 className="size-4" />
        </IconToggle>
      </div>

      <div className={cn('flex h-8 items-center gap-1 rounded-[6px] transition-colors', selKeys.length ? 'bg-cobalt-soft pr-0.5 pl-2' : 'pr-0 max-lg:hidden')}>
        {selKeys.length > 0 && (
          <span className="text-[12px] font-medium whitespace-nowrap text-cobalt" aria-live="polite">
            {selKeys.length} selected
          </span>
        )}
        <Button
          size="xs"
          variant={selKeys.length ? 'default' : 'outline'}
          className="h-7 gap-1 px-2 text-[12px]"
          disabled={!approvable.length}
          onClick={approveSelected}
          title={selKeys.length && !approvable.length ? 'Only filled values can be approved' : undefined}
        >
          <Check className="size-3.5" />
          {approvable.length ? `Approve ${approvable.length}` : 'Approve selected'}
        </Button>
        {selKeys.length > 0 && (
          <Button variant="ghost" size="icon-xs" className="size-7 text-cobalt hover:bg-panel/60" onClick={() => useGrid.getState().clearSelection()} aria-label="Clear selection">
            <X className="size-3.5" />
          </Button>
        )}
      </div>

      <div className="ml-auto flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          aria-pressed={docOn}
          onClick={onDocument}
          className={cn('h-8 gap-1.5 px-2 text-[12.5px] text-ink-2', docOn && 'bg-cobalt-soft text-cobalt hover:bg-cobalt-soft hover:text-cobalt')}
        >
          <FileText className="size-4" />
          <span className="max-lg:sr-only">Document</span>
        </Button>
        <IconToggle on={detailsOn} label={wide ? (detailsOn ? 'Hide details' : 'Show details') : 'Show details'} onClick={onDetails}>
          <PanelRight className="size-4" />
        </IconToggle>
        <ShortcutsMenu actions={actions} />
      </div>
    </div>
  )
}

function IconToggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-pressed={on}
          aria-label={label}
          onClick={onClick}
          className={cn('size-8 text-ink-3 hover:text-ink', on && 'bg-cobalt-soft text-cobalt hover:bg-cobalt-soft hover:text-cobalt')}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

const shortcuts: [string[], string][] = [
  [['↑', '↓'], 'Move between rows'],
  [['Shift', '↑ ↓'], 'Extend the selection'],
  [['Space'], 'Select the row'],
  [['Enter'], 'Edit the value, or choose an answer'],
  [['A'], 'Approve the row, or a whole section'],
  [['O'], 'Open the row’s source'],
  [['←', '→'], 'Collapse or expand a group'],
  [['/'], 'Search'],
  [['Esc'], 'Clear the selection']
]

function ShortcutsMenu({ actions: _actions }: { actions: GridActions }) {
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon-sm" className="size-8 text-ink-3 hover:text-ink max-sm:hidden" aria-label="Keyboard shortcuts">
              <Keyboard className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Keyboard shortcuts</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[300px] p-3">
        <p className="mb-2 text-[12px] font-semibold text-ink">Keyboard</p>
        <dl className="flex flex-col gap-1.5">
          {shortcuts.map(([keys, what]) => (
            <div key={what} className="flex items-center justify-between gap-3 text-[12px]">
              <dt className="text-ink-2">{what}</dt>
              <dd className="flex shrink-0 gap-1">
                {keys.map((k) => (
                  <Kbd key={k} className="h-5 rounded-[4px] border border-rule bg-panel-2 px-1.5 font-mono text-[10.5px] text-ink-2">
                    {k}
                  </Kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-2.5 border-t border-rule pt-2 text-[11px] text-ink-3">Shortcuts work when a row has focus, not while you type.</p>
      </PopoverContent>
    </Popover>
  )
}

/** Above the sheet: the open question's state, then the agent's progress. */
export function AnswerBar({ actions }: { actions: GridActions }) {
  const question = useLiveQuestion()
  const { busy, activity } = useAgent()
  const draft = useGrid((s) => s.draft)
  const draftFor = useGrid((s) => s.draftFor)
  const filter = useGrid((s) => s.filter)
  const doneDismissed = useGrid((s) => s.doneDismissed)
  const sentAny = useGrid((s) => Object.keys(s.sent).length > 0)
  const set = useGrid((s) => s.set)
  const { done, total, counts } = useSummary()

  // A new question starts a fresh draft.
  useEffect(() => {
    if (question && draftFor !== question.id) set({ draft: {}, draftFor: question.id, sent: {}, doneDismissed: false })
  }, [question, draftFor, set])

  if (question) {
    const choiceItems = question.items.filter((i) => i.kind === 'choice')
    const ready = choiceItems.every((i) => draft[i.fieldId])
    const emailItem = question.items.find((i) => i.inputType === 'email')
    const email = emailItem ? (draft[emailItem.fieldId] ?? '').trim() : ''
    const invalid = !!email && !emailOk(email)
    const count = question.items.filter((i) => (draft[i.fieldId] ?? '').trim()).length

    return (
      <div
        role="region"
        aria-label="Open questions"
        className={cn(
          'flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-4 py-2 transition-colors sm:px-5',
          ready ? 'border-cobalt/25 bg-cobalt-soft' : 'border-rule bg-panel'
        )}
      >
        <CircleHelp className={cn('size-4 shrink-0', ready ? 'text-cobalt' : 'text-warn')} aria-hidden />
        <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
          {ready ? (
            <>
              <span className="font-medium text-ink">
                {count} answer{count === 1 ? '' : 's'} ready:
              </span>{' '}
              {question.items
                .filter((i) => (draft[i.fieldId] ?? '').trim())
                .map((i) => i.options?.find((o) => o.value === draft[i.fieldId])?.display ?? draft[i.fieldId].trim())
                .join(' and ')}
              .{!email && emailItem && ' The billing email stays empty if you send now.'}
              {invalid && <span className="text-bad"> Check the billing email first.</span>}
            </>
          ) : (
            <>
              <span className="font-medium text-ink">The agent needs {question.items.length} answers to finish.</span>{' '}
              <span className="max-sm:hidden">Choose the effective date and type the billing email in their rows.</span>
            </>
          )}
        </p>
        <div className="ml-auto flex items-center gap-1">
          {!ready && filter !== 'needs' && (
            <Button variant="ghost" size="xs" className="h-7 text-[12px] text-ink-2" onClick={() => set({ filter: 'needs' })}>
              Show them
            </Button>
          )}
          <Button variant="ghost" size="xs" className="h-7 text-[12px] text-ink-2" disabled={busy} onClick={() => skipQuestion(question)}>
            Skip for now
          </Button>
          {ready && (
            <Button size="xs" className="h-7 gap-1.5 px-2.5 text-[12px]" disabled={busy || invalid} onClick={actions.submitDraft}>
              Send {count} answer{count === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </div>
    )
  }

  if (busy && sentAny) {
    return (
      <div className="flex items-center gap-2.5 border-b border-rule bg-panel px-4 py-2 sm:px-5" role="status">
        <span className="size-1.5 animate-pulse rounded-full bg-cobalt" aria-hidden />
        <Shimmer as="span" className="text-[12.5px]" duration={1.6}>
          {activity ? `Answers sent · ${activity}…` : 'Answers sent · updating the sheet…'}
        </Shimmer>
      </div>
    )
  }

  if (!busy && done === total && !doneDismissed) {
    const unreviewed = counts.verified + counts.user_answered
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-rule bg-panel px-4 py-2 sm:px-5" role="status">
        <Check className="size-4 shrink-0 text-ok" aria-hidden />
        <p className="min-w-0 flex-1 text-[12.5px] text-ink-2">
          <span className="font-medium text-ink">All {total} filled.</span>{' '}
          {unreviewed ? `${unreviewed} still to review. Approve them, then export.` : 'Everything is approved. Export when ready.'}
        </p>
        <div className="ml-auto flex items-center gap-1">
          {unreviewed > 0 && filter !== 'unreviewed' && (
            <Button variant="ghost" size="xs" className="h-7 text-[12px] text-ink-2" onClick={() => set({ filter: 'unreviewed' })}>
              Show unreviewed
            </Button>
          )}
          <Button variant="ghost" size="icon-xs" className="size-7 text-ink-3" aria-label="Dismiss" onClick={() => set({ doneDismissed: true })}>
            <X className="size-3.5" />
          </Button>
        </div>
      </div>
    )
  }
  return null
}
