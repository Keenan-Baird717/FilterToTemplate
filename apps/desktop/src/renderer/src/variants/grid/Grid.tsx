import { Check, ChevronDown, ChevronRight, CornerDownLeft, Loader2, SearchX } from 'lucide-react'
import { useEffect, useMemo, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import type { QuestionItem, QuestionSet } from '../../../../shared/protocol'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { locatorText } from '@/components/status'
import { ByLabel, GridCheckbox, Segments, SourceRefButton, StatusLabel } from './bits'
import { RATES, buildItems, canApprove, evidenceText, money, visibleRows, type GroupRow, type ItemRow, type RateChildRow, type Row } from './model'
import { emailOk, isTyping, useGrid, useLiveQuestion, useWash, useWidth } from './state'

// The sheet: one row per template value, grouped by section, with inline
// editing, inline answers to the agent's open question, and keyboard control.

const EDITABLE = new Set(['text', 'email', 'money', 'date'])
const pad = (n: number) => String(n).padStart(2, '0')

export interface GridActions {
  approve: (key: string) => void
  startEdit: (key: string) => void
  submitDraft: () => void
}

interface Layout {
  stacked: boolean
  evidence: boolean
  by: boolean
  cols: number
  compact: boolean
}

export function SheetGrid({ wide, onInspect, actions }: { wide: boolean; onInspect: (key: string) => void; actions: GridActions }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const filter = useGrid((s) => s.filter)
  const query = useGrid((s) => s.query)
  const grouped = useGrid((s) => s.grouped)
  const collapsed = useGrid((s) => s.collapsed)
  const ratesOpen = useGrid((s) => s.ratesOpen)
  const density = useGrid((s) => s.density)
  const active = useGrid((s) => s.active)
  const selected = useGrid((s) => s.selected)
  const reveal = useGrid((s) => s.reveal)
  const set = useGrid((s) => s.set)
  const setActive = useGrid((s) => s.setActive)
  const toggleSelected = useGrid((s) => s.toggleSelected)
  const setSelected = useGrid((s) => s.setSelected)
  const toggleCollapsed = useGrid((s) => s.toggleCollapsed)
  const question = useLiveQuestion()

  const items = useMemo(() => buildItems(fields, rates), [fields, rates])
  const rows = useMemo(
    () => visibleRows(items, rates, { filter, query, grouped, collapsed, ratesOpen }),
    [items, rates, filter, query, grouped, collapsed, ratesOpen]
  )

  const scrollRef = useRef<HTMLDivElement>(null)
  const width = useWidth(scrollRef, typeof window === 'undefined' ? 1200 : window.innerWidth)
  const stacked = width < 620
  const layout: Layout = {
    stacked,
    evidence: !stacked && width >= 980,
    by: !stacked && width >= 760,
    cols: stacked ? 2 : 5 + (width >= 980 ? 1 : 0) + (width >= 760 ? 1 : 0),
    compact: density === 'compact'
  }

  const rowRefs = useRef(new Map<string, HTMLTableRowElement>())
  const focusAfter = useRef(false)

  // Keyboard moves focus with the active row; reveal() scrolls to it.
  useEffect(() => {
    if (!focusAfter.current || !active) return
    focusAfter.current = false
    const el = rowRefs.current.get(active)
    el?.focus({ preventScroll: true })
    el?.scrollIntoView({ block: 'nearest' })
  }, [active, rows])

  useEffect(() => {
    if (!reveal || !active) return
    const id = requestAnimationFrame(() => {
      const el = rowRefs.current.get(active)
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      el?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
  }, [reveal]) // eslint-disable-line react-hooks/exhaustive-deps

  const selectableKeys = rows.filter((r): r is ItemRow => r.type === 'item').map((r) => r.key)
  const selCount = selectableKeys.filter((k) => selected[k]).length
  const anySelected = Object.keys(selected).length > 0

  const keysInGroup = (g: GroupRow) => {
    if (collapsed[g.section.id]) return g.items.map((i) => i.key)
    return rows.filter((r): r is ItemRow => r.type === 'item' && r.sectionId === g.section.id).map((r) => r.key)
  }

  const move = (delta: number, extend: boolean) => {
    if (!rows.length) return
    const idx = rows.findIndex((r) => r.key === active)
    const next = idx < 0 ? (delta > 0 ? 0 : rows.length - 1) : Math.max(0, Math.min(rows.length - 1, idx + delta))
    const target = rows[next]
    if (extend) {
      const cur = rows[idx]
      for (const r of [cur, target]) if (r?.type === 'item') toggleSelected(r.key, true)
    }
    focusAfter.current = true
    setActive(target.key)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLTableElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || isTyping(e.target)) return
    const onRow = (e.target as HTMLElement).getAttribute('role') === 'row'
    const row = rows.find((r) => r.key === active)
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        e.preventDefault()
        move(1, e.shiftKey)
        return
      case 'ArrowUp':
      case 'k':
        e.preventDefault()
        move(-1, e.shiftKey)
        return
      case 'Home':
        e.preventDefault()
        move(-rows.length, false)
        return
      case 'End':
        e.preventDefault()
        move(rows.length, false)
        return
    }
    if (!onRow || !row) return
    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault()
        if (row.type === 'group') toggleCollapsed(row.section.id, true)
        else if (row.type === 'rate') {
          focusAfter.current = true
          setActive(RATES)
        } else if (row.key === RATES) set({ ratesOpen: false })
        return
      case 'ArrowRight':
        e.preventDefault()
        if (row.type === 'group') toggleCollapsed(row.section.id, false)
        else if (row.key === RATES) set({ ratesOpen: true })
        return
      case ' ':
        e.preventDefault()
        if (row.type === 'group') {
          const keys = keysInGroup(row)
          setSelected(keys, !keys.every((k) => selected[k]))
        } else toggleSelected(row.fieldId)
        return
      case 'Enter':
        e.preventDefault()
        if (row.type === 'group') toggleCollapsed(row.section.id)
        else actions.startEdit(row.key)
        return
      case 'a':
      case 'A':
        e.preventDefault()
        if (row.type === 'group') {
          useApp.getState().approveSection(row.section.id)
          toast.success(`${row.section.title} approved`)
        } else actions.approve(row.fieldId)
        return
      case 'o':
      case 'O': {
        e.preventDefault()
        const src = row.type === 'rate' ? row.rate.source : row.type === 'item' ? row.sources[0] : undefined
        if (src) useApp.getState().openSource({ docId: src.docId, page: src.page, quote: src.quote, locator: src.locator })
        else toast.message('This row has no source yet')
        return
      }
      case 'Escape':
        if (anySelected) {
          e.preventDefault()
          useGrid.getState().clearSelection()
        }
        return
    }
  }

  const onRowClick = (key: string) => (e: MouseEvent) => {
    setActive(key)
    const interactive = (e.target as HTMLElement).closest('button, input, a, [role="checkbox"], [role="menuitemradio"]')
    if (!wide && !interactive) onInspect(key)
  }

  const register = (key: string) => (el: HTMLTableRowElement | null) => {
    if (el) rowRefs.current.set(key, el)
    else rowRefs.current.delete(key)
  }

  const onRowFocus = (key: string) => (e: React.FocusEvent<HTMLTableRowElement>) => {
    if (e.target === e.currentTarget && useGrid.getState().active !== key) setActive(key)
  }
  // One tab stop for the sheet: the active row, or the first row when it's hidden.
  const tabKey = rows.some((r) => r.key === active) ? active : (rows[0]?.key ?? null)

  const common = { layout, question, actions, anySelected, register, onRowClick, onRowFocus, tabKey }

  // Split rows into one <tbody> per group so group headers stick per section.
  const bodies: { key: string; rows: Row[] }[] = []
  for (const r of rows) {
    if (r.type === 'group' || !bodies.length) bodies.push({ key: r.key, rows: [] })
    bodies[bodies.length - 1].rows.push(r)
  }

  return (
    <div ref={scrollRef} className="grid-thin-scroll relative min-h-0 flex-1 overflow-auto bg-panel">
      <table
        role="treegrid"
        aria-label="Template fields"
        aria-multiselectable="true"
        className="w-full table-fixed border-separate border-spacing-0"
        onKeyDown={onKeyDown}
      >
        <thead>
          <tr>
            <th scope="col" className={cn(stacked ? 'h-0 w-9 border-0 p-0' : 'sticky top-0 z-20 h-[34px] w-11 border-b border-rule bg-panel px-0 shadow-[0_-4px_0_var(--panel)]')}>
              {stacked ? (
                <span className="sr-only">Select</span>
              ) : (
                <span className="flex items-center justify-center">
                  <GridCheckbox
                    aria-label="Select all visible rows"
                    checked={selCount === 0 ? false : selCount === selectableKeys.length ? true : 'indeterminate'}
                    onCheckedChange={(v) => setSelected(selectableKeys, v === true)}
                  />
                </span>
              )}
            </th>
            {stacked ? (
              <th scope="col" className="h-0 border-0 p-0">
                <span className="sr-only">Field</span>
              </th>
            ) : (
              <>
                <th scope="col" className={cn(thClass, 'w-[24%]')}>
                  Field
                </th>
                <th scope="col" className={thClass}>
                  Value
                </th>
                <th scope="col" className={cn(thClass, 'w-[124px]')}>
                  Status
                </th>
                <th scope="col" className={cn(thClass, 'w-[132px]')}>
                  Source
                </th>
                {layout.evidence && (
                  <th scope="col" className={cn(thClass, 'w-[24%]')}>
                    Evidence
                  </th>
                )}
                {layout.by && (
                  <th scope="col" className={cn(thClass, 'w-[76px]')}>
                    By
                  </th>
                )}
              </>
            )}
          </tr>
        </thead>
        {bodies.map((b) => (
          <tbody key={b.key}>
            {b.rows.map((r) =>
              r.type === 'group' ? (
                <GroupRowView key={r.key} row={r} active={active === r.key} keys={keysInGroup(r)} {...common} />
              ) : r.type === 'item' ? (
                <ItemRowView key={r.key} row={r} active={active === r.key} selected={!!selected[r.key]} {...common} />
              ) : (
                <RateRowView key={r.key} row={r} active={active === r.key} {...common} />
              )
            )}
          </tbody>
        ))}
      </table>
      {rows.length === 0 && <EmptyResult />}
    </div>
  )
}

