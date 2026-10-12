import { useChat } from '@ai-sdk/react'
import { Check, Download, FileText, ListChecks, Pencil, RotateCcw, Undo2 } from 'lucide-react'
import { motion } from 'motion/react'
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { fieldDefs, sections, template, type FieldDef, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState } from '../../../../shared/protocol'
import { EvidencePage } from '@/components/EvidencePage'
import { FieldRowContext, ProgressStrip, useWash } from '@/components/FillPane'
import { PreviewPane } from '@/components/PreviewPane'
import { CitationChip, StatusChip, locatorText } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { chat, runFill } from '@/lib/chat'
import { exportDocx } from '@/lib/docx'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { clickGuard } from './NeedsYouTray'
import { buildModel, canEditInPlace, evidenceOf, RATES, review, sectionOf, useReview, type ReviewModel } from './review'

// A fork of the shared FillPane: same header, strip and rows, plus what the
// review stage needs. The row under review opens in place with its evidence,
// the rest of the list dims, and approved values that changed say so.

export type Stage = 'questions' | 'working' | 'review' | 'ready'

export const ReviewContext = createContext<{ stage: Stage; model: ReviewModel }>({
  stage: 'questions',
  model: buildModel({}, { rows: [], status: 'empty' }, [], [])
})

const ease = [0.22, 1, 0.36, 1] as const

export function exportLetter() {
  exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))
}

export function ReviewFillPane({ belowProgress, stripStatus }: { belowProgress?: ReactNode; stripStatus?: ReactNode | null }) {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const { status } = useChat({ chat })
  const busy = status === 'submitted' || status === 'streaming'
  const active = useReview((s) => s.active)

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Template">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-5 pt-4 pb-3 sm:px-6">
        <div className="flex min-w-56 flex-1 items-baseline gap-2.5">
          <h1 className="truncate text-[19px] leading-tight font-semibold tracking-[-0.01em]">{template.name}</h1>
          <span className="font-mono text-[12px] text-ink-3">v{template.version}</span>
        </div>
        <Tabs
          value={view}
          onValueChange={(v) => {
            // The review row lives in the field list; looking at the letter pauses it.
            if (v === 'preview') review.leave()
            setView(v as typeof view)
          }}
        >
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
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={runFill} disabled={busy} aria-label="Run again">
                <RotateCcw className="size-3.5" /> <span className="hidden sm:inline">Run again</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear the fields and watch the agent fill them</TooltipContent>
          </Tooltip>
          {/* The tray carries the main export once everything is approved; this one is always here for drafts. */}
          <Button variant="outline" size="sm" className="h-8 gap-1.5" onClick={exportLetter}>
            <Download className="size-3.5" />
            <span>
              Export<span className="hidden sm:inline">&nbsp;.docx</span>
            </span>
          </Button>
        </div>
      </header>

      <ProgressStrip status={stripStatus} />
      {belowProgress}

      <div className="min-h-0 flex-1">
        {view === 'fields' ? (
          <ScrollArea className="h-full">
            <div data-reviewing={active || undefined} className="@container mx-auto flex max-w-[880px] flex-col gap-6 px-5 pt-5 pb-24 sm:px-6">
              {sections.map((section) => (
                <SectionBlock key={section.id} section={section} />
              ))}
            </div>
          </ScrollArea>
        ) : (
          <PreviewPane />
        )}
      </div>
    </section>
  )
}

