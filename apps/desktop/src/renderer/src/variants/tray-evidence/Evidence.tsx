import { BadgeCheck, Check, ChevronDown, ChevronUp, FileX2, Maximize2, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { FieldStatus, SourceRef } from '../../../../shared/protocol'
import { EvidencePage } from '@/components/EvidencePage'
import { useWash } from '@/components/FillPane'
import { StatusChip, locatorText } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerContent, DrawerDescription, DrawerTitle } from '@/components/ui/drawer'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAgent, useLiveSources } from '@/lib/agent'
import { displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { askAbout, useQuestionState } from './NeedsYouTray'
import { fieldOrder, focusRow, labelOf, rowOf, stepField, useMediaQuery, useTray } from './state'

// The left column's third state: the evidence behind the selected field.
// Desktop: a 340px column that pushes the fields. Phones: a bottom sheet.

const ease = [0.22, 1, 0.36, 1] as const
const shortName = (name: string) => name.replace(/\.[^.]+$/, '')

interface Group {
  key: string
  docId: string
  page?: number
  locator?: string
  quotes: string[]
}

/** One card per page (or sheet range, or email), keyed like the row's citation chips: "D7|p.1". */
function groupSources(sources: SourceRef[]): Group[] {
  const out: Group[] = []
  for (const s of sources) {
    const key = `${s.docId}|${locatorText(s)}`
    const g = out.find((x) => x.key === key)
    if (g) {
      if (!g.quotes.includes(s.quote)) g.quotes.push(s.quote)
    } else out.push({ key, docId: s.docId, page: s.page, locator: s.locator, quotes: [s.quote] })
  }
  return out
}

/** Status and display value for a field id, including the rate table. */
function useFieldView(id: string) {
  const field = useApp((s) => (id === 'hourlyRates' ? undefined : s.fields[id]))
  const rates = useApp((s) => s.rates)
  if (id === 'hourlyRates') {
    const status: FieldStatus = rates.status
    const value = rates.rows.length ? rates.rows.map((r) => `${r.role} $${r.rate}`).join(' · ') : null
    return { field, status, value }
  }
  return { field, status: (field?.status ?? 'empty') as FieldStatus, value: displayValue(field) }
}

// ---------------------------------------------------------------------------
// Desktop column
// ---------------------------------------------------------------------------

export function EvidencePanel({ id }: { id: string }) {
  const close = (e: React.MouseEvent) => {
    useTray.getState().select(null)
    // Keep keyboard users where they were: back on the row they inspected.
    if (e.detail === 0) requestAnimationFrame(() => focusRow(id, { keyboard: true }))
  }
  return (
    <aside data-te-evidence aria-label={`Evidence for ${labelOf(id)}`} className="flex h-full min-h-0 flex-col border-r border-rule bg-ground">
      <LiveStrip />
      <EvidenceHeader id={id} onClose={close} />
      <EvidenceScroll id={id} />
      <EvidenceFooter id={id} />
    </aside>
  )
}

/** Slim "Reading D2, D7…" line, so the agent's work stays visible without taking the column back. */
function LiveStrip() {
  const live = useLiveSources()
  const docs = useApp((s) => s.docs)
  const reading = docs.filter((d) => live.reading.has(d.id))
  const ids = reading.map((d) => d.id).join(',')
  // Linger a moment so quick tool calls don't flicker the strip.
  const [shown, setShown] = useState(reading)
  useEffect(() => {
    if (reading.length) {
      setShown(reading)
      return
    }
    const t = setTimeout(() => setShown([]), 900)
    return () => clearTimeout(t)
    // keyed on the ids, not the array identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids])
  const active = reading.length > 0

  return (
    <AnimatePresence initial={false}>
      {shown.length > 0 && (
        <motion.div
          key="live"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.22, ease }}
          className="shrink-0 overflow-clip"
        >
          <div className="flex h-8 items-center gap-2 border-b border-cobalt/15 bg-cobalt-soft/60 px-4 text-[12px]" role="status" aria-live="polite">
            <span className="relative flex size-1.5 shrink-0" aria-hidden>
              {active && <span className="absolute inset-0 animate-ping rounded-full bg-cobalt opacity-70" />}
              <span className={cn('relative size-1.5 rounded-full', active ? 'bg-cobalt' : 'bg-ink-3')} />
            </span>
            <span className={cn('min-w-0 truncate font-medium', active ? 'text-cobalt-ink' : 'text-ink-3')} title={shown.map((d) => d.name).join(', ')}>
              {active ? 'Reading' : 'Read'} <span className="font-mono text-[11px]">{shown.map((d) => d.id).join(', ')}</span>
              {active ? '…' : ''}
            </span>
            <button
              type="button"
              onClick={() => useTray.getState().select(null)}
              className="ml-auto shrink-0 rounded-sm text-ink-2 underline-offset-2 hover:text-ink hover:underline"
            >
              Show sources
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function EvidenceHeader({ id, onClose, sheet }: { id: string; onClose?: (e: React.MouseEvent) => void; sheet?: boolean }) {
  const { status, value } = useFieldView(id)
  const wash = useWash(id)
  const narrative = fieldDefs[id]?.kind === 'narrative'
  const Title = sheet ? DrawerTitle : 'h2'

  return (
    <header className={cn('shrink-0 border-b border-rule px-4 pt-3 pb-3.5 transition-colors', wash && 'field-wash')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="eyebrow text-[10px]">Evidence for</p>
          <Title className="mt-0.5 text-[15px] leading-snug font-semibold text-ink">{labelOf(id)}</Title>
        </div>
        {onClose && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="-mt-0.5 -mr-1.5 size-8 shrink-0 text-ink-2" onClick={onClose} aria-label="Close evidence">
                <X className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Close (Esc)</TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <StatusChip status={status} />
        {value && !narrative && <span className="min-w-0 text-[14px] leading-snug break-words text-ink">{value}</span>}
      </div>
      {sheet && <DrawerDescription className="sr-only">The documents behind this value, with the quoted text marked.</DrawerDescription>}
    </header>
  )
}

function EvidenceScroll({ id }: { id: string }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  // A new field starts at the top.
  useEffect(() => {
    const viewport = bodyRef.current?.closest('[data-slot=scroll-area-viewport]')
    if (viewport) viewport.scrollTop = 0
  }, [id])
  return (
    <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={id}
          ref={bodyRef}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16, ease }}
          className="flex flex-col gap-5 px-4 pt-4 pb-6"
        >
          <EvidenceBody id={id} />
        </motion.div>
      </AnimatePresence>
    </ScrollArea>
  )
}

const Lead = ({ children }: { children: ReactNode }) => <p className="text-[13px] leading-relaxed text-ink-2">{children}</p>
const Note = ({ children }: { children: ReactNode }) => <p className="-mt-3 text-[12px] leading-relaxed text-ink-3">{children}</p>

/** Open the row's own editor (FieldRow's pencil). */
function editInRow(id: string) {
  useApp.getState().setView('fields')
  useTray.getState().setSheetOpen(false)
  requestAnimationFrame(() => {
    const row = rowOf(id)
    row?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    row?.querySelector<HTMLButtonElement>('button[aria-label^="Edit "]')?.click()
  })
}

function EvidenceBody({ id }: { id: string }) {
  const { field, status } = useFieldView(id)
  const rates = useApp((s) => s.rates)
  const { busy } = useAgent()
  const { question, skipped, pending } = useQuestionState()
  const item = pending.find((i) => i.fieldId === id)
  const draft = useTray((s) => (question ? s.drafts[question.id]?.[id] : undefined))
  const desktop = useMediaQuery('(min-width: 1024px)')

  const answerInTray = () => {
    askAbout(id, question, !!skipped)
    if (!desktop) {
      useTray.getState().setSheetOpen(false)
      useApp.getState().setView('fields')
    }
  }

  if (id === 'hourlyRates') {
    const rows = rates.rows.filter((r) => r.source)
    if (!rows.length) return <Lead>{busy ? 'Waiting for the agent. The rate card shows up here once it reads it.' : 'Not filled yet.'}</Lead>
    const docId = rows[0].source!.docId
    const locator = `Rates!${rows.map((r) => r.source!.locator!.replace(/^Rates!/, '')).join(', ')}`
    return (
      <>
        <Lead>One row per role, read from the rate card.</Lead>
        <SourceCard group={{ key: `${docId}|rates`, docId, locator, quotes: rows.map((r) => r.source!.quote) }} caption="Rates!B2:C5" />
      </>
    )
  }

  if (!field || status === 'empty') {
    return (
      <>
        <Lead>{busy ? 'Waiting for the agent. Its evidence shows up here as soon as it fills this.' : 'Not filled yet.'}</Lead>
        {field?.note && <Note>{field.note}</Note>}
      </>
    )
  }

  if (status === 'conflict') {
    const isDate = fieldDefs[id]?.kind === 'date'
    return (
      <>
        <Lead>
          {!item
            ? 'Two documents disagree. The agent will ask you which to use.'
            : draft
              ? `You picked ${field.candidates?.find((c) => String(c.value) === draft)?.display ?? 'one'}. Send your answers in the tray to apply it.`
              : `Two documents disagree. Compare them, then choose ${isDate ? 'a date' : 'one'}.`}
        </Lead>
        {item?.help && <Note>{item.help}</Note>}
        {(field.candidates ?? []).map((c) => {
          const chosen = !!item && draft === String(c.value)
          return (
            <section key={String(c.value)} className="flex min-w-0 flex-col gap-2.5" aria-label={c.display}>
              <div className="flex min-h-8 items-center justify-between gap-2">
                <h3 className="min-w-0 text-[14px] font-semibold text-ink">{c.display}</h3>
                {item && question && (
                  <Button
                    variant={chosen ? 'secondary' : 'outline'}
                    size="sm"
                    className={cn('h-7 shrink-0 gap-1 px-2.5 text-[12px]', chosen ? 'bg-cobalt-soft text-cobalt-ink hover:bg-cobalt-soft' : 'bg-panel')}
                    aria-pressed={chosen}
                    onClick={() => {
                      useTray.getState().setDraft(question.id, id, String(c.value))
                      answerInTray()
                    }}
                  >
                    {chosen ? (
                      <>
                        <Check className="size-3.5" /> Chosen
                      </>
                    ) : isDate ? (
                      'Use this date'
                    ) : (
                      'Use this value'
                    )}
                  </Button>
                )}
              </div>
              {groupSources(c.sources).map((g) => (
                <SourceCard key={g.key} group={g} />
              ))}
            </section>
          )
        })}
      </>
    )
  }

  if (status === 'missing') {
    const groups = groupSources(field.sources)
    return (
      <>
        <Lead>Not found in any document.</Lead>
        {field.note && <Note>{field.note}</Note>}
        <Button variant="outline" size="sm" className="h-8 w-fit bg-panel text-[12px]" onClick={() => (item ? answerInTray() : editInRow(id))}>
          {item ? 'Answer in the tray' : 'Type it in'}
        </Button>
        {groups.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <h3 className="eyebrow text-[10px]">Closest mention</h3>
            {groups.map((g) => (
              <SourceCard key={g.key} group={g} />
            ))}
          </div>
        )}
      </>
    )
  }

  const groups = groupSources(field.sources)
  const fromUser = field.by === 'user'
  const narrative = fieldDefs[id]?.kind === 'narrative'
  const edited = fromUser && field.note?.startsWith('Edited')

  if (fromUser && !groups.length) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-rule px-4 py-4">
        <FileX2 className="size-5 text-ink-3" aria-hidden />
        <div className="flex flex-col gap-1">
          <p className="text-[13px] font-medium text-ink">No document behind this value</p>
          <p className="text-[12px] leading-relaxed text-ink-3">You provided it, so there’s nothing to check against. It goes into the letter as you typed it.</p>
        </div>
        {fieldDefs[id] && fieldDefs[id].kind !== 'narrative' && fieldDefs[id].kind !== 'boolean' && fieldDefs[id].kind !== 'enum' && (
          <Button variant="outline" size="sm" className="h-7 bg-panel px-2.5 text-[12px]" onClick={() => editInRow(id)}>
            Edit value
          </Button>
        )}
      </div>
    )
  }

  return (
    <>
      {status === 'drafting' ? (
        <Lead>The agent is writing this now, from these passages.</Lead>
      ) : edited ? (
        <Lead>You changed this value. Below is what the agent had cited.</Lead>
      ) : fromUser ? (
        <Lead>You chose this {fieldDefs[id]?.kind === 'date' ? 'date' : 'value'}. The document behind it:</Lead>
      ) : narrative ? (
        <Lead>Every fact in the summary comes from these passages.</Lead>
      ) : status === 'verified' ? (
        <Lead>{groups.length > 1 ? `Found in ${groups.length} places. Check the marked text.` : 'Check the marked text.'}</Lead>
      ) : null}
      {field.note && !fromUser && <Note>{field.note}</Note>}
      {!groups.length && <Lead>No source cited.</Lead>}
      {groups.map((g) => (
        <SourceCard key={g.key} group={g} />
      ))}
    </>
  )
}

function SourceCard({ group, caption }: { group: Group; caption?: string }) {
  const doc = useApp((s) => s.docs.find((d) => d.id === group.docId))
  const hovered = useTray((s) => s.hoverSource === group.key)
  const focus = useTray((s) => (s.focusSource?.key === group.key ? s.focusSource.n : 0))
  const [flash, setFlash] = useState(false)
  const ref = useRef<HTMLElement>(null)
  const loc = caption ?? locatorText({ ...group, quote: '' })

  // A citation click brings its card forward for a moment.
  useEffect(() => {
    if (!focus) return
    const t1 = setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 60)
    setFlash(true)
    const t2 = setTimeout(() => setFlash(false), 1600)
    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [focus])
  // Pointing at the row's chip brings the card into view if it's scrolled away.
  useEffect(() => {
    if (!hovered) return
    const t = setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 160)
    return () => clearTimeout(t)
  }, [hovered])

  const lit = hovered || flash
  return (
    <figure
      ref={ref}
      data-source-key={group.key}
      onMouseEnter={() => useTray.getState().setHoverCardDoc(group.docId)}
      onMouseLeave={() => useTray.getState().setHoverCardDoc(null)}
      className={cn(
        '-mx-1.5 flex min-w-0 scroll-my-3 flex-col gap-2 rounded-lg px-1.5 pt-1 pb-1.5 transition-[box-shadow,background-color] duration-200',
        lit && 'bg-cobalt-soft/50 shadow-[0_0_0_1.5px_var(--cobalt)]'
      )}
    >
      <figcaption className="flex min-w-0 items-baseline gap-1.5 text-[12px]">
        <span className="font-mono text-[11px] font-semibold text-cobalt-ink">{group.docId}</span>
        <span className="min-w-0 truncate text-ink-2" title={doc?.name}>
          {doc ? shortName(doc.name) : group.docId}
        </span>
        <span className="ml-auto shrink-0 font-mono text-[11px] text-ink-3">{loc}</span>
      </figcaption>
      {group.quotes.length > 1 ? (
        <MultiQuotePage group={group} />
      ) : (
        <EvidencePage docId={group.docId} page={group.page} quote={group.quotes[0]} locator={group.locator} compact className="rounded-[3px]" />
      )}
      <button
        type="button"
        onClick={() => useApp.getState().openSource({ docId: group.docId, page: group.page, quote: group.quotes[0], locator: group.locator })}
        className="flex w-fit items-center gap-1.5 rounded-sm text-[12px] font-medium text-cobalt-ink underline-offset-2 hover:underline"
      >
        <Maximize2 className="size-3" /> Open full document
      </button>
    </figure>
  )
}

const norm = (s: string) => s.replace(/[’‘]/g, "'").replace(/[“”]/g, '"').toLowerCase()

/** Mark every quote found in a block (EvidencePage marks one). */
function markAll(text: string, quotes: string[]): ReactNode {
  const hay = norm(text)
  const ranges = quotes
    .map((q) => ({ at: hay.indexOf(norm(q)), len: q.length }))
    .filter((r) => r.at >= 0)
    .sort((a, b) => a.at - b.at)
  if (!ranges.length) return text
  const out: ReactNode[] = []
  let last = 0
  ranges.forEach((r, i) => {
    if (r.at < last) return
    out.push(text.slice(last, r.at))
    out.push(
      <mark key={i} className="rounded-[2px] bg-marker px-0.5 text-marker-ink">
        {text.slice(r.at, r.at + r.len)}
      </mark>
    )
    last = r.at + r.len
  })
  out.push(text.slice(last))
  return out
}

function MultiQuotePage({ group }: { group: Group }) {
  const doc = useApp((s) => s.docs.find((d) => d.id === group.docId))
  const content = doc?.content.find((p) => p.n === group.page) ?? doc?.content[0]
  if (!doc || !content) return <EvidencePage docId={group.docId} page={group.page} quote={group.quotes[0]} locator={group.locator} compact />
  return (
    <div className="rounded-[3px] bg-paper px-5 py-5 font-serif text-[13px] leading-[1.6] text-paper-ink" style={{ boxShadow: 'var(--shadow-page)' }}>
      <div className="mb-3 flex justify-between gap-3 font-sans text-[10px] tracking-wide text-paper-ink/50 uppercase">
        <span className="truncate">{doc.name}</span>
        <span className="shrink-0">{doc.kind === 'eml' ? 'Message' : `Page ${content.n} of ${doc.pages}`}</span>
      </div>
      <div className="flex flex-col gap-2">
        {content.blocks.map((b, i) => (
          <p key={i} className={cn(i === 0 && 'font-semibold')}>
            {markAll(b, group.quotes)}
          </p>
        ))}
      </div>
    </div>
  )
}

function EvidenceFooter({ id, sheet }: { id: string; sheet?: boolean }) {
  const { status } = useFieldView(id)
  const i = fieldOrder.indexOf(id)
  const prev = fieldOrder[i - 1]
  const next = fieldOrder[i + 1]
  const canApprove = status === 'verified' || status === 'user_answered'
  const step = (d: 1 | -1) => {
    stepField(d)
    if (sheet) requestAnimationFrame(() => rowOf(fieldOrder[i + d])?.scrollIntoView({ block: 'center' }))
  }

  const nav = (d: 1 | -1, target: string | undefined) => {
    const Icon = d < 0 ? ChevronUp : ChevronDown
    const label = d < 0 ? 'Previous field' : 'Next field'
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" size="icon" className="size-8 bg-panel text-ink-2" disabled={!target} onClick={() => step(d)} aria-label={target ? `${label}: ${labelOf(target)}` : label}>
            <Icon className="size-4" />
          </Button>
        </TooltipTrigger>
        {target && (
          <TooltipContent side="top">
            {labelOf(target)} <span className="ml-1 font-mono opacity-70">{d < 0 ? '↑' : '↓'}</span>
          </TooltipContent>
        )}
      </Tooltip>
    )
  }

  return (
    <div className={cn('flex shrink-0 items-center gap-1.5 border-t border-rule px-3 py-2.5', sheet ? 'bg-panel pb-[max(10px,env(safe-area-inset-bottom))]' : 'bg-ground')}>
      {nav(-1, prev)}
      {nav(1, next)}
      <span className="num ml-1 text-[12px] text-ink-3">
        {i + 1} of {fieldOrder.length}
      </span>
      <div className="ml-auto flex items-center">
        {canApprove ? (
          <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => useApp.getState().approveField(id)}>
            <BadgeCheck className="size-3.5" /> Approve
          </Button>
        ) : status === 'approved' ? (
          <Button variant="ghost" size="sm" className="h-8 text-[12px] text-ink-2" onClick={() => useApp.getState().unapproveField(id)}>
            Undo approve
          </Button>
        ) : null}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Phones: the same evidence in a bottom sheet
// ---------------------------------------------------------------------------

export function EvidenceSheet() {
  const selected = useTray((s) => s.selected)
  const open = useTray((s) => s.sheetOpen)
  const setOpen = useTray((s) => s.setSheetOpen)
  // Keep the last field while the sheet animates closed.
  const [shown, setShown] = useState(selected)
  useEffect(() => {
    if (selected) setShown(selected)
  }, [selected])

  return (
    <Drawer open={open && !!selected} onOpenChange={setOpen}>
      <DrawerContent className="h-[85dvh] max-h-[85dvh] border-rule bg-ground" data-te-evidence>
        {shown && (
          <div className="flex min-h-0 flex-1 flex-col">
            <EvidenceHeader id={shown} sheet onClose={() => setOpen(false)} />
            <EvidenceScroll id={shown} />
            <EvidenceFooter id={shown} sheet />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  )
}