const thClass = 'sticky top-0 z-20 h-[34px] border-b border-rule bg-panel px-3 shadow-[0_-4px_0_var(--panel)] text-left text-[11px] font-medium tracking-[0.02em] text-ink-3'

interface CommonProps {
  layout: Layout
  question: QuestionSet | null
  actions: GridActions
  anySelected: boolean
  register: (key: string) => (el: HTMLTableRowElement | null) => void
  onRowClick: (key: string) => (e: MouseEvent) => void
  onRowFocus: (key: string) => (e: React.FocusEvent<HTMLTableRowElement>) => void
  tabKey: string | null
}

const cellBase = 'border-b border-rule px-3 align-middle'
const rowBase = 'grid-row group/row cursor-default outline-none scroll-mt-[76px] scroll-mb-3 hover:[&>td]:bg-panel-2/70'

function Gutter({ n, label, selected, show, onToggle }: { n?: number; label: string; selected: boolean; show: boolean; onToggle: (v: boolean) => void }) {
  return (
    <span className="relative flex h-5 items-center justify-center">
      {n !== undefined && (
        <span
          className={cn('font-mono text-[11px] text-ink-3 transition-opacity group-hover/row:opacity-0', show && 'opacity-0')}
          aria-hidden
        >
          {pad(n)}
        </span>
      )}
      <GridCheckbox
        aria-label={`Select ${label}`}
        checked={selected}
        onCheckedChange={(v) => onToggle(v === true)}
        onClick={(e) => e.stopPropagation()}
        tabIndex={-1}
        className={cn(
          'absolute opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100',
          show && 'opacity-100'
        )}
      />
    </span>
  )
}

