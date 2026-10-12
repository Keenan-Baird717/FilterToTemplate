import { BadgeCheck, Check, CheckCheck, Download } from 'lucide-react'
import { toast } from 'sonner'
import { fieldDefs, sections, type SectionDef } from '../../../../agent-core/demo-data'
import type { FieldStatus } from '../../../../shared/protocol'
import { useWash } from '@/components/FillPane'
import { StatusChip } from '@/components/status'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSummary } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ViewHeader, plural } from './bits'
import { answerField, liveItems, useNewestQuestion } from './state'

const approvable = (s: FieldStatus) => s === 'verified' || s === 'user_answered'

function useSectionStatuses(section: SectionDef) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  return [...section.fields.map((id) => ({ id, status: fields[id]?.status ?? 'empty' })), ...(section.hasRates ? [{ id: 'hourlyRates', status: rates.status }] : [])]
}

export function ReviewView() {
  const fields = useApp((s) => s.fields)
  const approveSection = useApp((s) => s.approveSection)
  const focusField = useApp((s) => s.focusField)
  const { counts, total, done } = useSummary()
  const newest = useNewestQuestion()
  const covered = new Set(liveItems(newest, fields).map((i) => i.fieldId))
  const attention = Object.keys(fieldDefs).filter((id) => ['conflict', 'missing'].includes(fields[id]?.status ?? ''))
  const ready = counts.verified + counts.user_answered
  const allApproved = counts.approved === total

  const approveAll = () => {
    for (const s of sections) approveSection(s.id)
    toast.success(`Approved ${plural(ready, 'value')}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ViewHeader
        eyebrow="Review"
        title={allApproved ? 'Everything is approved' : `${counts.approved} of ${total} approved`}
        sub={
          <span className="num">
            {done} of {total} filled
            {attention.length > 0 && ` · ${attention.length} need${attention.length === 1 ? 's' : ''} you`}
          </span>
        }
      />

      <div className="flex flex-col gap-2 px-4 pb-3">
        {allApproved ? (
          <>
            <Button className="h-9 w-full gap-1.5 text-[13px]" onClick={() => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))}>
              <Download className="size-4" /> Export .docx
            </Button>
            <p className="text-[12px] text-ink-3">Saves the filled layout.docx with every approved value.</p>
          </>
        ) : (
          <>
            <Button className="h-9 w-full gap-1.5 text-[13px]" disabled={!ready} onClick={approveAll}>
              <CheckCheck className="size-4" /> {ready ? `Approve all ready (${ready})` : 'Nothing ready to approve'}
            </Button>
            <p className="text-[12px] text-ink-3">Export unlocks once every value is approved.</p>
          </>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 border-t border-rule [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-4 pt-3 pb-6">
          {attention.length > 0 && (
            <div className="mx-4 rounded-lg border border-warn/30 lg:mx-3 bg-warn-soft/50 px-3 py-3">
              <p className="mb-2 text-[13px] font-semibold text-ink">
                {plural(attention.length, 'value')} still need{attention.length === 1 ? 's' : ''} an answer
              </p>
              <ul className="flex flex-col gap-1.5">
                {attention.map((id) => (
                  <li key={id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="min-w-0">
                      <span className="block truncate text-ink">{fieldDefs[id].label}</span>
                      <span className="block text-[12px] text-warn">{fields[id].status === 'conflict' ? 'Documents disagree' : 'Not in any document'}</span>
                    </span>
                    {!covered.has(id) && (
                      <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[12px]" onClick={() => focusField(id)}>
                        Fill in
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {covered.size > 0 && (
                <Button size="sm" className="mt-3 h-8 text-[13px]" onClick={() => answerField([...covered][0])}>
                  Answer now
                </Button>
              )}
            </div>
          )}

          {sections.map((section) => (
            <ReviewSection key={section.id} section={section} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}

function ReviewSection({ section }: { section: SectionDef }) {
  const approveSection = useApp((s) => s.approveSection)
  const statuses = useSectionStatuses(section)
  const approvedCount = statuses.filter((s) => s.status === 'approved').length
  const canApprove = statuses.some((s) => approvable(s.status))
  const all = approvedCount === statuses.length

  return (
    <section aria-labelledby={`review-${section.id}`}>
      <div className="flex items-center gap-2 px-4 pb-1.5">
        <h3 id={`review-${section.id}`} className="eyebrow">
          {section.title}
        </h3>
        <span className="num font-mono text-[11px] text-ink-3">
          {approvedCount}/{statuses.length}
        </span>
        <div className="h-px flex-1 bg-rule" />
        {all ? (
          <span className="flex h-7 items-center gap-1 text-[12px] font-medium text-ok">
            <Check className="size-3.5" /> Approved
          </span>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-[12px] text-ink-2"
            disabled={!canApprove}
            onClick={() => {
              approveSection(section.id)
              toast.success(`${section.title} approved`)
            }}
          >
            Approve section
          </Button>
        )}
      </div>
      <ul className="mx-4 flex flex-col divide-y lg:mx-3 divide-rule rounded-lg border border-rule bg-panel">
        {statuses.map((s) => (
          <ReviewRow key={s.id} fieldId={s.id} status={s.status} />
        ))}
      </ul>
    </section>
  )
}

function ReviewRow({ fieldId, status }: { fieldId: string; status: FieldStatus }) {
  const field = useApp((s) => (fieldId === 'hourlyRates' ? undefined : s.fields[fieldId]))
  const rates = useApp((s) => s.rates)
  const approveField = useApp((s) => s.approveField)
  const unapproveField = useApp((s) => s.unapproveField)
  const focusField = useApp((s) => s.focusField)
  const wash = useWash(fieldId)
  const label = fieldId === 'hourlyRates' ? 'Hourly rates' : fieldDefs[fieldId].label
  const value =
    fieldId === 'hourlyRates'
      ? rates.rows.length
        ? `${plural(rates.rows.length, 'role')} · $${Math.min(...rates.rows.map((r) => r.rate))}–$${Math.max(...rates.rows.map((r) => r.rate))}/hr`
        : null
      : displayValue(field)

  return (
    <li id={`review-${fieldId}`} className={cn('flex items-center gap-2 py-1.5 pr-2 pl-3', wash && 'field-wash')}>
      <button type="button" onClick={() => focusField(fieldId)} className="min-w-0 flex-1 rounded-sm py-0.5 text-left" title="Show in the field list">
        <span className="block truncate text-[12px] text-ink-3">{label}</span>
        <span className={cn('block truncate text-[13px]', value ? 'text-ink' : 'text-ink-3 italic')}>
          {value ? value.replace(/\n+/g, ' ') : status === 'missing' ? 'Not found' : status === 'conflict' ? 'Two candidates' : 'Waiting'}
        </span>
      </button>
      {status === 'approved' ? (
        <button
          type="button"
          onClick={() => unapproveField(fieldId)}
          aria-label={`Undo approval of ${label}`}
          title="Undo approval"
          className="group/ap flex h-7 w-[86px] shrink-0 items-center justify-center gap-1 rounded-md text-[12px] font-medium text-ok transition-colors hover:bg-panel-2 hover:text-ink-2 focus-visible:text-ink-2"
        >
          <BadgeCheck className="size-3.5 group-hover/ap:hidden group-focus-visible/ap:hidden" />
          <span className="group-hover/ap:hidden group-focus-visible/ap:hidden">Approved</span>
          <span className="hidden group-hover/ap:inline group-focus-visible/ap:inline">Undo</span>
        </button>
      ) : approvable(status) ? (
        <Button variant="outline" size="sm" className="h-7 w-[86px] shrink-0 gap-1 px-2 text-[12px]" onClick={() => approveField(fieldId)} aria-label={`Approve ${label}`}>
          <Check className="size-3.5" /> Approve
        </Button>
      ) : (
        <StatusChip status={status} className="h-5 text-[11px]" />
      )}
    </li>
  )
}