function SectionBlock({ section }: { section: SectionDef }) {
  const { stage, model } = useContext(ReviewContext)
  const fields = useApp((s) => s.fields)
  const active = useReview((s) => s.active)
  const here = useReview((s) => (s.active && s.cursor ? sectionOf(s.cursor)?.id === section.id : false))
  const items = model.bySection.find((b) => b.section.id === section.id)?.items ?? []
  const filled = items.filter((i) => i.reviewable).length
  const approved = items.filter((i) => i.approved).length
  const open = items.filter((i) => i.inQueue && !i.approved)
  const allApproved = items.length > 0 && approved === items.length

  return (
    <div className="flex flex-col">
      <div className={cn('flex min-h-7 items-center gap-3 pb-2 transition-opacity duration-200', active && !here && 'opacity-50')}>
        <h2 className="eyebrow">{section.title}</h2>
        <span className="num text-[12px] text-ink-3">
          {filled < items.length ? `${filled}/${items.length}` : `${approved}/${items.length} approved`}
        </span>
        <div className="h-px flex-1 bg-rule" />
        {allApproved ? (
          <span className="flex items-center gap-1 text-[12px] font-medium text-ok">
            <Check className="size-3.5" /> Approved
          </span>
        ) : stage === 'review' && !active && open.length > 0 ? (
          <Button variant="ghost" size="sm" className="h-7 px-2 text-[12px] text-ink-2" onClick={() => review.start(open[0].id)}>
            Review section
          </Button>
        ) : null}
      </div>
      <div className="flex flex-col divide-y divide-rule rounded-lg border border-rule bg-panel">
        {section.fields.map((id) => (
          <FieldRow key={id} def={fieldDefs[id]} field={fields[id]} />
        ))}
        {section.hasRates && <RatesRow />}
      </div>
    </div>
  )
}

/** Shared row state for review: is it current, clickable, dimmed. */
function useRowReview(id: string, status: FieldState['status']) {
  const { stage } = useContext(ReviewContext)
  const active = useReview((s) => s.active)
  const current = useReview((s) => s.active && s.cursor === id)
  const nonce = useReview((s) => (s.active && s.cursor === id ? s.moveNonce : -1))
  const touched = useReview((s) => s.touched.includes(id))
  const dropped = useReview((s) => s.dropped[id])
  const ref = useRef<HTMLDivElement>(null)
  const open = status === 'verified' || status === 'user_answered'
  const clickable = stage === 'review' && !current && (open || (active && status === 'approved' && touched))

  // Bring the row under review to a steady spot just below the tray.
  useEffect(() => {
    if (nonce < 0) return
    const row = ref.current
    if (!row) return
    const raf = requestAnimationFrame(() => {
      const viewport = row.closest<HTMLElement>('[data-slot="scroll-area-viewport"]')
      if (!viewport) return row.scrollIntoView({ block: 'start', behavior: 'smooth' })
      // A little of the row above stays in view for context; phones keep the room for the row itself.
      const gap = window.innerWidth < 640 ? 10 : 44
      const top = row.getBoundingClientRect().top - viewport.getBoundingClientRect().top + viewport.scrollTop - gap
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      viewport.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' })
    })
    return () => cancelAnimationFrame(raf)
  }, [nonce])

  const onRowClick = (onSelect?: () => void) => {
    if (clickGuard.onControl || window.getSelection()?.toString()) return
    onSelect?.()
    if (clickable) review.start(id)
  }

  return {
    ref,
    current,
    dropped,
    clickable,
    onRowClick,
    rowClass: cn(
      'relative transition-[opacity,background-color,box-shadow] duration-200 first:rounded-t-[7px] last:rounded-b-[7px]',
      active && !current && 'opacity-50 hover:opacity-80',
      current && 'z-[1] bg-cobalt-soft/20 shadow-[inset_0_0_0_1px_var(--cobalt)]',
      clickable && 'cursor-pointer hover:bg-panel-2/70'
    )
  }
}

