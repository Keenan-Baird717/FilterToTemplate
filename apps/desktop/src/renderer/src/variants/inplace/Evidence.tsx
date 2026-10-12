import { ArrowLeft, BadgeCheck, Check, Maximize2, Plus, Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, type ReactNode } from 'react'
import { useDropzone } from 'react-dropzone'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { FieldStatus, SourceRef } from '../../../../shared/protocol'
import { EvidencePage } from '@/components/EvidencePage'
import { DocBadge, StatusChip, locatorText } from '@/components/status'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useAgent, useLiveSources } from '@/lib/agent'
import { citationsByDoc, displayValue, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { goToField, isWide, labelOf, sourceKey, useAsk, useInplace } from './state'

// The left pane: the documents, alive while the agent reads and cites them;
// or, once a value is selected, the evidence behind that value.

const ease = [0.2, 0, 0, 1] as const
const shortName = (name: string) => name.replace(/\.[^.]+$/, '')
const parserLabel = { 'text-layer': 'Text layer', ocr: 'OCR', word: 'Word', sheet: 'Sheet', email: 'Email' } as const

export function EvidencePane() {
  const selected = useInplace((s) => s.selected)
  const addFiles = useApp((s) => s.addFiles)
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (!files.length) return
      addFiles(files.map((f) => ({ name: f.name })))
      useInplace.getState().select(null)
    }
  })

  return (
    <aside {...getRootProps({ className: 'relative h-full min-h-0 overflow-clip bg-ground' })} aria-label="Evidence">
      <input {...getInputProps({ id: 'source-files' })} />
      <AnimatePresence initial={false}>
        {selected ? (
          <motion.div
            key="evidence"
            className="absolute inset-0 flex flex-col"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            transition={{ duration: 0.22, ease }}
          >
            <FieldEvidence id={selected} />
          </motion.div>
        ) : (
          <motion.div
            key="documents"
            className="absolute inset-0 flex flex-col"
            initial={{ opacity: 0, x: -24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.22, ease }}
          >
            <DocumentList onAdd={open} />
          </motion.div>
        )}
      </AnimatePresence>
      {isDragActive && (
        <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-xl border-2 border-dashed border-cobalt bg-cobalt-soft/90 text-[13px] font-medium text-cobalt-ink">
          Drop to add to this project
        </div>
      )}
    </aside>
  )
}

// ---------------------------------------------------------------------------
// Nothing selected: the documents, with live reading / citing state
// ---------------------------------------------------------------------------

