import { useChat } from '@ai-sdk/react'
import { Check, Download, FileText, ListChecks, Pencil, RotateCcw } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fieldDefs, sections, template, type FieldDef, type SectionDef } from '../../../agent-core/demo-data'
import type { FieldState } from '../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { chat, runFill } from '@/lib/chat'
import { DONE, displayValue, summarize, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { PreviewPane } from './PreviewPane'
import { CitationChip, StatusChip, statusMeta } from './status'

export function FillPane() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const { status } = useChat({ chat })
  const busy = status === 'submitted' || status === 'streaming'

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
            onClick={() => toast('Export isn’t connected in this preview', { description: 'The full build renders layout.docx with docxtemplater and saves the file.' })}
          >
            <Download className="size-3.5" /> Export .docx
          </Button>
        </div>
      </header>

      <ProgressStrip />

      <div className="min-h-0 flex-1">
        {view === 'fields' ? (
          <ScrollArea className="h-full">
            <div className="@container mx-auto flex max-w-[880px] flex-col gap-6 px-5 pt-5 pb-16 sm:px-6">
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

function ProgressStrip() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const activity = useApp((s) => s.activity)
  const { counts, total, done } = summarize(fields, rates)
  const order = ['approved', 'verified', 'user_answered', 'drafting', 'conflict', 'missing', 'empty'] as const
  const attention = counts.conflict + counts.missing

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule bg-panel-2/60 px-5 py-2.5 sm:px-6">
      <div className="flex items-baseline gap-1.5">
        <span className="num text-[15px] font-semibold">{done}</span>
        <span className="num text-[13px] text-ink-3">of {total} filled</span>
      </div>
      <div
        className="flex h-1.5 min-w-[120px] flex-1 overflow-hidden rounded-full bg-rule"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label="Fields filled"
      >
        {order.map((st) =>
          counts[st] && st !== 'empty' ? (
            <span key={st} className={cn('h-full transition-[width] duration-500', statusMeta[st].bar)} style={{ width: `${(counts[st] / total) * 100}%` }} />
          ) : null
        )}
      </div>
      <div className="flex min-h-6 items-center gap-3 text-[12px] text-ink-2">
        {activity ? (
          <Shimmer className="text-[12px] font-medium" duration={1.6}>{`${activity}…`}</Shimmer>
        ) : attention ? (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            {attention} need{attention === 1 ? 's' : ''} you
          </span>
        ) : done === total ? (
          <span className="flex items-center gap-1.5 text-ok">
            <Check className="size-3.5" /> Ready to export
          </span>
        ) : null}
      </div>
    </div>
  )
}

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

function useWash(key: string) {
  const stamp = useApp((s) => s.flash[key])
  const [wash, setWash] = useState(false)
  useEffect(() => {
    if (!stamp || Date.now() - stamp > 1400) return
    setWash(true)
    const t = setTimeout(() => setWash(false), 1400)
    return () => clearTimeout(t)
  }, [stamp])
  return wash
}

const editable = new Set(['text', 'email', 'money', 'date'])

function FieldRow({ def, field }: { def: FieldDef; field: FieldState | undefined }) {
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
      className={cn(
        'grid grid-cols-1 gap-x-5 gap-y-2 px-4 py-3.5 @lg:grid-cols-[168px_minmax(0,1fr)_auto] @lg:items-start',
        wash && 'field-wash'
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
            <p className="text-[12px] text-warn">Two documents disagree. Answer in the chat to choose one.</p>
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

function RatesRow() {
  const rates = useApp((s) => s.rates)
  const wash = useWash('hourlyRates')
  return (
    <div className={cn('grid grid-cols-1 gap-x-5 gap-y-2 px-4 py-3.5 @lg:grid-cols-[168px_minmax(0,1fr)_auto] @lg:items-start', wash && 'field-wash')}>
      <div className="min-w-0">
        <div className="text-[13px] font-medium text-ink">Hourly rates</div>
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
                        className="font-mono text-[11px] text-cobalt hover:underline"
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
      <div className="flex @lg:justify-end">
        <StatusChip status={rates.status} />
      </div>
    </div>
  )
}
