import { BadgeCheck, Check, ExternalLink, PanelRightClose, Pencil, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { sections } from '../../../../agent-core/demo-data'
import type { SourceRef } from '../../../../shared/protocol'
import { DocxView } from '@/components/DocxView'
import { EvidencePage } from '@/components/EvidencePage'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ByLabel, Segments, SourceRefButton, StatusLabel } from './bits'
import type { GridActions } from './Grid'
import { RATES, buildItems, canApprove, historyOf, money, type ItemRow } from './model'
import { emailOk, useGrid, useLiveQuestion } from './state'

// Right-hand detail for the active row: value, status, a derived history and
// the full evidence. Also the document split, which follows the same row.

const EDITABLE = new Set(['text', 'email', 'money', 'date', 'narrative'])
const pad = (n: number) => String(n).padStart(2, '0')

function useActiveItem() {
  const active = useGrid((s) => s.active)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const items = useMemo(() => buildItems(fields, rates), [fields, rates])
  if (!active) return { active, item: null, items, rate: null }
  if (active.startsWith(`${RATES}:`)) {
    const key = active.slice(RATES.length + 1)
    return { active, item: items.find((i) => i.key === RATES) ?? null, items, rate: rates.rows.find((r) => r.key === key) ?? null }
  }
  return { active, item: items.find((i) => i.key === active) ?? null, items, rate: null }
}

export function Inspector({ onClose, actions, closeLabel = 'Hide details' }: { onClose?: () => void; actions: GridActions; closeLabel?: string }) {
  const { active, item, items, rate } = useActiveItem()
  const sectionId = active?.startsWith('group:') ? active.slice(6) : null

  if (sectionId) return <SectionDetail sectionId={sectionId} items={items} onClose={onClose} closeLabel={closeLabel} />
  if (!item) {
    return (
      <Shell onClose={onClose} closeLabel={closeLabel} title="Details" eyebrow="Nothing selected">
        <p className="px-4 py-6 text-ink-3">Pick a row to see its value, history and evidence.</p>
      </Shell>
    )
  }
  return <ItemDetail key={active} item={item} rateKey={rate?.key ?? null} onClose={onClose} closeLabel={closeLabel} actions={actions} />
}

function Shell({ eyebrow, title, tag, onClose, closeLabel, children }: { eyebrow: ReactNode; title: string; tag?: string; onClose?: () => void; closeLabel: string; children: ReactNode }) {
  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Details">
      <header className="flex items-start gap-2 border-b border-rule px-4 pt-3 pb-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] text-ink-3">{eyebrow}</p>
          <h2 className="truncate text-[15px] leading-tight font-semibold tracking-[-0.01em] text-ink">{title}</h2>
          {tag && <code className="mt-0.5 block truncate font-mono text-[11px] text-ink-3">{tag}</code>}
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" className="-mr-1.5 size-7 text-ink-3" onClick={onClose} aria-label={closeLabel}>
            {closeLabel.startsWith('Close') ? <X className="size-4" /> : <PanelRightClose className="size-4" />}
          </Button>
        )}
      </header>
      <div className="grid-thin-scroll min-h-0 flex-1 overflow-y-auto">{children}</div>
    </section>
  )
}

function Block({ title, aside, children, className }: { title: string; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('border-b border-rule px-4 py-3.5 last:border-b-0', className)}>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-medium tracking-[0.02em] text-ink-3">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  )
}