export function FieldRow({ def, field }: { def: FieldDef; field: FieldState | undefined }) {
  const options = useContext(FieldRowContext)
  const wash = useWash(def.id)
  const status = field?.status ?? 'empty'
  const value = displayValue(field)
  const editing = useReview((s) => s.editing === def.id)
  const editField = useApp((s) => s.editField)
  const canEdit = canEditInPlace(def.id) && status !== 'conflict' && status !== 'drafting'
  const { ref, current, dropped, onRowClick, rowClass } = useRowReview(def.id, status)

  return (
    <div
      ref={ref}
      id={`field-${def.id}`}
      data-row
      data-current={current || undefined}
      data-selected={options.selectedId === def.id || undefined}
      aria-current={current ? 'step' : undefined}
      onClick={(e) => onRowClick(() => options.onSelect?.(def.id, e))}
      className={cn(
        'grid grid-cols-1 gap-x-5 gap-y-2 px-4 py-3.5 @lg:grid-cols-[168px_minmax(0,1fr)_auto] @lg:items-start data-[selected]:bg-cobalt-soft/40',
        rowClass,
        wash && !current && (status === 'approved' ? 'rv-approve-wash' : 'field-wash')
      )}
    >
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-2 @lg:block">
        <div className="text-[13px] font-medium text-ink">
          {def.label}
          {def.required && <span className="sr-only"> (required)</span>}
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
              {(typeof options.conflictNote === 'function' ? options.conflictNote(def.id) : options.conflictNote) ?? 'Two documents disagree.'}
            </p>
          </div>
        ) : editing ? (
          <InlineEdit def={def} value={value} onSave={(v) => editField(def.id, v)} />
        ) : def.kind === 'narrative' ? (
          <div className="group/value flex min-w-0 items-start gap-2">
            {value ? (
              status === 'drafting' ? (
                <p className="caret min-w-0 text-[14px] leading-relaxed whitespace-pre-line text-ink">{value}</p>
              ) : (
                <div className="flex min-w-0 flex-col gap-2 text-[14px] leading-relaxed text-ink">
                  {value.split('\n\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>
              )
            ) : (
              <p className="text-[13px] text-ink-3">{field?.note ?? 'Not written yet'}</p>
            )}
            {canEdit && value && <EditButton label={def.label} id={def.id} />}
          </div>
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
            {canEdit && <EditButton label={def.label} id={def.id} />}
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
        {dropped && <DroppedLine was={dropped.was} by={dropped.by} />}
        {options.renderExtra?.(def.id, field)}
        {current && <Evidence id={def.id} />}
      </div>

      <div className="flex @lg:justify-end">
        <StatusChip status={status} />
      </div>
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

function EditButton({ id, label }: { id: string; label: string }) {
  return (
    <button
      type="button"
      onClick={() => review.edit(id)}
      className="no-drag mt-0.5 shrink-0 rounded p-0.5 text-ink-3 opacity-0 transition-opacity group-hover/value:opacity-100 hover:text-ink focus-visible:opacity-100 [[data-current]_&]:opacity-100"
      aria-label={`Edit ${label}`}
    >
      <Pencil className="size-3.5" />
    </button>
  )
}

/** Retype a value in place. Enter (or ⌘/Ctrl+Enter for paragraphs) saves, Escape cancels. */
function InlineEdit({ def, value, onSave }: { def: FieldDef; value: string | null; onSave: (v: string) => void }) {
  const cancelled = useRef(false)
  const done = (v: string | null) => {
    review.setEditing(null)
    if (v !== null && v.trim() !== (value ?? '').trim()) onSave(v)
    // Keep the review keys in reach.
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-review-primary]')?.focus({ preventScroll: true }))
  }
  const onBlur = (v: string) => {
    if (cancelled.current) return
    done(v)
  }
  const cancel = () => {
    cancelled.current = true
    done(null)
  }

  if (def.kind === 'narrative') {
    return (
      <div className="flex flex-col gap-2">
        <Textarea
          autoFocus
          id={`edit-${def.id}`}
          aria-label={def.label}
          defaultValue={value ?? ''}
          className="min-h-40 bg-panel text-[14px] leading-relaxed"
          onBlur={(e) => onBlur(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
        />
        <p className="text-[11px] text-ink-3">Click away or press Ctrl+Enter to save. Escape cancels.</p>
      </div>
    )
  }
  return (
    <Input
      autoFocus
      id={`edit-${def.id}`}
      defaultValue={value ?? ''}
      type={def.kind === 'email' ? 'email' : 'text'}
      className="h-8 bg-panel text-[14px]"
      aria-label={def.label}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => onBlur(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          e.currentTarget.blur()
        }
        if (e.key === 'Escape') {
          e.preventDefault()
          cancel()
        }
      }}
    />
  )
}

function DroppedLine({ was, by }: { was: string | null; by: 'you' | 'agent' }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] text-warn">
      <Undo2 className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>
        {by === 'you' ? 'You changed this after approving it.' : 'The agent changed this after you approved it.'}
        {was && <span className="text-ink-3"> Was “{was.length > 60 ? `${was.slice(0, 60)}…` : was}”.</span>}
      </span>
    </p>
  )
}

/** The value's evidence, opened in place under the row being reviewed. */
function Evidence({ id }: { id: string }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const docs = useApp((s) => s.docs)
  const openSource = useApp((s) => s.openSource)
  const index = useReview((s) => s.sourceIndex)
  const sources = evidenceOf(id, fields, rates)
  const src = sources[Math.min(index, sources.length - 1)]
  const doc = src && docs.find((d) => d.id === src.docId)
  const byYou = id !== RATES && fields[id]?.by === 'user'

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: 'auto', opacity: 1 }}
      transition={{ duration: 0.24, ease }}
      className="-mx-1 overflow-clip px-1"
      onClick={(e) => e.stopPropagation()}
    >
      {src ? (
        <div className="mt-1 rounded-lg border border-rule bg-ground/70 p-2.5 sm:p-3">
          <div className="mb-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 px-0.5">
            <span className="eyebrow text-[10px]">Evidence</span>
            {sources.length > 1 ? (
              <div role="group" aria-label={`${sources.length} sources for this value`} className="flex flex-wrap gap-1">
                {sources.map((s, i) => (
                  <button
                    key={`${s.docId}-${i}`}
                    type="button"
                    aria-pressed={i === index}
                    onClick={() => review.setSourceIndex(i)}
                    className={cn(
                      'h-5 rounded px-1.5 font-mono text-[11px] transition-colors',
                      i === index ? 'bg-cobalt-soft font-medium text-cobalt-ink' : 'text-ink-3 hover:bg-panel hover:text-ink'
                    )}
                  >
                    {s.docId} {locatorText(s)}
                  </button>
                ))}
              </div>
            ) : (
              <span className="min-w-0 truncate text-[12px] text-ink-3">
                <span className="font-mono text-[11px] text-cobalt-ink">{src.docId}</span> {doc?.name}
              </span>
            )}
            <button
              type="button"
              onClick={() => openSource({ docId: src.docId, page: src.page, quote: src.quote, locator: src.locator })}
              className="ml-auto shrink-0 rounded-sm text-[12px] font-medium text-cobalt-ink underline-offset-2 hover:underline"
            >
              {sources.length > 1 ? 'Open in viewer' : 'Open full source'}
            </button>
          </div>
          <EvidencePage
            compact
            docId={src.docId}
            page={src.page}
            quote={src.quote}
            locator={src.locator}
            className="rv-paper max-h-[300px] overflow-y-auto rounded-[3px]"
          />
        </div>
      ) : (
        <p className="mt-1 rounded-lg border border-dashed border-rule px-3 py-2.5 text-[12px] text-ink-3">
          {byYou ? 'This value came from you, so no document backs it. Check it reads right.' : 'No document backs this value yet.'}
        </p>
      )}
    </motion.div>
  )
}

export function RatesRow() {
  const rates = useApp((s) => s.rates)
  const wash = useWash(RATES)
  const { ref, current, dropped, onRowClick, rowClass } = useRowReview(RATES, rates.status)
  return (
    <div
      ref={ref}
      id={`field-${RATES}`}
      data-row
      data-current={current || undefined}
      aria-current={current ? 'step' : undefined}
      onClick={() => onRowClick()}
      className={cn('grid grid-cols-1 gap-x-5 gap-y-2 px-4 py-3.5 @lg:grid-cols-[168px_minmax(0,1fr)_auto] @lg:items-start', rowClass, wash && !current && (rates.status === 'approved' ? 'rv-approve-wash' : 'field-wash'))}
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">Hourly rates</div>
        <code className="mt-0.5 block truncate font-mono text-[11px] text-ink-3" title="Table-row loop in layout.docx">
          {'{#hourlyRates}…{/}'}
        </code>
      </div>
      <div className="flex min-w-0 flex-col gap-2">
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
        {dropped && <DroppedLine was={dropped.was} by={dropped.by} />}
        {current && <Evidence id={RATES} />}
      </div>
      <div className="flex @lg:justify-end">
        <StatusChip status={rates.status} />
      </div>
    </div>
  )
}
