import { ArrowDown, ArrowUp, Check, Download, FileText, ListChecks, Pencil, RotateCcw } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { fieldDefs, sections, template, type FieldDef, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState } from '../../../../shared/protocol'
import { FieldRowContext, ProgressStrip, useWash } from '@/components/FillPane'
import { PreviewPane } from '@/components/PreviewPane'
import { CitationChip, StatusChip } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { runFill, useAgent } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { DONE, displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { HistoryButton, NewMark } from './FieldHistory'
import { clearNew, useTrail } from './trail'

// FillPane, adapted for Trail: every row carries a history button under its
// status and a "New" mark next to its label when it changed while you weren't
// looking. Off-screen new values show a pill that jumps to them.

export interface TrailFillPaneProps {
  belowProgress?: ReactNode
  stripStatus?: ReactNode | null
  className?: string
}

export function TrailFillPane({ belowProgress, stripStatus, className }: TrailFillPaneProps) {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const { busy } = useAgent()
  const scrollRef = useRef<HTMLDivElement>(null)

  return (
    <section className={cn('flex h-full min-h-0 flex-col bg-panel', className)} aria-label="Template">
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
          <Button size="sm" className="h-8 gap-1.5" onClick={() => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))}>
            <Download className="size-3.5" /> Export .docx
          </Button>
        </div>
      </header>

      <ProgressStrip status={stripStatus} />
      {belowProgress}

      <div className="relative min-h-0 flex-1">
        {view === 'fields' ? (
          <>
            <ScrollArea className="h-full" ref={scrollRef}>
              <div className="@container mx-auto flex max-w-[880px] flex-col gap-6 px-5 pt-5 pb-16 sm:px-6">
                {sections.map((section) => (
                  <SectionBlock key={section.id} section={section} />
                ))}
              </div>
            </ScrollArea>
            <NewPills scrollRef={scrollRef} />
          </>
        ) : (
          <PreviewPane />
        )}
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// New values: clear after a short look; point at the ones out of view.
// ---------------------------------------------------------------------------

const DWELL_MS = 6000

function NewPills({ scrollRef }: { scrollRef: React.RefObject<HTMLDivElement | null> }) {
  const newFields = useTrail((s) => s.newFields)
  const away = useTrail((s) => s.away)
  const [out, setOut] = useState<{ above: string[]; below: string[] }>({ above: [], below: [] })
  const ids = Object.keys(newFields)
  const key = ids.sort().join(',')

  // Which new rows sit above or below the visible part of the list.
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]')
    if (!viewport) return
    let raf = 0
    const measure = () => {
      raf = 0
      const box = viewport.getBoundingClientRect()
      const above: string[] = []
      const below: string[] = []
      for (const id of ids) {
        const el = document.getElementById(`field-${id}`)
        if (!el) continue
        const r = el.getBoundingClientRect()
        if (r.bottom < box.top + 24) above.push(id)
        else if (r.top > box.bottom - 24) below.push(id)
      }
      setOut((o) => (o.above.join() === above.join() && o.below.join() === below.join() ? o : { above, below }))
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    viewport.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    const ro = new ResizeObserver(onScroll)
    if (viewport.firstElementChild) ro.observe(viewport.firstElementChild)
    return () => {
      cancelAnimationFrame(raf)
      viewport.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      ro.disconnect()
    }
    // ids are captured through key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, scrollRef])

  // A new row counts as seen once you hover it, scroll past it, or it has
  // sat in view for a while as you work.
  const shownAt = useRef(new Map<string, number>())
  useEffect(() => {
    const viewport = scrollRef.current?.querySelector<HTMLElement>('[data-slot=scroll-area-viewport]')
    if (!viewport || away || !ids.length) return
    const timers = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const en of entries) {
          const id = (en.target as HTMLElement).id.replace(/^field-/, '')
          const markedAt = useTrail.getState().newFields[id]
          if (markedAt === undefined) continue
          if (en.isIntersecting) {
            shownAt.current.set(id, markedAt)
            if (!timers.has(id)) timers.set(id, window.setTimeout(() => clearNew(id), DWELL_MS))
          } else {
            window.clearTimeout(timers.get(id))
            timers.delete(id)
            // Seen and then scrolled out of view: you've passed it.
            if (shownAt.current.get(id) === markedAt) clearNew(id)
          }
        }
      },
      { root: viewport, threshold: 0.5, rootMargin: '-24px 0px -24px 0px' }
    )
    for (const id of ids) {
      const el = document.getElementById(`field-${id}`)
      if (el) io.observe(el)
    }
    return () => {
      io.disconnect()
      timers.forEach((t) => window.clearTimeout(t))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, away, scrollRef])

  const jump = (id: string) => {
    document.getElementById(`field-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  const pill = (dir: 'above' | 'below') => {
    const list = out[dir]
    const Icon = dir === 'above' ? ArrowUp : ArrowDown
    return (
      <AnimatePresence>
        {list.length > 0 && (
          <motion.button
            key={dir}
            type="button"
            initial={{ opacity: 0, y: dir === 'above' ? -6 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: dir === 'above' ? -6 : 6 }}
            transition={{ duration: 0.2 }}
            onClick={() => jump(dir === 'above' ? list.at(-1)! : list[0])}
            className={cn(
              'absolute left-1/2 z-10 flex h-7 -translate-x-1/2 items-center gap-1.5 rounded-full border border-rule bg-panel pr-3 pl-2.5 text-[12px] font-medium text-cobalt-ink shadow-[var(--shadow-page)] transition-colors hover:bg-cobalt-soft',
              dir === 'above' ? 'top-3' : 'bottom-4'
            )}
          >
            <Icon className="size-3.5" aria-hidden />
            {list.length} new {dir}
          </motion.button>
        )}
      </AnimatePresence>
    )
  }

  return (
    <>
      {pill('above')}
      {pill('below')}
    </>
  )
}

// ---------------------------------------------------------------------------
// Sections and rows
// ---------------------------------------------------------------------------

function SectionBlock({ section }: { section: SectionDef }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveSection = useApp((s) => s.approveSection)
  const ids = section.fields
  const statuses = [...ids.map((id) => fields[id]?.status ?? 'empty'), ...(section.hasRates ? [rates.status] : [])]
  const doneCount = statuses.filter((s) => DONE.includes(s)).length
  const approvable = statuses.some((s) => s === 'verified' || s === 'user_answered')
  const allApproved = statuses.every((s) => s === 'approved')

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 pb-2">
        <h2 className="eyebrow">{section.title}</h2>
        <span className="num text-[12px] text-ink-3">
          {doneCount}/{statuses.length}
        </span>
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
      <div className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-panel">
        {ids.map((id) => (
          <FieldRow key={id} def={fieldDefs[id]} field={fields[id]} />
        ))}
        {section.hasRates && <RatesRow />}
      </div>
    </div>
  )
}

const rowGrid = 'relative grid grid-cols-1 gap-x-5 gap-y-2 px-4 py-3.5 @lg:grid-cols-[168px_minmax(0,1fr)_auto] @lg:items-start'

/** Status chip with the history button under it (beside it on narrow rows). */
function RowAside({ fieldId, status }: { fieldId: string; status: FieldState['status'] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 @lg:flex-col @lg:items-end">
      <StatusChip status={status} />
      <HistoryButton fieldId={fieldId} status={status} />
    </div>
  )
}

const editable = new Set(['text', 'email', 'money', 'date'])

function FieldRow({ def, field }: { def: FieldDef; field: FieldState | undefined }) {
  const options = useContext(FieldRowContext)
  const wash = useWash(def.id)
  const status = field?.status ?? 'empty'
  const value = displayValue(field)
  const [editing, setEditing] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const editField = useApp((s) => s.editField)
  const canEdit = editable.has(def.kind) && status !== 'conflict'

  useEffect(() => {
    if (editing) inputRef.current?.select()
  }, [editing])

  const commit = (v: string) => {
    setEditing(false)
    if (v.trim() !== (value ?? '')) editField(def.id, v)
  }

  return (
    <div
      id={`field-${def.id}`}
      data-selected={options.selectedId === def.id || undefined}
      onClick={options.onSelect ? (e) => options.onSelect?.(def.id, e) : undefined}
      onPointerEnter={() => clearNew(def.id)}
      className={cn(rowGrid, 'data-[selected]:bg-cobalt-soft/40', wash && 'field-wash')}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 @lg:block">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-medium text-ink">
          <span>
            {def.label}
            {def.required && <span className="sr-only"> (required)</span>}
          </span>
          <NewMark fieldId={def.id} />
        </div>
        <code className="mt-0.5 block truncate font-mono text-[11px] text-ink-3" title="Tag in layout.docx">
          {def.tag}
        </code>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        {status === 'conflict' && field?.candidates ? (
          <div className="flex flex-col gap-1.5">
            {field.candidates.map((c) => (
              <div key={String(c.value)} className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] text-ink">{c.display}</span>
                {c.sources.map((s, i) => (
                  <CitationChip key={i} source={s} />
                ))}
              </div>
            ))}
            <p className="text-[12px] text-warn">
              {(typeof options.conflictNote === 'function' ? options.conflictNote(def.id) : options.conflictNote) ??
                'Two documents disagree. Answer in the chat to choose one.'}
            </p>
          </div>
        ) : editing ? (
          <Input
            ref={inputRef}
            id={`edit-${def.id}`}
            defaultValue={value ?? ''}
            type={def.kind === 'email' ? 'email' : 'text'}
            className="h-8 text-[14px]"
            aria-label={def.label}
            onBlur={(e) => commit(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit(e.currentTarget.value)
              if (e.key === 'Escape') setEditing(false)
            }}
          />
        ) : def.kind === 'narrative' ? (
          value ? (
            status === 'drafting' ? (
              <p className="caret text-[14px] leading-relaxed whitespace-pre-line text-ink">{value}</p>
            ) : (
              <div className="flex flex-col gap-2 text-[14px] leading-relaxed text-ink">
                {value.split('\n\n').map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>
            )
          ) : (
            <p className="text-[13px] text-ink-3">{field?.note ?? 'Not written yet'}</p>
          )
        ) : (
          <div className="group/value flex min-w-0 items-start gap-2">
            {def.kind === 'boolean' && value ? (
              <span className="flex items-center gap-2 text-[14px] text-ink">
                <span className="font-serif text-[16px] leading-none" aria-hidden>
                  {field?.value ? '☒' : '☐'}
                </span>
                {value}
              </span>
            ) : value ? (
              <span className="min-w-0 text-[14px] break-words text-ink">{value}</span>
            ) : (
              <span className="text-[14px] text-ink-3 italic">{status === 'missing' ? 'Not found in any document' : 'Waiting'}</span>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="no-drag mt-0.5 rounded p-0.5 text-ink-3 opacity-0 transition-opacity group-hover/value:opacity-100 hover:text-ink focus-visible:opacity-100"
                aria-label={`Edit ${def.label}`}
              >
                <Pencil className="size-3.5" />
              </button>
            )}
          </div>
        )}

        {status !== 'conflict' && field && field.sources.length > 0 && (
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {(def.kind === 'narrative' ? dedupeDocs(field.sources) : field.sources).map((s, i) => (
              <CitationChip key={i} source={s} />
            ))}
          </div>
        )}
        {field?.note && status !== 'empty' && <p className="text-[12px] text-ink-3">{field.note}</p>}
        {options.renderExtra?.(def.id, field)}
      </div>

      <RowAside fieldId={def.id} status={status} />
    </div>
  )
}

function dedupeDocs(sources: FieldState['sources']) {
  const seen = new Set<string>()
  return sources.filter((s) => {
    const k = `${s.docId}:${s.page ?? s.locator}`
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function RatesRow() {
  const rates = useApp((s) => s.rates)
  const wash = useWash('hourlyRates')
  return (
    <div id="field-hourlyRates" onPointerEnter={() => clearNew('hourlyRates')} className={cn(rowGrid, wash && 'field-wash')}>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[13px] font-medium text-ink">
          <span>Hourly rates</span>
          <NewMark fieldId="hourlyRates" />
        </div>
        <code className="mt-0.5 block truncate font-mono text-[11px] text-ink-3" title="Table-row loop in layout.docx">
          {'{#hourlyRates}…{/}'}
        </code>
      </div>
      <div className="min-w-0 overflow-x-auto">
        {rates.rows.length ? (
          <table className="w-full max-w-[460px] text-[13px]">
            <thead>
              <tr className="text-left text-[11px] text-ink-3">
                <th className="pb-1.5 font-medium">Role</th>
                <th className="pb-1.5 text-right font-medium">Rate / hr</th>
                <th className="pb-1.5 pl-4 text-right font-medium">Cell</th>
              </tr>
            </thead>
            <tbody>
              {rates.rows.map((r) => (
                <tr key={r.key} className="border-t border-rule">
                  <td className="py-1.5 text-ink">{r.role}</td>
                  <td className="num py-1.5 text-right font-mono text-ink">${r.rate}</td>
                  <td className="py-1.5 pl-4 text-right">
                    {r.source && (
                      <button
                        type="button"
                        className="font-mono text-[11px] text-cobalt-ink hover:underline"
                        onClick={() => useApp.getState().openSource({ docId: r.source!.docId, locator: r.source!.locator, quote: r.source!.quote })}
                      >
                        {r.source.locator}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <span className="text-[14px] text-ink-3 italic">Waiting</span>
        )}
      </div>
      <RowAside fieldId="hourlyRates" status={rates.status} />
    </div>
  )
}
