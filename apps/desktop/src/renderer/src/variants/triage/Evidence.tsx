import { Maximize2 } from 'lucide-react'
import type { SourceRef } from '../../../../shared/protocol'
import { EvidencePage } from '@/components/EvidencePage'
import { locatorText } from '@/components/status'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { shortName } from './bits'

/** One cited source: a hairline caption, then the page with the quote marked. */
export function EvidenceBlock({ source, className }: { source: SourceRef; className?: string }) {
  const doc = useApp((s) => s.docs.find((d) => d.id === source.docId))
  const openSource = useApp((s) => s.openSource)
  const name = doc ? shortName(doc.name) : source.docId

  return (
    <figure className={cn('flex min-w-0 flex-col gap-2', className)}>
      <figcaption className="flex min-w-0 items-center gap-2 text-[12px]">
        <span className="font-mono text-[11px] font-semibold text-cobalt">{source.docId}</span>
        <span className="min-w-0 truncate text-ink-2" title={doc?.name}>
          {name}
        </span>
        <span className="shrink-0 font-mono text-[11px] text-ink-3">{locatorText(source)}</span>
        <button
          type="button"
          onClick={() => openSource({ docId: source.docId, page: source.page, quote: source.quote, locator: source.locator })}
          className="ml-auto inline-flex h-6 shrink-0 items-center gap-1 rounded-[4px] px-1.5 text-[12px] text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink"
          aria-label={`Open ${doc?.name ?? source.docId} in the viewer`}
        >
          <Maximize2 className="size-3" />
          Open
        </button>
      </figcaption>
      <EvidencePage docId={source.docId} page={source.page} quote={source.quote} locator={source.locator} compact className="rounded-[4px]" />
    </figure>
  )
}

export function EvidenceHeading({ id, title, count }: { id: string; title: string; count?: number }) {
  return (
    <h2 id={id} className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.04em] text-ink-2 uppercase">
      {title}
      {count !== undefined && (
        <span className="num font-mono font-medium tracking-normal text-ink-3 normal-case">
          {count} {count === 1 ? 'quote' : 'quotes'}
        </span>
      )}
      <span className="h-px flex-1 bg-rule" aria-hidden />
    </h2>
  )
}