function ItemDetail({ item, rateKey, onClose, closeLabel, actions }: { item: ItemRow; rateKey: string | null; onClose?: () => void; closeLabel: string; actions: GridActions }) {
  const rates = useApp((s) => s.rates)
  const question = useLiveQuestion()
  const draft = useGrid((s) => s.draft[item.key])
  const editingHere = useGrid((s) => s.editing === item.key && item.kind === 'narrative')
  const [editing, setEditing] = useState(editingHere)
  const rate = rateKey ? rates.rows.find((r) => r.key === rateKey) : null
  const section = sections.find((s) => s.id === item.sectionId)
  const qItem = question?.items.find((i) => i.fieldId === item.fieldId)
  const history = historyOf(item, rates)
  const approvable = canApprove(item.status)
  const f = item.field

  useEffect(() => {
    if (editingHere) setEditing(true)
  }, [editingHere])

  const evidence: { label?: string; source: SourceRef }[] = rate
    ? rate.source
      ? [{ source: rate.source }]
      : []
    : item.key === RATES
      ? item.sources[0]
        ? [{ source: { docId: item.sources[0].docId, quote: '' } }]
        : []
      : item.status === 'conflict'
        ? (f?.candidates ?? []).flatMap((c) => c.sources.map((source) => ({ label: c.display, source })))
        : item.sources.map((source) => ({ source }))

  return (
    <Shell
      onClose={onClose}
      closeLabel={closeLabel}
      eyebrow={
        <>
          <span className="font-mono">{pad(item.n)}</span> · {section?.title}
          {rate && ' · Hourly rates'}
        </>
      }
      title={rate ? rate.role : item.label}
      tag={rate ? `${item.tag} · row ${rates.rows.indexOf(rate) + 1}` : item.tag}
    >
      <Block title="Value" aside={item.by ? <ByLabel by={item.by} /> : undefined}>
        {editing && EDITABLE.has(item.kind) ? (
          <ValueEditor item={item} onDone={() => setEditing(false)} />
        ) : (
          <ValueView item={item} rateValue={rate ? `${money(rate.rate)}/hr` : null} draft={qItem ? draft : undefined} />
        )}
        {f?.note && item.status !== 'empty' && !editing && <p className="mt-2 text-[12px] text-ink-3">{f.note}</p>}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <StatusLabel status={item.status} className="mr-auto" />
          {EDITABLE.has(item.kind) && !rate && (item.status === 'verified' || item.status === 'user_answered' || item.status === 'approved') && !editing && (
            <Button variant="outline" size="xs" className="h-7 gap-1.5 text-[12px]" onClick={() => setEditing(true)}>
              <Pencil className="size-3" /> Edit
            </Button>
          )}
          {item.status === 'approved' ? (
            <span className="inline-flex h-7 items-center gap-1 text-[12px] font-medium text-ok">
              <BadgeCheck className="size-3.5" /> Approved
            </span>
          ) : approvable ? (
            <Button size="xs" className="h-7 gap-1.5 text-[12px]" onClick={() => actions.approve(item.fieldId)}>
              <Check className="size-3.5" /> {rate ? 'Approve rates' : 'Approve'}
            </Button>
          ) : null}
        </div>
      </Block>

      {item.status === 'conflict' && f?.candidates && (
        <Block title={qItem ? 'Choose a value · sent with your answers' : 'Choose a value'}>
          <div className="flex flex-col gap-1.5" role="radiogroup" aria-label={`Choose ${item.label}`}>
            {f.candidates.map((c) => {
              const on = draft === String(c.value)
              return (
                <button
                  key={String(c.value)}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => {
                    if (qItem) useGrid.getState().setDraft(item.key, String(c.value))
                    else {
                      useApp.getState().editField(item.key, c.display)
                      toast.success(`${item.label} set to ${c.display}`)
                    }
                  }}
                  className={cn(
                    'flex items-start gap-2.5 rounded-[6px] border px-2.5 py-2 text-left transition-colors',
                    on ? 'border-cobalt/60 bg-cobalt-soft' : 'border-rule hover:border-ink-3/40 hover:bg-panel-2'
                  )}
                >
                  <span className={cn('mt-0.5 flex size-3.5 shrink-0 items-center justify-center rounded-full border', on ? 'border-cobalt' : 'border-ink-3/60')}>
                    {on && <span className="size-1.5 rounded-full bg-cobalt" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-ink">{c.display}</span>
                    <span className="block font-mono text-[11px] text-ink-3">
                      {c.sources.map((s) => `${s.docId} ${s.page ? `p.${s.page}` : (s.locator ?? '')}`).join(', ')}
                    </span>
                  </span>
                </button>
              )
            })}
          </div>
          {qItem?.help && <p className="mt-2 text-[12px] text-ink-3">{qItem.help}</p>}
        </Block>
      )}

      <Block title="History">
        <ol className="relative flex flex-col gap-2.5">
          <span className="absolute top-1.5 bottom-1.5 left-[3.5px] w-px bg-rule" aria-hidden />
          {history.map((h, i) => (
            <li key={i} className="relative flex items-start gap-2.5">
              <span
                className={cn(
                  'relative mt-[5px] size-2 shrink-0 rounded-full ring-2 ring-panel',
                  h.who === 'you' ? 'bg-cobalt' : h.who === 'agent' ? 'bg-ink-3' : 'border border-dashed border-warn bg-panel'
                )}
                aria-hidden
              />
              <span className={cn('min-w-0 text-[12.5px] leading-[18px]', h.who === 'pending' ? 'text-ink-3' : 'text-ink-2', h.who === 'you' && 'text-ink')}>
                {h.text}
              </span>
            </li>
          ))}
        </ol>
      </Block>

      <Block title={`Evidence${evidence.length ? ` · ${evidence.length}` : ''}`}>
        {evidence.length ? (
          <div className="flex flex-col gap-4">
            {evidence.slice(0, 4).map(({ label, source }, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {label && <span className="shrink-0 text-[12px] font-medium text-ink">{label}</span>}
                  <SourceRefButton source={source} long className="min-w-0" />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="ml-auto text-ink-3"
                    aria-label="Open in the source viewer"
                    onClick={() => useApp.getState().openSource({ docId: source.docId, page: source.page, quote: source.quote || undefined, locator: source.locator })}
                  >
                    <ExternalLink />
                  </Button>
                </div>
                <EvidencePage docId={source.docId} page={source.page} quote={source.quote || undefined} locator={source.locator} compact className="rounded-[4px]" />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12.5px] text-ink-3">
            {item.status === 'missing'
              ? 'No document has this value. Answer it in the sheet.'
              : item.by === 'user'
                ? 'You provided this value. No document backs it.'
                : 'No quotes yet.'}
          </p>
        )}
      </Block>
    </Shell>
  )
}

function ValueView({ item, rateValue, draft }: { item: ItemRow; rateValue: string | null; draft?: string }) {
  const rates = useApp((s) => s.rates)
  if (rateValue) return <p className="font-mono text-[16px] text-ink">{rateValue}</p>
  if (item.key === RATES) {
    if (!rates.rows.length) return <p className="text-ink-3 italic">Waiting for the agent</p>
    return (
      <table className="w-full text-[12.5px]">
        <caption className="sr-only">Hourly rates</caption>
        <tbody>
          {rates.rows.map((r) => (
            <tr key={r.key} className="border-b border-rule last:border-b-0">
              <td className="py-1 text-ink">{r.role}</td>
              <td className="py-1 text-right font-mono text-ink">{money(r.rate)}/hr</td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  }
  if (item.kind === 'narrative') {
    if (!item.value) return <p className="text-ink-3 italic">{item.field?.note ?? 'Waiting for the agent'}</p>
    return (
      <div className={cn('flex flex-col gap-2 text-[13px] leading-[1.55] text-ink', item.status === 'drafting' && 'caret')}>
        {item.value.split(/\n{2,}/).map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>
    )
  }
  if (item.status === 'conflict') {
    const chosen = item.field?.candidates?.find((c) => String(c.value) === draft)
    return chosen ? (
      <p className="text-[16px] text-ink">
        {chosen.display} <span className="ml-1 align-middle text-[11px] font-medium text-cobalt">ready to send</span>
      </p>
    ) : (
      <p className="text-[14px] text-warn">Two documents disagree. Choose one below.</p>
    )
  }
  if (item.status === 'missing') {
    return draft?.trim() ? (
      <p className="text-[16px] break-words text-ink">
        {draft} <span className="ml-1 align-middle text-[11px] font-medium text-cobalt">{emailOk(draft) ? 'ready to send' : 'check the address'}</span>
      </p>
    ) : (
      <p className="text-[14px] text-bad">Not found in any document. Type it in the sheet.</p>
    )
  }
  if (!item.value) return <p className="text-ink-3 italic">Waiting for the agent</p>
  if (item.kind === 'boolean') {
    return (
      <p className="flex items-center gap-2 text-[16px] text-ink">
        <span className="font-serif text-[18px] leading-none text-ink-2" aria-hidden>
          {item.field?.value ? '☒' : '☐'}
        </span>
        {item.value}
      </p>
    )
  }
  return <p className={cn('text-[16px] leading-snug break-words text-ink', (item.kind === 'money' || item.kind === 'date') && 'font-mono text-[15px]')}>{item.value}</p>
}

function ValueEditor({ item, onDone }: { item: ItemRow; onDone: () => void }) {
  const [value, setValue] = useState(item.value ?? '')
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  const save = () => {
    if (value.trim() !== (item.value ?? '')) {
      useApp.getState().editField(item.key, value)
      toast.success(`${item.label} updated`, { description: 'The agent won’t overwrite your edit.' })
    }
    useGrid.getState().set({ editing: null })
    onDone()
  }
  const cancel = () => {
    useGrid.getState().set({ editing: null })
    onDone()
  }
  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
    >
      <label htmlFor="grid-inspector-edit" className="sr-only">
        {item.label}
      </label>
      <Textarea
        id="grid-inspector-edit"
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') cancel()
          if (e.key === 'Enter' && (item.kind !== 'narrative' || e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            save()
          }
        }}
        rows={item.kind === 'narrative' ? 9 : 2}
        className="min-h-0 resize-y border-rule bg-panel text-[13px] leading-[1.55] focus-visible:border-cobalt focus-visible:ring-cobalt/15"
      />
      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[11px] text-ink-3">{item.kind === 'narrative' ? 'Ctrl+Enter saves' : 'Enter saves · Esc cancels'}</span>
        <Button type="button" variant="ghost" size="xs" className="h-7" onClick={cancel}>
          Cancel
        </Button>
        <Button type="submit" size="xs" className="h-7">
          Save
        </Button>
      </div>
    </form>
  )
}

function SectionDetail({ sectionId, items, onClose, closeLabel }: { sectionId: string; items: ItemRow[]; onClose?: () => void; closeLabel: string }) {
  const section = sections.find((s) => s.id === sectionId)
  const revealRow = useGrid((s) => s.revealRow)
  if (!section) return null
  const its = items.filter((i) => i.sectionId === sectionId)
  const approvable = its.filter((i) => canApprove(i.status)).length
  const done = its.filter((i) => i.status === 'verified' || i.status === 'user_answered' || i.status === 'approved').length
  return (
    <Shell onClose={onClose} closeLabel={closeLabel} eyebrow="Section" title={section.title}>
      <Block title="Progress" aside={<span className="font-mono text-[11px] text-ink-3">{done}/{its.length} filled</span>}>
        <Segments statuses={its.map((i) => i.status)} size="md" />
        {approvable ? (
          <Button
            size="xs"
            className="mt-3 h-7 gap-1.5 text-[12px]"
            onClick={() => {
              useApp.getState().approveSection(sectionId)
              toast.success(`${section.title} approved`)
            }}
          >
            <Check className="size-3.5" /> Approve {approvable} in this section
          </Button>
        ) : its.every((i) => i.status === 'approved') ? (
          <p className="mt-3 inline-flex items-center gap-1 text-[12px] font-medium text-ok">
            <BadgeCheck className="size-3.5" /> All approved
          </p>
        ) : (
          <p className="mt-3 text-[12px] text-ink-3">Nothing to approve until the open rows are filled.</p>
        )}
      </Block>
      <Block title="Rows">
        <ul className="-mx-2 flex flex-col">
          {its.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => revealRow(i.key, i.sectionId)}
                className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left hover:bg-panel-2"
              >
                <span className="font-mono text-[11px] text-ink-3">{pad(i.n)}</span>
                <span className="min-w-0 flex-1 truncate text-ink">{i.label}</span>
                <StatusLabel status={i.status} />
              </button>
            </li>
          ))}
        </ul>
      </Block>
    </Shell>
  )
}

/** The real Word layout beside the sheet, following the active row. */
export function DocPane({ onClose, closeLabel = 'Close document' }: { onClose?: () => void; closeLabel?: string }) {
  const { active, item, rate } = useActiveItem()
  const revealRow = useGrid((s) => s.revealRow)
  const fieldId = item ? item.fieldId : null
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!fieldId) return
    const t = setTimeout(() => {
      const el = wrapRef.current?.querySelector('.ftt-selected')
      const box = wrapRef.current?.getBoundingClientRect()
      if (!el || !box) return
      const r = el.getBoundingClientRect()
      if (r.top < box.top + 40 || r.bottom > box.bottom - 40) el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
    return () => clearTimeout(t)
  }, [fieldId, active])

  return (
    <section className="flex h-full min-h-0 flex-col bg-ground" aria-label="Document">
      <header className="flex min-h-[52px] items-center gap-3 border-b border-rule bg-panel px-4 py-2">
        <div className="min-w-0 flex-1">
          <p className="text-[11px] text-ink-3">Engagement Letter.docx · live</p>
          {item ? (
            <p className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-ink">{rate ? rate.role : item.label}</span>
              <StatusLabel status={item.status} />
            </p>
          ) : (
            <p className="truncate text-ink-2">Click a value on the page to find its row</p>
          )}
        </div>
        {onClose && (
          <Button variant="ghost" size="icon-sm" className="size-7 text-ink-3" onClick={onClose} aria-label={closeLabel}>
            {closeLabel === 'Close' ? <X className="size-4" /> : <PanelRightClose className="size-4" />}
          </Button>
        )}
      </header>
      <div ref={wrapRef} className="min-h-0 flex-1">
        <DocxView
          selectedField={fieldId}
          onValueClick={(id) => {
            const sec = sections.find((s) => s.fields.includes(id) || (id === RATES && s.hasRates))
            revealRow(id, sec?.id)
          }}
          aria-label="Filled letter"
        />
      </div>
    </section>
  )
}
