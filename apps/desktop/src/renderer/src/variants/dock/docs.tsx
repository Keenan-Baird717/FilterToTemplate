import { Check, FileText } from 'lucide-react'
import { useMemo } from 'react'
import { fieldDefs, type DemoDocument } from '../../../../agent-core/demo-data'
import type { SourceRef } from '../../../../shared/protocol'
import { markQuote } from '@/components/EvidencePage'
import { DocBadge, locatorText } from '@/components/status'
import { useLiveSources } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { docSize, shortName, useDock } from './model'

// Document chips (the slim dock bar) and document cards (the filmstrip and the
// phone Sources tab), plus the shared "what is the agent touching" signal.

export type Cite = { fieldId: string; source: SourceRef }

export interface DockActivity {
  reading: Set<string>
  recent: Map<string, number>
  busy: boolean
  /** Files the user added in this session that are still parsing. */
  parsing: DemoDocument[]
  /** Something worth showing: the agent reads or cites, or new files parse. */
  active: boolean
}

export function useDockActivity(): DockActivity {
  const live = useLiveSources()
  const docs = useApp((s) => s.docs)
  const added = useDock((s) => s.added)
  return useMemo(() => {
    const parsing = docs.filter((d) => d.status === 'parsing' && added.includes(d.id))
    const agentTouching = live.busy && (live.reading.size > 0 || live.recent.size > 0)
    return { ...live, parsing, active: agentTouching || parsing.length > 0 }
  }, [live, docs, added])
}

/** New files first, then what the agent is reading, then what it just cited, then the rest. */
export function orderDocs(docs: DemoDocument[], act: DockActivity) {
  const rank = (d: DemoDocument) => (act.parsing.includes(d) ? 3 : act.reading.has(d.id) ? 2 : act.recent.has(d.id) ? 1 : 0)
  return docs
    .map((d, i) => ({ d, i, r: rank(d) }))
    .sort((a, b) => b.r - a.r || a.i - b.i)
    .map((x) => x.d)
}

export function firstCite(cites: Cite[]) {
  return [...cites].sort((a, b) => (a.source.page ?? 0) - (b.source.page ?? 0))[0]
}

export function openDoc(doc: DemoDocument, cites: Cite[]) {
  const c = firstCite(cites)
  useApp.getState().openSource(
    c ? { docId: doc.id, page: c.source.page, quote: c.source.quote, locator: c.source.locator } : { docId: doc.id, page: doc.content[0]?.n }
  )
}

const fieldLabel = (id: string) => (id === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[id]?.label ?? id))

export function ReadingDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex size-1.5 shrink-0', className)} aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-cobalt opacity-60" />
      <span className="relative inline-flex size-1.5 rounded-full bg-cobalt" />
    </span>
  )
}