function ItemRowView({ row, active, selected, layout, question, actions, anySelected, register, onRowClick, onRowFocus, tabKey }: CommonProps & { row: ItemRow; active: boolean; selected: boolean }) {
  const wash = useWash(row.key)
  const ratesOpen = useGrid((s) => s.ratesOpen)
  const toggleSelected = useGrid((s) => s.toggleSelected)
  const sent = useGrid((s) => s.sent[row.key])
  const draft = useGrid((s) => s.draft[row.key])
  const qItem = question?.items.find((i) => i.fieldId === row.fieldId)
  const pendingSend = !!sent && (row.status === 'conflict' || row.status === 'missing')
  const ready = !!qItem && !!draft?.trim() && (qItem.inputType !== 'email' || emailOk(draft))
  const py = layout.compact ? 'py-1' : 'py-2'
  const isRates = row.key === RATES

  const statusNode = pendingSend ? (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-2">
      <Loader2 className="size-3.5 animate-spin text-cobalt" aria-hidden /> Sending
    </span>
  ) : ready ? (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-medium whitespace-nowrap text-cobalt">
      <CornerDownLeft className="size-3.5" aria-hidden /> Ready to send
    </span>
  ) : (
    <StatusLabel status={row.status} />
  )

  const fieldNode = (
    <div className={cn('min-w-0', layout.compact ? 'flex items-baseline gap-2' : 'flex flex-col')}>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn('truncate font-medium text-ink', layout.compact ? 'text-[13px]' : 'text-[13px] leading-[18px]')}>{row.label}</span>
        {isRates && (
          <button
            type="button"
            aria-expanded={ratesOpen}
            aria-label={ratesOpen ? 'Hide rate rows' : 'Show rate rows'}
            onClick={(e) => {
              e.stopPropagation()
              useGrid.getState().set({ ratesOpen: !ratesOpen })
            }}
            className="inline-flex h-[18px] shrink-0 items-center gap-0.5 rounded-[4px] border border-rule px-1 font-mono text-[10.5px] text-ink-2 hover:border-cobalt/50 hover:text-ink"
          >
            {ratesOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}4
          </button>
        )}
      </span>
      <code className={cn('truncate font-mono text-[11px] text-ink-3', layout.compact ? 'min-w-0' : 'leading-[15px]')} title="Tag in layout.docx">
        {row.tag}
      </code>
    </div>
  )

  const valueNode = <ValueCell row={row} qItem={qItem} sent={pendingSend ? sent : undefined} compact={layout.compact} actions={actions} />
  const sourceNode = <SourceCell row={row} />
  const ev = evidenceText(row)
  const evidenceNode = ev ? (
    <span className={cn('block truncate', ev.quote ? 'text-ink-2' : 'text-ink-3')} title={ev.text}>
      {ev.quote ? `“${ev.text}”` : ev.text}
    </span>
  ) : (
    <span className="text-ink-3">–</span>
  )

  return (
    <tr
      ref={register(row.key)}
      id={`grid-row-${row.key}`}
      role="row"
      aria-level={2}
      aria-selected={selected}
      aria-expanded={isRates ? ratesOpen : undefined}
      tabIndex={tabKey === row.key ? 0 : -1}
      onFocus={onRowFocus(row.key)}
      data-active={active}
      onClick={onRowClick(row.key)}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button, input')) return
        actions.startEdit(row.key)
      }}
      className={cn(rowBase, selected && !active && '[&>td]:bg-cobalt-soft/75', wash && 'grid-wash')}
    >
      <td className={cn(cellBase, 'w-11 px-0', py, layout.stacked && 'align-top pt-3')}>
        <Gutter n={row.n} label={row.label} selected={selected} show={selected || active || anySelected} onToggle={(v) => toggleSelected(row.key, v)} />
      </td>
      {layout.stacked ? (
        <td className={cn(cellBase, 'py-2.5 pl-1')}>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <div className="min-w-0 flex-1">{fieldNode}</div>
              <span className="shrink-0 pt-px">{statusNode}</span>
            </div>
            <div className="min-w-0">{valueNode}</div>
            {(row.sources.length > 0 || ev) && (
              <div className="flex min-w-0 items-center gap-2 text-[12px]">
                {row.sources.length > 0 && <span className="shrink-0">{sourceNode}</span>}
                <span className="min-w-0 flex-1">{evidenceNode}</span>
              </div>
            )}
          </div>
        </td>
      ) : (
        <>
          <td className={cn(cellBase, py)}>{fieldNode}</td>
          <td className={cn(cellBase, py)}>{valueNode}</td>
          <td className={cn(cellBase, py)}>{statusNode}</td>
          <td className={cn(cellBase, py)}>{sourceNode}</td>
          {layout.evidence && <td className={cn(cellBase, py, 'text-[12px]')}>{evidenceNode}</td>}
          {layout.by && (
            <td className={cn(cellBase, py)}>
              <ByLabel by={draft && qItem ? 'user' : row.by} />
            </td>
          )}
        </>
      )}
    </tr>
  )
}

