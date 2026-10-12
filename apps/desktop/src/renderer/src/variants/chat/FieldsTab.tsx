import { AtSign, Check, ChevronRight, FileText, MessageSquareReply, Pencil } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { fieldDefs, sections, type SectionDef } from '../../../../agent-core/demo-data'
import type { SourceRef } from '../../../../shared/protocol'
import { EvidencePage } from '@/components/EvidencePage'
import { CitationChip, statusMeta } from '@/components/status'
import { Button } from '@/components/ui/button'
import { useSummary } from '@/lib/agent'
import { DONE, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { approveAllReady } from './cards'
import { useChatUI } from './ui-store'
import { fieldLabel, orderedIds, RATES_ID, scrollWithin, SegmentBar, statusOf, StatusGlyph, statusText, useWash, valueOf } from './shared'

const EDITABLE = new Set(['text', 'email', 'money', 'date', 'narrative'])

export function canEdit(id: string, status: string) {
  return id !== RATES_ID && EDITABLE.has(fieldDefs[id]?.kind ?? '') && status !== 'conflict' && status !== 'drafting'
}
export const canApprove = (status: string) => status === 'verified' || status === 'user_answered'

/** Inline editor: Enter saves, Escape cancels. Narrative fields get a textarea. */
export function EditBox({ id, initial, onDone }: { id: string; initial: string; onDone: () => void }) {
  const editField = useApp((s) => s.editField)
  const [v, setV] = useState(initial)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const multi = fieldDefs[id]?.kind === 'narrative'
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const save = () => {
    if (v.trim() !== initial.trim()) {
      editField(id, v)
      toast.success(`Updated ${fieldLabel(id)}`)
    }
    onDone()
  }
  const common = {
    ref,
    value: v,
    'aria-label': `New value for ${fieldLabel(id)}`,
    onChange: (e: React.ChangeEvent<HTMLInputElement & HTMLTextAreaElement>) => setV(e.target.value),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onDone()
      }
      if (e.key === 'Enter' && (!multi || e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        save()
      }
    },
    className:
      'w-full rounded-lg border border-cobalt/50 bg-panel px-3 text-[13.5px] text-ink outline-none ring-4 ring-cobalt/10 placeholder:text-ink-3'
  }
  return (
    <div className="flex flex-col gap-2">
      {multi ? (
        <textarea {...common} rows={6} className={cn(common.className, 'resize-y py-2 leading-relaxed')} />
      ) : (
        <input {...common} type={fieldDefs[id]?.kind === 'email' ? 'email' : 'text'} className={cn(common.className, 'h-9')} />
      )}
      <div className="flex items-center justify-end gap-1.5">
        <span className="mr-auto text-[11.5px] text-ink-3">{multi ? 'Ctrl+Enter to save' : 'Enter to save · Esc to cancel'}</span>
        <Button type="button" variant="ghost" size="sm" className="h-7 px-2.5 text-[12.5px]" onClick={onDone}>
          Cancel
        </Button>
        <Button type="button" size="sm" className="h-7 px-2.5 text-[12.5px]" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  )
}

function Quote({ source }: { source: SourceRef }) {
  return (
    <li className="flex min-w-0 flex-col gap-1">
      <p className="font-serif text-[13.5px] leading-snug text-ink-2">“{source.quote}”</p>
      <CitationChip source={source} className="self-start" />
    </li>
  )
}