function DocumentList({ onAdd }: { onAdd: () => void }) {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const live = useLiveSources()
  const cites = citationsByDoc(fields, rates)
  const pages = docs.reduce((n, d) => n + d.pages, 0)
  const reading = docs.filter((d) => live.reading.has(d.id))

  return (
    <>
      <header className="flex items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">Documents</h2>
          <p className="num text-[12px] text-ink-3">
            {docs.length} files · {pages} pages
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={onAdd} aria-label="Add documents">
          <Plus className="size-4" />
        </Button>
      </header>

      <div className="flex min-h-9 items-center px-4 text-[12px]" aria-live="polite">
        {reading.length ? (
          <span className="flex min-w-0 items-center gap-2 text-cobalt-ink">
            <span className="size-1.5 shrink-0 animate-pulse rounded-full bg-cobalt" aria-hidden />
            <span className="truncate font-medium">
              Agent is reading {reading.length === 1 ? shortName(reading[0].name) : `${reading.length} documents`}
            </span>
          </span>
        ) : live.busy ? (
          <span className="text-ink-3">The agent is working. Documents light up as it reads them.</span>
        ) : (
          <span className="text-ink-3">Select a value to see its evidence.</span>
        )}
      </div>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <ul className="flex flex-col gap-px px-2 pb-3">
          {docs.map((d) => {
            const isReading = live.reading.has(d.id)
            const justCited = !isReading && live.recent.has(d.id)
            const values = new Set((cites[d.id] ?? []).map((c) => c.fieldId)).size
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={d.status === 'parsing'}
                  onClick={() => useApp.getState().openSource({ docId: d.id, page: d.content[0]?.n })}
                  aria-label={`${d.name}${isReading ? ', being read' : ''}${values ? `, cited by ${values} value${values === 1 ? '' : 's'}` : ''}`}
                  className={cn(
                    'flex w-full min-w-0 items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors duration-300',
                    isReading ? 'bg-cobalt-soft' : justCited ? 'bg-ok-soft/70' : 'hover:bg-panel/80',
                    d.status === 'parsing' && 'cursor-default'
                  )}
                >
                  <DocBadge kind={d.kind} className="mt-px" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{d.name}</span>
                    {d.status === 'parsing' ? (
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-rule">
                          <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${d.progress ?? 0}%` }} />
                        </span>
                        <span className="num font-mono text-[10px] text-ink-3">
                          {d.parser === 'ocr' ? 'OCR' : 'Parsing'} {d.progress ?? 0}%
                        </span>
                      </span>
                    ) : (
                      <span className="flex items-center justify-between gap-2 text-[11px]">
                        {isReading ? (
                          <span className="flex items-center gap-1.5 font-medium text-cobalt-ink">
                            <ReadingDots /> Reading
                          </span>
                        ) : justCited ? (
                          <span className="flex items-center gap-1 font-medium text-ok">
                            <Check className="size-3" /> Just cited
                          </span>
                        ) : (
                          <span className="num truncate text-ink-3">
                            {d.kind === 'xlsx' ? '1 sheet' : d.kind === 'eml' ? '1 message' : `${d.pages} pages`} · {parserLabel[d.parser]}
                          </span>
                        )}
                        {values > 0 && (
                          <motion.span
                            key={values}
                            initial={{ opacity: 0.4, y: -3 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25 }}
                            className="num shrink-0 font-mono text-[10.5px] text-ink-3"
                          >
                            {values} value{values === 1 ? '' : 's'}
                          </motion.span>
                        )}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </ScrollArea>

      <div className="px-3 pt-1 pb-3">
        <button
          type="button"
          onClick={onAdd}
          className="flex w-full items-center gap-2.5 rounded-lg border border-dashed border-ink-3/40 px-3 py-2 text-left text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:bg-panel"
        >
          <Upload className="size-4 shrink-0 text-ink-3" />
          <span className="min-w-0">
            <span className="block font-medium">Add documents</span>
            <span className="block truncate text-ink-3">Drop PDFs, Word, Excel or email here</span>
          </span>
        </button>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// A value selected: its evidence
// ---------------------------------------------------------------------------

function FieldEvidence({ id }: { id: string }) {
  const field = useApp((s) => s.fields[id])
  const rates = useApp((s) => s.rates)
  const focusSource = useInplace((s) => s.focusSource)
  const bodyRef = useRef<HTMLDivElement>(null)
  const isRates = id === 'hourlyRates'
  const status: FieldStatus = isRates ? rates.status : (field?.status ?? 'empty')
  const value = isRates ? (rates.rows.length ? rates.rows.map((r) => `${r.role} $${r.rate}`).join(' · ') : null) : displayValue(field)
  const narrative = fieldDefs[id]?.kind === 'narrative'

  // A new field starts at the top; a hovered citation brings its card into view.
  useEffect(() => {
    const viewport = bodyRef.current?.closest('[data-slot=scroll-area-viewport]')
    if (viewport) viewport.scrollTop = 0
  }, [id])
  useEffect(() => {
    if (!focusSource) return
    const el = bodyRef.current?.querySelector<HTMLElement>(`[data-source-key="${CSS.escape(focusSource)}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [focusSource, id])

  return (
    <>
      <header className="flex flex-col gap-2 border-b border-rule px-4 pt-3 pb-3.5">
        <button
          type="button"
          onClick={() => useInplace.getState().select(null)}
          className="-ml-1.5 flex w-fit items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-ink-2 transition-colors hover:bg-panel hover:text-ink"
        >
          <ArrowLeft className="size-3.5" /> All documents
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="eyebrow">Evidence for</p>
            <h2 className="mt-0.5 text-[15px] leading-snug font-semibold">{labelOf(id)}</h2>
          </div>
          <StatusChip status={status} className="mt-0.5" />
        </div>
        {value && !narrative && <p className="text-[13px] leading-snug break-words text-ink">{value}</p>}
      </header>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <motion.div
          key={id}
          ref={bodyRef}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease }}
          className="flex flex-col gap-5 px-4 pt-4 pb-6"
        >
          <EvidenceBody id={id} />
        </motion.div>
      </ScrollArea>

      <EvidenceFooter id={id} status={status} />
    </>
  )
}

interface Group {
  docId: string
  page?: number
  locator?: string
  quotes: string[]
}

function groupSources(sources: SourceRef[]): Group[] {
  const out: Group[] = []
  for (const s of sources) {
    const g = out.find((x) => x.docId === s.docId && x.page === s.page && x.locator === s.locator)
    if (g) {
      if (!g.quotes.includes(s.quote)) g.quotes.push(s.quote)
    } else out.push({ docId: s.docId, page: s.page, locator: s.locator, quotes: [s.quote] })
  }
  return out
}

/** Open the row's own editor (FieldRow's pencil) for a value no question covers. */
function editInRow(id: string) {
  goToField(id)
  setTimeout(() => document.getElementById(`field-${id}`)?.querySelector<HTMLButtonElement>('button[aria-label^="Edit "]')?.click(), 120)
}

/** Three dots that pulse in turn while a document is being read. */
function ReadingDots() {
  return (
    <span className="flex items-center gap-[3px]" aria-hidden>
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1 rounded-full bg-cobalt"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </span>
  )
}

const Lead = ({ children }: { children: ReactNode }) => <p className="text-[13px] leading-relaxed text-ink-2">{children}</p>
const Note = ({ children }: { children: ReactNode }) => <p className="text-[12px] leading-relaxed text-ink-3">{children}</p>

function EvidenceBody({ id }: { id: string }) {
  const field = useApp((s) => s.fields[id])
  const rates = useApp((s) => s.rates)
  const { busy } = useAgent()
  const ask = useAsk()
  const item = ask.items.find((i) => i.fieldId === id)

  if (id === 'hourlyRates') {
    const rows = rates.rows.filter((r) => r.source)
    if (!rows.length) return <Lead>{busy ? 'The agent is working on this now.' : 'Not filled yet.'}</Lead>
    const locator = `Rates!${rows.map((r) => r.source!.locator!.replace(/^Rates!/, '')).join(', ')}`
    return (
      <>
        <Lead>One row per role, read from the rate card.</Lead>
        <SourceCard group={{ docId: rows[0].source!.docId, locator, quotes: rows.map((r) => r.source!.quote) }} caption="Rates!B2:C5" />
      </>
    )
  }

  if (!field || field.status === 'empty') {
    return (
      <>
        <Lead>{busy ? 'The agent is working on this now.' : 'Not filled yet.'}</Lead>
        {field?.note && <Note>{field.note}</Note>}
      </>
    )
  }

  if (field.status === 'conflict') {
    return (
      <>
        <Lead>Two documents disagree.{item ? ' Compare them, then pick one.' : ''}</Lead>
        {item?.help && <Note>{item.help}</Note>}
        {(field.candidates ?? []).map((c) => {
          const chosen = !!item && ask.question && ask.drafts[id] === String(c.value)
          return (
            <section key={String(c.value)} className="flex flex-col gap-2.5" aria-label={c.display}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[14px] font-semibold text-ink">{c.display}</h3>
                {item && ask.question && (
                  <Button
                    variant={chosen ? 'secondary' : 'outline'}
                    size="sm"
                    className={cn('h-7 gap-1 px-2.5 text-[12px]', chosen && 'text-ok')}
                    aria-pressed={chosen || false}
                    onClick={() => {
                      useInplace.getState().setDraft(ask.question!.id, id, String(c.value))
                      // On a phone the row is on another tab: take the user back to it.
                      if (!isWide()) goToField(id)
                    }}
                  >
                    {chosen ? (
                      <>
                        <Check className="size-3.5" /> Chosen
                      </>
                    ) : fieldDefs[id]?.kind === 'date' ? (
                      'Use this date'
                    ) : (
                      'Use this value'
                    )}
                  </Button>
                )}
              </div>
              {groupSources(c.sources).map((g) => (
                <SourceCard key={sourceKey(g)} group={g} />
              ))}
            </section>
          )
        })}
      </>
    )
  }

  if (field.status === 'missing') {
    return (
      <>
        <Lead>Not found in any document.</Lead>
        {field.note && <Note>{field.note}</Note>}
        {fieldDefs[id] && (
          <Button variant="outline" size="sm" className="h-8 w-fit text-[12px]" onClick={() => (item ? goToField(id, { focus: true }) : editInRow(id))}>
            Fill it in
          </Button>
        )}
        {field.sources.length > 0 && (
          <div className="flex flex-col gap-2.5">
            <h3 className="eyebrow">Closest mention</h3>
            {groupSources(field.sources).map((g) => (
              <SourceCard key={sourceKey(g)} group={g} />
            ))}
          </div>
        )}
      </>
    )
  }

  const groups = groupSources(field.sources)
  const fromUser = field.by === 'user'
  return (
    <>
      {field.status === 'drafting' && <Lead>The agent is writing this now, from these passages.</Lead>}
      {fromUser && !groups.length && <Lead>You provided this value. It doesn’t come from a document.</Lead>}
      {fromUser && groups.length > 0 && <Lead>You chose this value. The document behind it:</Lead>}
      {!fromUser && field.status !== 'drafting' && fieldDefs[id]?.kind === 'narrative' && <Lead>Every fact in the summary comes from these passages.</Lead>}
      {field.note && <Note>{field.note}</Note>}
      {!fromUser && !groups.length && <Lead>No source cited.</Lead>}
      {groups.map((g) => (
        <SourceCard key={sourceKey(g)} group={g} />
      ))}
    </>
  )
}

function SourceCard({ group, caption }: { group: Group; caption?: string }) {
  const doc = useApp((s) => s.docs.find((d) => d.id === group.docId))
  const key = sourceKey(group)
  const focused = useInplace((s) => s.focusSource === key)
  const loc = caption ?? locatorText({ ...group, quote: '' })

  return (
    <figure
      data-source-key={key}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md transition-shadow duration-300',
        focused && 'shadow-[0_0_0_2px_var(--ground),0_0_0_4px_var(--cobalt)]'
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
        className="flex w-fit items-center gap-1.5 rounded text-[12px] font-medium text-cobalt-ink hover:underline"
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

function EvidenceFooter({ id, status }: { id: string; status: FieldStatus }) {
  const live = useLiveSources()
  const docs = useApp((s) => s.docs)
  const reading = docs.filter((d) => live.reading.has(d.id))
  const recent = docs.filter((d) => !live.reading.has(d.id) && live.recent.has(d.id))
  const canApprove = status === 'verified' || status === 'user_answered'
  const names = (list: typeof docs) => (list.length === 1 ? shortName(list[0].name) : `${list.length} documents`)

  return (
    <div className="shrink-0 border-t border-rule bg-ground">
      <AnimatePresence initial={false}>
        {(reading.length > 0 || recent.length > 0) && (
          <motion.div
            key="live"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease }}
            className="overflow-hidden"
          >
            <button
              type="button"
              onClick={() => useInplace.getState().select(null)}
              className="flex w-full min-w-0 items-center gap-2 border-b border-rule px-4 py-2 text-left text-[12px] transition-colors hover:bg-panel"
            >
              <span className={cn('size-1.5 shrink-0 rounded-full', reading.length ? 'animate-pulse bg-cobalt' : 'bg-ok')} aria-hidden />
              {reading.length ? (
                <span className="min-w-0 truncate text-cobalt-ink">Reading {names(reading)}</span>
              ) : (
                <span className="min-w-0 truncate text-ink-2">Just cited {names(recent)}</span>
              )}
              <span className="ml-auto shrink-0 text-cobalt-ink">All documents</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {canApprove ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="text-[12px] text-ink-3">Looks right?</span>
          <Button size="sm" className="h-8 gap-1.5 text-[12px]" onClick={() => useApp.getState().approveField(id)}>
            <BadgeCheck className="size-3.5" /> Approve
          </Button>
        </div>
      ) : status === 'approved' ? (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5">
          <span className="flex items-center gap-1.5 text-[12px] font-medium text-ok">
            <BadgeCheck className="size-3.5" /> Approved
          </span>
          <Button variant="ghost" size="sm" className="h-8 text-[12px] text-ink-2" onClick={() => useApp.getState().unapproveField(id)}>
            Undo
          </Button>
        </div>
      ) : null}
    </div>
  )
}