function SourceCell({ row }: { row: ItemRow }) {
  if (!row.sources.length) return <span className="text-ink-3">–</span>
  if (row.key === RATES) {
    const s = row.sources[0]
    return <SourceRefButton source={{ ...s, locator: 'Rates!B2:C5', quote: 'Rates B2:C5' }} />
  }
  if (row.status === 'conflict') {
    return (
      <span className="flex min-w-0 gap-1">
        {row.sources.slice(0, 2).map((s, i) => (
          <SourceRefButton key={i} source={s} />
        ))}
      </span>
    )
  }
  const extra = row.sources.length - 1
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <SourceRefButton source={row.sources[0]} />
      {extra > 0 && <span className="font-mono text-[11px] text-ink-3">+{extra}</span>}
    </span>
  )
}

function ValueCell({ row, qItem, sent, compact, actions }: { row: ItemRow; qItem?: QuestionItem; sent?: string; compact: boolean; actions: GridActions }) {
  const editing = useGrid((s) => s.editing === row.key)
  const f = row.field

  if (sent) {
    const shown = qItem?.options?.find((o) => o.value === sent)?.display ?? f?.candidates?.find((c) => String(c.value) === sent)?.display ?? sent
    return <span className="truncate text-ink-2">{shown}</span>
  }

  if (row.status === 'conflict' && f?.candidates) return <ChooseMenu row={row} qItem={qItem} />

  if (row.status === 'missing' && (row.kind === 'email' || row.kind === 'text')) return <MissingInput row={row} qItem={qItem} actions={actions} />

  if (editing && EDITABLE.has(row.kind)) return <InlineEdit row={row} />

  if (row.kind === 'narrative') {
    if (row.status === 'drafting') return <p className={cn('caret text-ink', compact ? 'truncate' : 'line-clamp-2')}>{row.value}</p>
    if (row.value) return <p className={cn('text-ink', compact ? 'truncate' : 'line-clamp-2 leading-[18px]')}>{row.value.replace(/\n+/g, ' ')}</p>
    return <span className="text-ink-3 italic">Waiting for the agent</span>
  }

  if (row.kind === 'boolean' && row.value) {
    return (
      <span className="inline-flex items-center gap-1.5 text-ink">
        <span className="font-serif text-[15px] leading-none text-ink-2" aria-hidden>
          {f?.value ? '☒' : '☐'}
        </span>
        {row.value}
      </span>
    )
  }

  if (row.key === RATES) {
    return row.value ? <span className="truncate font-mono text-[12px] text-ink">{row.value}</span> : <span className="text-ink-3 italic">Waiting for the agent</span>
  }

  if (!row.value) return <span className="text-ink-3 italic">{row.status === 'empty' ? 'Waiting for the agent' : 'Not found'}</span>
  return (
    <span className={cn('block text-ink', compact ? 'truncate' : 'line-clamp-2 leading-[18px]', (row.kind === 'money' || row.kind === 'date') && 'font-mono text-[12.5px]')}>
      {row.value}
    </span>
  )
}

