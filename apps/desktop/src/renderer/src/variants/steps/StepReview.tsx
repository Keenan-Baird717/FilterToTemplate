import { BadgeCheck, Check, Download, FileText, ListChecks, MessagesSquare, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fieldDefs, sections, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldState } from '../../../../shared/protocol'
import { DocxView } from '@/components/DocxView'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSummary } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { sectionStats, SourceChip, StatusPill, useJustChanged } from './parts'

const editable = new Set(['text', 'email', 'money', 'date', 'narrative'])

export function StepReview({ selected, onSelect, onAsk }: { selected: string | null; onSelect: (id: string | null) => void; onAsk: () => void }) {
  const { counts, total, done } = useSummary()
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const [view, setView] = useState<'checklist' | 'letter'>('checklist')
  const letterRef = useRef<HTMLDivElement>(null)
  const approvedSections = sections.filter((s) => sectionStats(s, fields, rates).allApproved).length
  const left = counts.conflict + counts.missing + counts.empty + counts.drafting

  // Picking a row scrolls the letter to that value.
  const pick = (id: string) => {
    onSelect(id === selected ? null : id)
    if (id === selected) return
    requestAnimationFrame(() => letterRef.current?.querySelector(`[data-field="${CSS.escape(id)}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
  }

  // Clicking a value in the letter finds its row in the checklist.
  const fromLetter = (id: string) => {
    onSelect(id)
    setView('checklist')
    requestAnimationFrame(() => document.getElementById(`field-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }))
  }

  const doExport = () => exportDocx().catch((e) => toast.error('The letter couldn’t be exported', { description: String(e) }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-rule px-4 pt-6 pb-5 sm:px-8 sm:pt-8">
        <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-ink-3">Step 4 of 4</p>
            <h1 tabIndex={-1} className="steps-display mt-1.5 text-[28px] leading-[1.15] text-ink focus:outline-none sm:text-[34px]">
              Review and export
            </h1>
            <p className="mt-2 text-[15.5px] text-ink-2 tabular-nums">
              {done} of {total} filled · {approvedSections} of {sections.length} sections approved
              {left > 0 && <span className="text-warn"> · {left} still open</span>}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" className="h-11 gap-2 rounded-full bg-panel px-5 text-[15px]" onClick={onAsk}>
              <MessagesSquare className="size-4" /> Ask the agent
            </Button>
            <Button className="h-11 gap-2 rounded-full px-6 text-[15px] font-semibold" onClick={doExport}>
              <Download className="size-4" /> Export .docx
            </Button>
          </div>
        </div>
        <div className="mt-5 inline-flex rounded-full bg-panel-2 p-1 lg:hidden" role="group" aria-label="Show">
          {(
            [
              ['checklist', 'Checklist', ListChecks],
              ['letter', 'Letter', FileText]
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              aria-pressed={view === id}
              onClick={() => setView(id)}
              className={cn('flex h-9 items-center gap-2 rounded-full px-4 text-[14px] font-medium transition-colors', view === id ? 'bg-panel text-ink shadow-[0_0_0_1px_var(--rule)]' : 'text-ink-2 hover:text-ink')}
            >
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_minmax(380px,460px)]">
        <div ref={letterRef} className={cn('min-h-0 bg-panel-2', view === 'letter' ? 'block' : 'hidden', 'lg:block')}>
          <DocxView className="h-full" selectedField={selected} onValueClick={fromLetter} aria-label="Letter preview" />
        </div>
        <aside className={cn('min-h-0 overflow-y-auto border-rule lg:border-l', view === 'checklist' ? 'block' : 'hidden', 'lg:block')} aria-label="Review checklist">
          <div className="px-4 pt-5 pb-10 sm:px-6">
            <p className="text-[14px] text-ink-3">Tick each value you’ve checked, or approve a whole section. Pick a value to find it in the letter.</p>
            {sections.map((s) => (
              <ReviewSection key={s.id} section={s} selected={selected} onPick={pick} />
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}

function ReviewSection({ section, selected, onPick }: { section: SectionDef; selected: string | null; onPick: (id: string) => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveSection = useApp((s) => s.approveSection)
  const st = sectionStats(section, fields, rates)

  return (
    <section className="mt-6 border-t border-rule pt-5 first-of-type:mt-5" aria-labelledby={`rv-${section.id}`}>
      <div className="flex items-center gap-3">
        <h2 id={`rv-${section.id}`} className="text-[17px] font-semibold text-ink">
          {section.title}
        </h2>
        <span className="text-[13.5px] text-ink-3 tabular-nums">
          {st.found} of {st.total}
        </span>
        <span className="ml-auto">
          {st.allApproved ? (
            <span className="flex items-center gap-1.5 text-[14px] font-medium text-ok">
              <BadgeCheck className="size-4" /> Approved
            </span>
          ) : !st.approvable && st.approved > 0 ? (
            <span className="text-[13.5px] text-ink-3 tabular-nums">
              {st.approved} of {st.total} approved
            </span>
          ) : (
            <Button
              variant="outline"
              className="h-9 gap-1.5 rounded-full bg-panel px-4 text-[14px] font-semibold"
              disabled={!st.approvable}
              onClick={() => {
                approveSection(section.id)
                toast.success(`${section.title} approved`)
              }}
            >
              <Check className="size-4" /> Approve section
            </Button>
          )}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-1">
        {section.fields.map((id) => (
          <ReviewRow key={id} fieldId={id} field={fields[id]} selected={selected === id} onPick={onPick} />
        ))}
        {section.hasRates && <RatesReviewRow selected={selected === 'hourlyRates'} onPick={onPick} />}
      </ul>
    </section>
  )
}

function ReviewRow({ fieldId, field, selected, onPick }: { fieldId: string; field: FieldState | undefined; selected: boolean; onPick: (id: string) => void }) {
  const def = fieldDefs[fieldId]
  const wash = useJustChanged(fieldId)
  const approveField = useApp((s) => s.approveField)
  const editField = useApp((s) => s.editField)
  const [editing, setEditing] = useState(false)
  const status = field?.status ?? 'empty'
  const value = displayValue(field)
  const canEdit = editable.has(def.kind) && status !== 'drafting'
  const approvable = status === 'verified' || status === 'user_answered'

  return (
    <li id={`field-${fieldId}`} className={cn('-mx-3 rounded-xl px-3 py-2.5 transition-colors', selected ? 'bg-cobalt-soft/70' : 'hover:bg-panel-2/70', wash && 'field-wash')}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => onPick(fieldId)} aria-pressed={selected} className="min-w-0 flex-1 rounded-md text-left">
          <span className="flex items-center gap-2 text-[13px] text-ink-3">
            {def.label}
            {status === 'user_answered' && <span className="rounded-full bg-cobalt-soft px-2 text-[11.5px] leading-[18px] font-medium text-ink">From you</span>}
          </span>
          {status === 'conflict' ? (
            <span className="block text-[15px] text-warn">Two values found. Pick one below.</span>
          ) : value ? (
            <span className={cn('block text-[15px] leading-snug [overflow-wrap:anywhere] text-ink', def.kind === 'narrative' && !selected && 'line-clamp-3')}>
              {def.kind === 'narrative' ? value.replace(/\n\n/g, ' ') : value}
            </span>
          ) : (
            <span className="block text-[15px] text-ink-3">{status === 'missing' ? 'Not filled yet' : 'Waiting'}</span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {canEdit && !editing && (
            <Button variant="ghost" size="icon" className="size-8 rounded-full text-ink-3 hover:text-ink" aria-label={`Edit ${def.label}`} onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
            </Button>
          )}
          {approvable || status === 'approved' ? (
            <ApproveToggle label={def.label} approved={status === 'approved'} onApprove={() => approveField(fieldId)} />
          ) : (
            <StatusPill status={status} />
          )}
        </div>
      </div>

      {status === 'conflict' && field?.candidates && (
        <div className="mt-2 flex flex-wrap gap-2">
          {field.candidates.map((c) => (
            <Button key={String(c.value)} variant="outline" className="h-9 rounded-full bg-panel px-4 text-[14px]" onClick={() => editField(fieldId, c.display)}>
              Use {c.display}
            </Button>
          ))}
        </div>
      )}
      {status === 'missing' && !editing && (
        <Button variant="link" className="mt-1 h-auto p-0 text-[14px] font-semibold text-ink underline underline-offset-4" onClick={() => setEditing(true)}>
          Add it now
        </Button>
      )}

      {editing && <EditBox label={def.label} narrative={def.kind === 'narrative'} type={def.kind === 'email' ? 'email' : 'text'} initial={value ?? ''} onCancel={() => setEditing(false)} onSave={(v) => {
            setEditing(false)
            editField(fieldId, v)
          }} />}

      {selected && !editing && (
        <div className="mt-2.5 flex flex-col gap-2">
          {field?.sources.length ? (
            <div className="flex flex-wrap gap-1.5">
              {field.sources.map((s, k) => (
                <SourceChip key={k} source={s} />
              ))}
            </div>
          ) : null}
          {field?.note && <p className="text-[13px] text-ink-3">{field.note}</p>}
        </div>
      )}
    </li>
  )
}

function EditBox({ label, initial, narrative, type, onSave, onCancel }: { label: string; initial: string; narrative: boolean; type: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onCancel()
    }
    if (e.key === 'Enter' && (!narrative || e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSave(v)
    }
  }
  return (
    <div className="mt-2.5 flex flex-col gap-2">
      {narrative ? (
        <Textarea ref={ref} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys} aria-label={label} className="min-h-40 rounded-lg bg-panel text-[15px] leading-relaxed" />
      ) : (
        <Input ref={ref} type={type} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={keys} aria-label={label} className="h-10 rounded-lg bg-panel text-[15px]" />
      )}
      <div className="flex items-center gap-2">
        <Button className="h-9 rounded-full px-4 text-[14px] font-semibold" onClick={() => onSave(v)}>
          Save
        </Button>
        <Button variant="ghost" className="h-9 rounded-full px-4 text-[14px] text-ink-2" onClick={onCancel}>
          Cancel
        </Button>
        <span className="ml-auto text-[12.5px] text-ink-3">The agent won’t overwrite your edit.</span>
      </div>
    </div>
  )
}

function RatesReviewRow({ selected, onPick }: { selected: boolean; onPick: (id: string) => void }) {
  const rates = useApp((s) => s.rates)
  const approveField = useApp((s) => s.approveField)
  const wash = useJustChanged('hourlyRates')
  const approvable = rates.status === 'verified'
  return (
    <li id="field-hourlyRates" className={cn('-mx-3 rounded-xl px-3 py-2.5 transition-colors', selected ? 'bg-cobalt-soft/70' : 'hover:bg-panel-2/70', wash && 'field-wash')}>
      <div className="flex items-start gap-3">
        <button type="button" onClick={() => onPick('hourlyRates')} aria-pressed={selected} className="min-w-0 flex-1 rounded-md text-left">
          <span className="block text-[13px] text-ink-3">Hourly rates</span>
          {rates.rows.length ? (
            <span className="block text-[15px] leading-snug text-ink">{rates.rows.map((r) => `${r.role} $${r.rate}`).join(' · ')}</span>
          ) : (
            <span className="block text-[15px] text-ink-3">Waiting</span>
          )}
        </button>
        <div className="flex shrink-0 items-center gap-1 pt-0.5">
          {approvable || rates.status === 'approved' ? (
            <ApproveToggle label="Hourly rates" approved={rates.status === 'approved'} onApprove={() => approveField('hourlyRates')} />
          ) : (
            <StatusPill status={rates.status} />
          )}
        </div>
      </div>
      {selected && rates.rows[0]?.source && (
        <div className="mt-2.5">
          <SourceChip source={{ ...rates.rows[0].source, locator: 'Rates!B2:C5', quote: '' }} />
        </div>
      )}
    </li>
  )
}

/** A checklist tick: empty circle to approve, filled once approved. */
function ApproveToggle({ label, approved, onApprove }: { label: string; approved: boolean; onApprove: () => void }) {
  if (approved)
    return (
      <span className="flex size-8 items-center justify-center rounded-full bg-ok text-panel" role="img" aria-label={`${label} approved`}>
        <Check className="size-4" strokeWidth={3} />
      </span>
    )
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onApprove}
          aria-label={`Approve ${label}`}
          className="flex size-8 items-center justify-center rounded-full border-2 border-ink-3/35 text-transparent transition-colors hover:border-ok hover:bg-ok-soft hover:text-ok focus-visible:text-ok"
        >
          <Check className="size-4" strokeWidth={3} />
        </button>
      </TooltipTrigger>
      <TooltipContent side="left">Approve</TooltipContent>
    </Tooltip>
  )
}