/** The evidence and actions for one field; shared by the Fields list and the document inspector. */
export function FieldDetails({ id, onAsk, onShowInDoc, compact }: { id: string; onAsk: () => void; onShowInDoc?: () => void; compact?: boolean }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveField = useApp((s) => s.approveField)
  const focusQuestion = useChatUI((s) => s.focusQuestion)
  const [editing, setEditing] = useState(false)
  const [showPage, setShowPage] = useState(false)
  const f = fields[id]
  const status = statusOf(id, fields, rates)
  const value = valueOf(id, fields, rates)
  const sources = id === RATES_ID ? [] : status === 'conflict' ? [] : (f?.sources ?? [])
  const first = sources[0] ?? f?.candidates?.[0]?.sources[0]

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {editing && <EditBox id={id} initial={value ?? ''} onDone={() => setEditing(false)} />}

      {!editing && fieldDefs[id]?.kind === 'narrative' && value && !compact && (
        <div className="flex flex-col gap-2 text-[13.5px] leading-relaxed text-ink">
          {value.split(/\n{2,}/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      )}

      {id === RATES_ID && rates.rows.length > 0 && (
        <table className="w-full text-[13px]">
          <tbody>
            {rates.rows.map((r) => (
              <tr key={r.key} className="border-t border-rule first:border-t-0">
                <td className="py-1.5 text-ink">{r.role}</td>
                <td className="num py-1.5 text-right font-mono text-ink">${r.rate}</td>
                <td className="py-1.5 pl-3 text-right">{r.source && <CitationChip source={r.source} className="h-5 text-[11px]" />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {status === 'conflict' && f?.candidates && (
        <div className="flex flex-col gap-2.5">
          <p className="text-[12.5px] text-warn">These documents disagree. Answer in the chat to pick one.</p>
          <ul className="flex flex-col gap-2.5">
            {f.candidates.map((c) => (
              <li key={String(c.value)} className="flex flex-col gap-1">
                <span className="text-[13.5px] font-medium text-ink">{c.display}</span>
                {c.sources.map((s, i) => (
                  <span key={i} className="flex min-w-0 flex-col gap-1">
                    <span className="font-serif text-[13px] leading-snug text-ink-2">“{s.quote}”</span>
                    <CitationChip source={s} className="self-start" />
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {sources.length > 0 && (
        <ul className="flex flex-col gap-2.5">
          {(compact ? sources.slice(0, 1) : sources).map((s, i) => (
            <Quote key={i} source={s} />
          ))}
        </ul>
      )}

      {f?.note && status !== 'empty' && <p className="text-[12px] text-ink-3">{f.note}</p>}

      {showPage && first && <EvidencePage docId={first.docId} page={first.page} quote={first.quote} locator={first.locator} compact />}

      <div className="flex flex-wrap items-center gap-1.5">
        {status === 'conflict' ? (
          <Button type="button" size="sm" className="h-7 gap-1.5 px-2.5 text-[12.5px]" onClick={focusQuestion}>
            <MessageSquareReply className="size-3.5" /> Answer in the chat
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 border-rule bg-panel px-2.5 text-[12.5px]" onClick={onAsk}>
            <AtSign className="size-3.5" /> Ask about this
          </Button>
        )}
        {canEdit(id, status) && !editing && (
          <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 border-rule bg-panel px-2.5 text-[12.5px]" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" /> {value ? 'Edit' : 'Fill in'}
          </Button>
        )}
        {canApprove(status) && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1.5 border-ok/40 bg-panel px-2.5 text-[12.5px] text-ok hover:bg-ok-soft hover:text-ok"
            onClick={() => approveField(id)}
          >
            <Check className="size-3.5" strokeWidth={2.5} /> Approve
          </Button>
        )}
        {first && first.docId && (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12.5px] text-ink-2" onClick={() => setShowPage(!showPage)} aria-expanded={showPage}>
            {showPage ? 'Hide page' : 'Show page'}
          </Button>
        )}
        {onShowInDoc && (
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-[12.5px] text-ink-2" onClick={onShowInDoc}>
            <FileText className="size-3.5" /> Show in document
          </Button>
        )}
      </div>
    </div>
  )
}

function FieldRow({ id, open, onToggle, onAsk }: { id: string; open: boolean; onToggle: () => void; onAsk: (id: string) => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveField = useApp((s) => s.approveField)
  const openPanel = useChatUI((s) => s.openPanel)
  const wash = useWash(id)
  const status = statusOf(id, fields, rates)
  const value = valueOf(id, fields, rates)
  const empty = status === 'missing' ? 'Not in any document' : status === 'conflict' ? `${fields[id]?.candidates?.length ?? 2} options to choose from` : 'Waiting'

  return (
    <li id={`field-${id}`} className={cn('group/row rounded-lg transition-colors', open ? 'bg-panel shadow-[0_0_0_1px_var(--rule)]' : 'hover:bg-panel-2/70', wash && 'chat-wash')}>
      <div className="flex min-w-0 items-start gap-2.5 px-2.5 py-2">
        <StatusGlyph status={status} className="mt-[3px]" />
        <button type="button" onClick={onToggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="flex items-center gap-2">
            <span className="truncate text-[12px] text-ink-3">{fieldLabel(id)}</span>
            <span className={cn('shrink-0 text-[11px] font-medium', statusText[status])}>{statusMeta[status].label}</span>
          </span>
          <span className={cn('mt-0.5 block text-[13.5px]', open ? 'break-words' : 'truncate', value ? 'text-ink' : 'text-ink-3 italic', status === 'drafting' && 'caret')}>
            {value ?? empty}
          </span>
        </button>
        {canApprove(status) && !open && (
          <button
            type="button"
            onClick={() => approveField(id)}
            className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-[color,background-color,opacity] hover:bg-ok-soft hover:text-ok focus-visible:opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100"
            aria-label={`Approve ${fieldLabel(id)}`}
            title="Approve"
          >
            <Check className="size-4" strokeWidth={2.4} />
          </button>
        )}
        <button
          type="button"
          onClick={onToggle}
          className="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          aria-label={open ? `Collapse ${fieldLabel(id)}` : `Show evidence for ${fieldLabel(id)}`}
        >
          <ChevronRight className={cn('size-4 transition-transform', open && 'rotate-90')} />
        </button>
      </div>
      {open && (
        <div className="px-2.5 pt-1 pb-3 pl-[34px]">
          <FieldDetails id={id} onAsk={() => onAsk(id)} onShowInDoc={id === RATES_ID ? undefined : () => openPanel('document', id, true)} />
        </div>
      )}
    </li>
  )
}

function SectionBlock({ section, openId, setOpenId, onAsk }: { section: SectionDef; openId: string | null; setOpenId: (id: string | null) => void; onAsk: (id: string) => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveSection = useApp((s) => s.approveSection)
  const ids = section.hasRates ? [...section.fields, RATES_ID] : section.fields
  const sts = ids.map((id) => statusOf(id, fields, rates))
  const n = sts.filter((s) => DONE.includes(s)).length
  const approvable = sts.some(canApprove)
  const allApproved = sts.every((s) => s === 'approved')
  return (
    <section aria-labelledby={`sec-${section.id}`} className="flex flex-col">
      <div className="flex min-h-8 items-center gap-2.5 px-2.5 pb-1">
        <h3 id={`sec-${section.id}`} className="text-[12.5px] font-semibold text-ink">
          {section.title}
        </h3>
        <span className="num font-mono text-[11px] text-ink-3">
          {n}/{ids.length}
        </span>
        <span className="flex-1" />
        {allApproved ? (
          <span className="flex items-center gap-1 text-[12px] font-medium text-ok">
            <Check className="size-3.5" strokeWidth={2.5} /> Approved
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
      <ul className="flex flex-col gap-0.5">
        {ids.map((id) => (
          <FieldRow key={id} id={id} open={openId === id} onToggle={() => setOpenId(openId === id ? null : id)} onAsk={onAsk} />
        ))}
      </ul>
    </section>
  )
}

export function FieldsTab({ onAsk }: { onAsk: (id: string) => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const { counts, done, total } = useSummary()
  const reveal = useChatUI((s) => s.reveal)
  const [openId, setOpenIdRaw] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const setOpenId = (id: string | null) => {
    setOpenIdRaw(id)
    if (!id) return
    requestAnimationFrame(() => {
      const box = scrollRef.current
      const el = box?.querySelector(`#field-${CSS.escape(id)}`)
      if (!box || !el) return
      const r = el.getBoundingClientRect()
      const b = box.getBoundingClientRect()
      if (r.bottom > b.bottom - 8 || r.top < b.top) scrollWithin(box, el, r.height > b.height * 0.7 ? 0.02 : 0.2)
    })
  }
  const ready = counts.verified + counts.user_answered

  useEffect(() => {
    if (!reveal) return
    setOpenIdRaw(reveal.id)
    const t = setTimeout(() => {
      const el = scrollRef.current?.querySelector(`#field-${CSS.escape(reveal.id)}`)
      if (scrollRef.current && el) scrollWithin(scrollRef.current, el, 0.2)
    }, 60)
    return () => clearTimeout(t)
  }, [reveal])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule px-4 py-2.5">
        <span className="num text-[13px] text-ink-2">
          <span className="font-semibold text-ink">{done}</span> of {total} filled
        </span>
        <SegmentBar statuses={orderedIds.map((id) => statusOf(id, fields, rates))} className="min-w-[120px] flex-1" label={`${done} of ${total} filled`} />
        <Button variant="outline" size="sm" className="h-7 gap-1.5 border-rule bg-panel px-2.5 text-[12.5px]" disabled={!ready} onClick={approveAllReady}>
          <Check className="size-3.5" strokeWidth={2.5} /> Approve all ready
        </Button>
      </div>
      <div ref={scrollRef} className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pt-3 pb-8 sm:px-3">
        <div className="flex flex-col gap-5">
          {sections.map((s) => (
            <SectionBlock key={s.id} section={s} openId={openId} setOpenId={setOpenId} onAsk={onAsk} />
          ))}
        </div>
      </div>
    </div>
  )
}