function InlineEdit({ row }: { row: ItemRow }) {
  const set = useGrid((s) => s.set)
  const ref = useRef<HTMLInputElement>(null)
  const done = useRef(false)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const finish = (commit: boolean) => {
    if (done.current) return
    done.current = true
    const v = ref.current?.value ?? ''
    if (commit && v.trim() !== (row.value ?? '')) {
      useApp.getState().editField(row.key, v)
      toast.success(`${row.label} updated`, { description: 'The agent won’t overwrite your edit.' })
    }
    set({ editing: null })
    requestAnimationFrame(() => document.getElementById(`grid-row-${row.key}`)?.focus())
  }
  return (
    <input
      ref={ref}
      defaultValue={row.value ?? ''}
      type={row.kind === 'email' ? 'email' : 'text'}
      aria-label={`Edit ${row.label}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation()
        if (e.key === 'Enter') finish(true)
        if (e.key === 'Escape') finish(false)
      }}
      onBlur={() => finish(true)}
      className="h-7 w-full min-w-0 rounded-[5px] border border-cobalt bg-panel px-2 text-[13px] text-ink ring-3 ring-cobalt/15 outline-none"
    />
  )
}

function MissingInput({ row, qItem, actions }: { row: ItemRow; qItem?: QuestionItem; actions: GridActions }) {
  const draft = useGrid((s) => s.draft[row.key] ?? '')
  const setDraft = useGrid((s) => s.setDraft)
  const invalid = row.kind === 'email' && draft.trim() !== '' && !emailOk(draft)
  const commitDirect = (v: string) => {
    if (qItem || !v.trim()) return
    if (row.kind === 'email' && !emailOk(v)) return
    useApp.getState().editField(row.key, v)
    useGrid.getState().setDraft(row.key, '')
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <input
        id={`grid-input-${row.key}`}
        type={row.kind === 'email' ? 'email' : 'text'}
        value={draft}
        placeholder={qItem?.placeholder ?? (row.kind === 'email' ? 'name@company.com' : 'Type a value')}
        aria-label={row.label}
        aria-invalid={invalid}
        aria-describedby={invalid ? `grid-input-${row.key}-err` : undefined}
        onChange={(e) => setDraft(row.key, e.target.value)}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          e.stopPropagation()
          if (e.key === 'Enter') {
            e.preventDefault()
            if (qItem) actions.submitDraft()
            else commitDirect(e.currentTarget.value)
          }
          if (e.key === 'Escape') document.getElementById(`grid-row-${row.key}`)?.focus()
        }}
        onBlur={(e) => commitDirect(e.currentTarget.value)}
        className={cn(
          'h-7 w-full max-w-[340px] min-w-0 rounded-[5px] border bg-panel px-2 text-[13px] text-ink transition-[border-color,box-shadow] outline-none placeholder:text-ink-3 focus:ring-3',
          invalid ? 'border-bad focus:ring-bad/15' : draft ? 'border-cobalt/60 focus:ring-cobalt/15' : 'border-bad/40 border-dashed focus:border-solid focus:border-cobalt focus:ring-cobalt/15'
        )}
      />
      {invalid && (
        <span id={`grid-input-${row.key}-err`} className="text-[11.5px] text-bad">
          Enter an address like name@acmeholdings.com
        </span>
      )}
    </div>
  )
}

function ChooseMenu({ row, qItem }: { row: ItemRow; qItem?: QuestionItem }) {
  const open = useGrid((s) => s.choosing === row.key)
  const draft = useGrid((s) => s.draft[row.key])
  const set = useGrid((s) => s.set)
  const setDraft = useGrid((s) => s.setDraft)
  const docs = useApp((s) => s.docs)
  const candidates = row.field?.candidates ?? []
  const chosen = candidates.find((c) => String(c.value) === draft)

  const pick = (value: string) => {
    const c = candidates.find((x) => String(x.value) === value)
    if (!c) return
    if (qItem) setDraft(row.key, value)
    else {
      useApp.getState().editField(row.key, c.display)
      toast.success(`${row.label} set to ${c.display}`)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={(o) => set({ choosing: o ? row.key : null })}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={chosen ? `${row.label}: ${chosen.display}. Change` : `Choose ${row.label}`}
          className={cn(
            'inline-flex h-7 max-w-full min-w-0 items-center gap-1.5 rounded-[5px] border px-2 text-[13px] transition-colors',
            chosen ? 'border-cobalt/60 bg-panel text-ink hover:bg-cobalt-soft' : 'border-dashed border-warn/60 bg-warn-soft/50 font-medium text-warn hover:bg-warn-soft'
          )}
        >
          <span className="truncate">{chosen ? chosen.display : 'Choose…'}</span>
          <ChevronDown className="size-3.5 shrink-0 opacity-70" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[320px] p-1">
        <DropdownMenuLabel className="px-2 pt-1.5 pb-1 text-[11px] font-medium text-ink-3">{qItem?.label ?? `Pick the ${row.label.toLowerCase()}`}</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={draft ?? ''} onValueChange={pick}>
          {candidates.map((c) => (
            <DropdownMenuRadioItem key={String(c.value)} value={String(c.value)} className="items-start py-2">
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-medium text-ink">{c.display}</span>
                {c.sources.map((s, i) => {
                  const d = docs.find((x) => x.id === s.docId)
                  return (
                    <span key={i} className="flex min-w-0 flex-col gap-0.5 text-[11.5px]">
                      <span className="truncate font-mono text-ink-3">
                        <span className="text-cobalt">{s.docId}</span> {locatorText(s)} · {d?.name}
                      </span>
                      <span className="text-ink-2">“{s.quote}”</span>
                    </span>
                  )
                })}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        {qItem?.help && <p className="border-t border-rule px-2 pt-1.5 pb-1 text-[11.5px] text-ink-3">{qItem.help}</p>}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function RateRowView({ row, active, layout, register, onRowClick, onRowFocus, tabKey }: CommonProps & { row: RateChildRow; active: boolean }) {
  const py = layout.compact ? 'py-1' : 'py-1.5'
  const s = row.rate.source
  const label = (
    <span className="flex min-w-0 items-center gap-2">
      <span className="ml-1 inline-block h-2.5 w-2.5 shrink-0 -translate-y-[3px] rounded-bl-[3px] border-b border-l border-ink-3/50" aria-hidden />
      <span className="truncate text-ink">{row.rate.role}</span>
      <code className="shrink-0 font-mono text-[11px] text-ink-3">row {row.index + 1}</code>
    </span>
  )
  const value = <span className="font-mono text-[12.5px] text-ink">{money(row.rate.rate)}/hr</span>
  return (
    <tr
      ref={register(row.key)}
      id={`grid-row-${row.key}`}
      role="row"
      aria-level={3}
      tabIndex={tabKey === row.key ? 0 : -1}
      onFocus={onRowFocus(row.key)}
      data-active={active}
      onClick={onRowClick(row.key)}
      className={rowBase}
    >
      <td className={cn(cellBase, 'w-11 px-0', py)} />
      {layout.stacked ? (
        <td className={cn(cellBase, 'py-2 pl-1')}>
          <div className="flex min-w-0 items-center justify-between gap-3">
            {label}
            <span className="flex shrink-0 items-center gap-2">
              {value}
              {s && <SourceRefButton source={s} />}
            </span>
          </div>
        </td>
      ) : (
        <>
          <td className={cn(cellBase, py, 'pl-4')}>{label}</td>
          <td className={cn(cellBase, py)}>{value}</td>
          <td className={cn(cellBase, py)}>
            <span className="text-[12px] text-ink-3">In table</span>
          </td>
          <td className={cn(cellBase, py)}>{s ? <SourceRefButton source={s} /> : <span className="text-ink-3">–</span>}</td>
          {layout.evidence && (
            <td className={cn(cellBase, py, 'text-[12px]')}>
              <span className="block truncate text-ink-2">{s ? `“${s.quote}”` : '–'}</span>
            </td>
          )}
          {layout.by && (
            <td className={cn(cellBase, py)}>
              <ByLabel by="agent" />
            </td>
          )}
        </>
      )}
    </tr>
  )
}

function GroupRowView({ row, active, keys, layout, register, onRowClick, onRowFocus, tabKey }: CommonProps & { row: GroupRow; active: boolean; keys: string[] }) {
  const collapsed = useGrid((s) => !!s.collapsed[row.section.id])
  const selected = useGrid((s) => s.selected)
  const toggleCollapsed = useGrid((s) => s.toggleCollapsed)
  const setSelected = useGrid((s) => s.setSelected)
  const statuses = row.items.map((i) => i.status)
  const total = row.items.length
  const needs = statuses.filter((s) => s === 'conflict' || s === 'missing').length
  const approvable = statuses.filter(canApprove).length
  const allApproved = statuses.every((s) => s === 'approved')
  const selCount = keys.filter((k) => selected[k]).length
  const sticky = cn('sticky z-10 border-b border-rule bg-panel-2', layout.stacked ? 'top-0' : 'top-[33px]')

  return (
    <tr
      ref={register(row.key)}
      id={`grid-row-${row.key}`}
      role="row"
      aria-level={1}
      aria-expanded={!collapsed}
      tabIndex={tabKey === row.key ? 0 : -1}
      onFocus={onRowFocus(row.key)}
      data-active={active}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest('button, [role="checkbox"]')) return
        onRowClick(row.key)(e)
      }}
      className="grid-row group/row scroll-mt-[34px] outline-none"
    >
      <td className={cn(sticky, 'w-11 px-0 py-1.5')}>
        <span className="flex items-center justify-center">
          <GridCheckbox
            aria-label={`Select every row in ${row.section.title}`}
            checked={selCount === 0 ? false : selCount === keys.length ? true : 'indeterminate'}
            onCheckedChange={(v) => setSelected(keys, v === true)}
            tabIndex={-1}
          />
        </span>
      </td>
      <td colSpan={layout.cols - 1} className={cn(sticky, 'py-1.5 pr-2 pl-1.5')}>
        <div className="flex min-w-0 items-center gap-2.5">
          <button
            type="button"
            tabIndex={-1}
            aria-label={collapsed ? `Expand ${row.section.title}` : `Collapse ${row.section.title}`}
            onClick={() => toggleCollapsed(row.section.id)}
            className="rounded-[4px] p-0.5 text-ink-3 hover:bg-panel hover:text-ink"
          >
            <ChevronRight className={cn('size-3.5 transition-transform duration-150', !collapsed && 'rotate-90')} />
          </button>
          <span className="text-[12px] font-semibold tracking-[0.01em] text-ink">{row.section.title}</span>
          <span className="font-mono text-[11px] text-ink-3">
            {row.done}/{total}
          </span>
          <Segments statuses={statuses} />
          {needs > 0 && (
            <span className="hidden text-[12px] text-warn sm:inline">
              {needs} need{needs === 1 ? 's' : ''} you
            </span>
          )}
          <span className="ml-auto" />
          {allApproved ? (
            <span className="inline-flex items-center gap-1 pr-1 text-[12px] font-medium text-ok">
              <Check className="size-3.5" /> Approved
            </span>
          ) : approvable > 0 ? (
            <Button
              variant="ghost"
              size="xs"
              tabIndex={-1}
              className="h-6 text-[12px] font-normal text-ink-2 hover:bg-panel hover:text-ink"
              onClick={() => {
                useApp.getState().approveSection(row.section.id)
                toast.success(`${row.section.title} approved`, { description: `${approvable} value${approvable === 1 ? '' : 's'} approved` })
              }}
            >
              Approve section
            </Button>
          ) : null}
        </div>
      </td>
    </tr>
  )
}

function EmptyResult(): ReactNode {
  const set = useGrid((s) => s.set)
  const query = useGrid((s) => s.query)
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-16 text-center text-ink-2">
      <SearchX className="size-5 text-ink-3" />
      <p>{query ? `Nothing matches “${query}”.` : 'No rows in this view.'}</p>
      <Button variant="outline" size="xs" onClick={() => set({ query: '', filter: 'all' })}>
        Show every row
      </Button>
    </div>
  )
}
