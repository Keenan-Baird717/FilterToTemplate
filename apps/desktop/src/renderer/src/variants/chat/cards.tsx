import { ArrowUpRight, Check, Download, FileCheck2 } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { sections } from '../../../../agent-core/demo-data'
import { DocxView } from '@/components/DocxView'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSummary } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useChatUI } from './ui-store'
import { fieldLabel, NEEDS_YOU, orderedIds, RATES_ID, scrollWithin, SegmentBar, shortDocName, statusOf, StatusGlyph, valueOf, WAITING } from './shared'

export function runExport() {
  exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))
}

export function approveAllReady() {
  const { approveSection } = useApp.getState()
  for (const s of sections) approveSection(s.id)
  toast.success('Approved every ready section')
}

/** Live summary of the fill: counts, per-section bars, what needs you, sources. */
export function ProgressCard() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const docs = useApp((s) => s.docs)
  const openSource = useApp((s) => s.openSource)
  const openPanel = useChatUI((s) => s.openPanel)
  const focusQuestion = useChatUI((s) => s.focusQuestion)
  const { counts, total, done } = useSummary()
  const cites = citationsByDoc(fields, rates)
  const needs = orderedIds.filter((id) => NEEDS_YOU.includes(statusOf(id, fields, rates)))
  const waiting = orderedIds.filter((id) => WAITING.includes(statusOf(id, fields, rates)))
  const allDone = done === total
  const ready = counts.verified + counts.user_answered

  const reason = (id: string) => {
    const f = fields[id]
    switch (f?.status) {
      case 'conflict':
        return `${f.candidates?.length ?? 2} documents disagree`
      case 'missing':
        return 'Not in any document'
      case 'drafting':
        return 'Writing now'
      default:
        return f?.note ? 'Written after your answers' : 'Not filled yet'
    }
  }

  return (
    <section aria-label="Progress" className="overflow-hidden rounded-xl border border-rule bg-panel">
      <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 px-4 pt-3.5 pb-3">
        <div className="min-w-0">
          <div className="text-[12px] font-medium text-ink-3">Progress</div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="chat-display num text-[28px] leading-none font-semibold">{done}</span>
            <span className="num text-[14px] text-ink-2">of {total} filled</span>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[12.5px]">
          {counts.approved > 0 && counts.approved < total && <span className="num text-ink-3">{counts.approved} approved</span>}
          {allDone ? (
            <span className="flex items-center gap-1.5 font-medium text-ok">
              <Check className="size-3.5" strokeWidth={2.5} /> {counts.approved === total ? 'All approved' : 'Ready to review'}
            </span>
          ) : needs.length ? (
            <span className="flex items-center gap-1.5 font-medium text-warn">
              <span className="size-1.5 rounded-full bg-warn" aria-hidden />
              {needs.length} need{needs.length === 1 ? 's' : ''} you
            </span>
          ) : null}
        </div>
      </header>

      <div className="grid gap-x-7 gap-y-4 border-t border-rule px-4 py-3.5 sm:grid-cols-2">
        <ul className="flex min-w-0 flex-col gap-0.5" aria-label="Sections">
          {sections.map((s) => {
            const ids = s.hasRates ? [...s.fields, RATES_ID] : s.fields
            const sts = ids.map((id) => statusOf(id, fields, rates))
            const n = sts.filter((x) => x === 'verified' || x === 'approved' || x === 'user_answered').length
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => openPanel('fields', ids[0])}
                  className="grid w-full grid-cols-[84px_minmax(0,1fr)_32px] items-center gap-3 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-panel-2"
                  aria-label={`${s.title}: ${n} of ${ids.length} filled. Show fields`}
                >
                  <span className="truncate text-[12.5px] text-ink-2">{s.title}</span>
                  <SegmentBar statuses={sts} />
                  <span className="num text-right font-mono text-[11px] text-ink-3">
                    {n}/{ids.length}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>

        <div className="flex min-w-0 flex-col gap-3">
          {needs.length + waiting.length > 0 ? (
            <div>
              <div className="mb-1 text-[12px] font-medium text-ink-3">{needs.length ? 'Needs you' : 'Still to do'}</div>
              <ul className="flex flex-col">
                {[...needs, ...waiting].slice(0, 4).map((id) => (
                  <li key={id}>
                    <button
                      type="button"
                      onClick={() => (NEEDS_YOU.includes(statusOf(id, fields, rates)) ? focusQuestion() : openPanel('fields', id))}
                      className="flex w-full min-w-0 items-start gap-2.5 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-panel-2"
                    >
                      <StatusGlyph status={statusOf(id, fields, rates)} className="mt-px size-[15px]" />
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] text-ink">{fieldLabel(id)}</span>
                        <span className="block truncate text-[12px] text-ink-3">{reason(id)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {needs.length + waiting.length > 4 && (
                <button type="button" onClick={() => openPanel('fields')} className="mt-1 rounded-md px-1.5 py-0.5 text-[12.5px] text-ink-3 transition-colors hover:text-ink">
                  and {needs.length + waiting.length - 4} more in Fields
                </button>
              )}
            </div>
          ) : (
            <div>
              <div className="mb-1.5 text-[12px] font-medium text-ink-3">Review</div>
              <p className="text-[13px] leading-relaxed text-ink-2">
                {ready ? `${ready} value${ready === 1 ? '' : 's'} ready to approve. Approve them here or section by section in Fields.` : 'Every value is approved. Export the Word file when you’re ready.'}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {ready > 0 && (
                  <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rule bg-panel text-[12.5px]" onClick={approveAllReady}>
                    <Check className="size-3.5" /> Approve all {ready}
                  </Button>
                )}
                <Button size="sm" className="h-8 gap-1.5 text-[12.5px]" onClick={runExport}>
                  <Download className="size-3.5" /> Export .docx
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <footer className="flex flex-wrap items-center gap-1.5 border-t border-rule bg-panel-2/40 px-4 py-2.5">
        <span className="mr-1 text-[12px] text-ink-3">Cited from {Object.keys(cites).length} documents</span>
        {Object.entries(cites)
          .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
          .map(([docId, refs]) => {
            const doc = docs.find((d) => d.id === docId)
            const first = refs[0].source
            return (
              <Tooltip key={docId}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openSource({ docId, page: first.page, quote: first.quote, locator: first.locator })}
                    aria-label={`${doc?.name ?? docId}, cited ${refs.length} times. Open it`}
                    className="inline-flex h-6 items-center gap-1 rounded-md border border-rule bg-panel px-1.5 transition-colors hover:border-cobalt/40 hover:bg-cobalt-soft"
                  >
                    <span className="font-mono text-[11px] font-medium text-cobalt">{docId}</span>
                    <span className="num font-mono text-[11px] text-ink-3">×{refs.length}</span>
                  </button>
                </TooltipTrigger>
                <TooltipContent>{doc ? shortDocName(doc.name) : docId}</TooltipContent>
              </Tooltip>
            )
          })}
      </footer>
    </section>
  )
}

/** Keep a field centred in a small page preview as the document re-renders. */
function useFollowInThumb(ref: React.RefObject<HTMLDivElement | null>, fieldId: string | undefined) {
  useEffect(() => {
    const root = ref.current
    if (!root || !fieldId) return
    const place = () => {
      const scroller = root.querySelector<HTMLElement>('.chat-thumb-scroller')
      const el = scroller?.querySelector(`[data-field="${CSS.escape(fieldId)}"]`)
      if (scroller && el) scrollWithin(scroller, el, 0.45, false)
    }
    const mo = new MutationObserver(() => requestAnimationFrame(place))
    mo.observe(root, { childList: true, subtree: true })
    place()
    return () => mo.disconnect()
  }, [ref, fieldId])
}

/** "Document updated": a real, tiny render of the page plus the values that changed. */
export function DocUpdatedCard({ fieldIds }: { fieldIds: string[] }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const openPanel = useChatUI((s) => s.openPanel)
  const thumbRef = useRef<HTMLDivElement>(null)
  useFollowInThumb(thumbRef, fieldIds[0])

  return (
    <button
      type="button"
      onClick={() => openPanel('document', fieldIds[0])}
      className="group flex w-full min-w-0 items-stretch overflow-hidden rounded-xl border border-rule bg-panel text-left transition-colors hover:border-cobalt/40"
      aria-label={`Document updated: ${fieldIds.map(fieldLabel).join(', ')}. Open the document`}
    >
      <div ref={thumbRef} className="chat-thumb relative w-[104px] shrink-0 overflow-hidden border-r border-rule bg-panel-2 sm:w-[148px]" aria-hidden>
        <div className="pointer-events-none absolute inset-0">
          <DocxView maxZoom={0.2} className="chat-thumb-scroller chat-no-scrollbar overflow-hidden" aria-label="Page preview" />
        </div>
      </div>
      <div className="min-w-0 flex-1 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileCheck2 className="size-4 text-cobalt" strokeWidth={2} />
          <span className="text-[13.5px] font-medium text-ink">Document updated</span>
          <span className="ml-auto flex items-center gap-0.5 text-[12px] text-ink-3 transition-colors group-hover:text-cobalt">
            Open <ArrowUpRight className="size-3.5" />
          </span>
        </div>
        <dl className="mt-2 flex flex-col gap-1.5">
          {fieldIds.map((id) => {
            const st = statusOf(id, fields, rates)
            return (
              <div key={id} className="grid min-w-0 grid-cols-1 gap-x-3 sm:grid-cols-[132px_minmax(0,1fr)]">
                <dt className="flex min-w-0 items-center gap-1.5 text-[12px] text-ink-3">
                  <StatusGlyph status={st} className="size-3.5" />
                  <span className="truncate">{fieldLabel(id)}</span>
                </dt>
                <dd className={cn('truncate text-[13px] text-ink', st === 'drafting' && 'text-ink-2')}>{valueOf(id, fields, rates) ?? 'Not filled'}</dd>
              </div>
            )
          })}
        </dl>
      </div>
    </button>
  )
}