function ParseBar({ progress, className }: { progress: number; className?: string }) {
  return (
    <span className={cn('block h-1 overflow-hidden rounded-full bg-rule', className)}>
      <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${progress}%` }} />
    </span>
  )
}

interface DocStateProps {
  doc: DemoDocument
  cites: Cite[]
  reading: boolean
  recentAt?: number
  /** A citation chip for this document is hovered somewhere. */
  pointed: boolean
  /** Open in the source drawer. */
  open: boolean
}

/** One document in the slim dock bar. */
export function DocChip({ doc, cites, reading, recentAt, pointed, open }: DocStateProps) {
  const parsing = doc.status === 'parsing'
  const count = cites.length
  return (
    <button
      type="button"
      data-doc={doc.id}
      onClick={() => openDoc(doc, cites)}
      onMouseEnter={() => useDock.getState().setHoverDoc(doc.id)}
      onMouseLeave={() => useDock.getState().setHoverDoc(null)}
      title={doc.name}
      aria-label={`${doc.name}${reading ? ', the agent is reading it' : ''}${count ? `, cited ${count} times` : ''}${parsing ? `, parsing ${doc.progress ?? 0}%` : ''}`}
      className={cn(
        'relative inline-flex h-7 shrink-0 items-center gap-1.5 overflow-hidden rounded-md border pr-2 pl-1 text-[12px] transition-[color,background-color,border-color,box-shadow] duration-200',
        reading
          ? 'dock-reading border-cobalt/50 bg-cobalt-soft text-ink'
          : pointed || open
            ? 'border-cobalt/50 bg-cobalt-soft text-ink ring-2 ring-cobalt/25'
            : 'border-rule bg-panel text-ink-2 hover:border-cobalt/40 hover:text-ink'
      )}
    >
      {recentAt ? <span key={recentAt} className="dock-flash pointer-events-none absolute inset-0" aria-hidden /> : null}
      <DocBadge kind={doc.kind} className="relative h-4 w-8 rounded-[3px] text-[9px]" />
      <span className="relative max-w-[150px] truncate">{shortName(doc.name)}</span>
      {parsing ? (
        <ParseBar progress={doc.progress ?? 0} className="relative w-9" />
      ) : reading ? (
        <ReadingDot className="relative" />
      ) : count > 0 ? (
        <span className="num relative font-mono text-[10px] text-ink-3">{count}</span>
      ) : null}
    </button>
  )
}

/** A document card: name, what state it's in, a small preview of its first cited page, and which values cite it. */
export function DocCard({ doc, cites, reading, recentAt, pointed, open, wide }: DocStateProps & { wide?: boolean }) {
  const parsing = doc.status === 'parsing'
  const first = firstCite(cites)
  const citedFields = [...new Set(cites.map((c) => c.fieldId))]
  const pages = [...new Set(cites.map((c) => c.source.page).filter((p): p is number => !!p))].sort((a, b) => a - b)
  const shown = wide ? citedFields : citedFields.slice(0, 1)
  const more = citedFields.length - shown.length

  return (
    <div
      data-doc={doc.id}
      className={cn(
        'relative flex flex-col overflow-hidden rounded-lg border bg-panel transition-[border-color,box-shadow] duration-200',
        wide ? 'w-full' : 'h-[180px] w-[244px] shrink-0',
        reading ? 'dock-reading border-cobalt/60' : pointed || open ? 'border-cobalt/50 ring-2 ring-cobalt/25' : 'border-rule'
      )}
      onMouseEnter={() => useDock.getState().setHoverDoc(doc.id)}
      onMouseLeave={() => useDock.getState().setHoverDoc(null)}
    >
      {recentAt ? <span key={recentAt} className="dock-flash pointer-events-none absolute inset-0" aria-hidden /> : null}
      <button
        type="button"
        disabled={parsing}
        onClick={() => openDoc(doc, cites)}
        aria-label={`Open ${doc.name}`}
        className="relative flex min-h-0 flex-1 flex-col gap-2 rounded-t-lg p-2.5 text-left transition-colors enabled:hover:bg-panel-2/60 disabled:cursor-default"
      >
        <span className="flex w-full min-w-0 items-center gap-2">
          <DocBadge kind={doc.kind} className="h-4 w-8 rounded-[3px] text-[9px]" />
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink">{shortName(doc.name)}</span>
          {reading ? (
            <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium text-cobalt-ink">
              <ReadingDot /> Reading
            </span>
          ) : recentAt ? (
            <span className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-ok">
              <Check className="size-3" strokeWidth={2.5} /> Cited
            </span>
          ) : open ? (
            <span className="shrink-0 text-[11px] font-medium text-cobalt-ink">Open</span>
          ) : null}
        </span>
        <span className="num -mt-1 block truncate font-mono text-[10.5px] text-ink-3">
          {parsing
            ? `${doc.parser === 'ocr' ? 'OCR' : 'Parsing'} · ${doc.progress ?? 0}%`
            : `${docSize(doc)}${pages.length ? ` · cited on p.${pages.join(', ')}` : first ? ` · ${locatorText(first.source)}` : ''}`}
        </span>
        <DocPreview doc={doc} cite={first} cites={cites} tall={wide} />
      </button>
      <div className="relative flex min-h-8 items-center gap-1 border-t border-rule px-2.5 py-1.5 text-[11px]">
        {parsing ? (
          <ParseBar progress={doc.progress ?? 0} className="flex-1" />
        ) : citedFields.length ? (
          <div className={cn('flex min-w-0 flex-1 items-center gap-x-1.5 gap-y-0.5 text-ink-3', wide && 'flex-wrap')}>
            <span className="shrink-0">Cited by</span>
            {shown.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => useApp.getState().revealField(id)}
                className={cn('rounded-sm text-ink-2 underline-offset-2 hover:text-cobalt-ink hover:underline', wide ? 'shrink-0' : 'min-w-0 truncate')}
              >
                {fieldLabel(id)}
              </button>
            ))}
            {more > 0 && (
              <span className="num shrink-0 rounded-full bg-panel-2 px-1.5 font-mono text-[10px] leading-4 text-ink-3" title={citedFields.slice(shown.length).map(fieldLabel).join(', ')}>
                +{more}
              </span>
            )}
          </div>
        ) : (
          <span className="text-ink-3">Not cited yet</span>
        )}
      </div>
    </div>
  )
}

/** Start a long block a few words before the quote so the marked line shows in a small thumbnail. */
function nearQuote(block: string, quote: string | undefined) {
  if (!quote) return block
  const at = block.replace(/[’‘]/g, "'").toLowerCase().indexOf(quote.replace(/[’‘]/g, "'").toLowerCase())
  if (at < 28) return block
  const from = block.lastIndexOf(' ', at - 14)
  return `…${block.slice(from > 0 ? from + 1 : at)}`
}

function DocPreview({ doc, cite, cites, tall }: { doc: DemoDocument; cite?: Cite; cites: Cite[]; tall?: boolean }) {
  const box = cn('dock-thumb relative w-full min-h-0 flex-1 overflow-hidden rounded-[4px] border border-rule', tall ? 'max-h-[148px] min-h-[96px]' : '')

  if (doc.status === 'parsing') {
    return (
      <span className={cn(box, 'flex flex-col items-center justify-center gap-1.5 bg-panel-2 text-[11px] text-ink-3')}>
        <FileText className="size-4" />
        Reading pages on this device
      </span>
    )
  }

  if (doc.sheet) {
    const hits = new Set(cites.map((c) => c.source.locator?.match(/B(\d+)/)?.[1]).filter(Boolean))
    return (
      <span className={cn(box, 'block bg-paper text-paper-ink')}>
        <span className="block border-b border-paper-rule px-2 py-1 font-sans text-[9px] tracking-wide text-paper-ink/50 uppercase">
          Sheet “{doc.sheet.name}”
        </span>
        <span className="block px-1.5 py-1 font-mono text-[10px] leading-[1.6]">
          {doc.sheet.rows.map(([role, rate], i) => (
            <span key={role} className={cn('flex justify-between gap-2 rounded-[2px] px-1', hits.has(String(i + 2)) && 'bg-marker text-marker-ink')}>
              <span className="truncate">{role}</span>
              <span className="num">{rate}</span>
            </span>
          ))}
        </span>
      </span>
    )
  }

  const page = doc.content.find((p) => p.n === cite?.source.page) ?? doc.content[0]
  if (!page) {
    return (
      <span className={cn(box, 'flex items-center justify-center bg-panel-2 px-3 text-center text-[11px] text-ink-3')}>
        Indexed. Previews of added files aren’t drawn in this demo.
      </span>
    )
  }
  const quote = cite?.source.quote
  const norm = (s: string) => s.replace(/[’‘]/g, "'").toLowerCase()
  const hit = quote ? page.blocks.findIndex((b) => norm(b).includes(norm(quote))) : -1
  const body = (hit > 0 ? page.blocks.slice(hit, hit + 2) : page.blocks.slice(1, 3)).map((b, i) => (i === 0 && hit > 0 ? nearQuote(b, quote) : b))

  return (
    <span className={cn(box, 'block bg-paper px-2.5 py-2 font-serif text-[10.5px] leading-[1.45] text-paper-ink')}>
      <span className="dock-clip block h-full">
        <span className="mb-1 flex justify-between gap-2 font-sans text-[8.5px] tracking-wide text-paper-ink/45 uppercase">
          <span className="truncate">{doc.kind === 'eml' ? 'Message' : `Page ${page.n}`}</span>
          <span className="shrink-0">{doc.id}</span>
        </span>
        <span className="block truncate font-semibold">{page.blocks[0]}</span>
        {body.map((b, i) => (
          <span key={i} className="mt-1 block">
            {markQuote(b, quote)}
          </span>
        ))}
      </span>
    </span>
  )
}
