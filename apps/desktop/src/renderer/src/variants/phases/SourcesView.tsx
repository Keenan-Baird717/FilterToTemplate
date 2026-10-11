import { HardDrive, Plus, Upload } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { FieldState, RatesState } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { DocBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLiveSources, useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Dot, plural, SweepBar, ViewHeader } from './bits'
import { useTurn } from './state'

const parserLabel = { 'text-layer': 'Text layer', ocr: 'OCR', word: 'Word', sheet: 'Sheet', email: 'Email' } as const

/** Values each document supports right now (found values only: a "closest mention" for a missing value doesn't count). */
function valuesByDoc(fields: Record<string, FieldState>, rates: RatesState) {
  const out: Record<string, { fieldId: string; count: number }[]> = {}
  const add = (docId: string, fieldId: string) => {
    const list = (out[docId] ??= [])
    const hit = list.find((x) => x.fieldId === fieldId)
    if (hit) {
      if (fieldId === 'hourlyRates') hit.count++
    } else list.push({ fieldId, count: 1 })
  }
  for (const id of Object.keys(fieldDefs)) {
    const f = fields[id]
    if (!f || f.status === 'empty' || f.status === 'missing') continue
    const refs = f.status === 'conflict' ? (f.candidates ?? []).flatMap((c) => c.sources) : f.sources
    for (const r of refs) add(r.docId, id)
  }
  for (const row of rates.rows) if (row.source && rates.status !== 'empty') add(row.source.docId, 'hourlyRates')
  return out
}

const labelOf = (fieldId: string) => (fieldId === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[fieldId]?.label ?? fieldId))

export function SourcesView({ openFiles }: { openFiles: () => void }) {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const flash = useApp((s) => s.flash)
  const activity = useApp((s) => s.activity)
  const source = useApp((s) => s.source)
  const openSource = useApp((s) => s.openSource)
  const live = useLiveSources()
  const { done, total } = useSummary()
  const { busy, mode } = useTurn()
  const reading = busy && mode === 'fill'

  const values = valuesByDoc(fields, rates)
  const indexed = docs.filter((d) => d.status === 'indexed')
  const cited = indexed.filter((d) => values[d.id]?.length).length
  const pages = docs.reduce((n, d) => n + d.pages, 0)
  const now = Date.now()

  return (
    <div className="flex h-full min-h-0 flex-col">
      {reading ? (
        <ViewHeader
          live
          eyebrow="Reading"
          title={
            <Shimmer as="span" className="text-[15px] font-semibold" duration={1.8}>
              {`Now: ${activity ?? 'Reading documents'}…`}
            </Shimmer>
          }
          sub={
            <span className="num">
              {done} of {total} values found · {cited} of {indexed.length} documents cited
            </span>
          }
        />
      ) : (
        <ViewHeader
          eyebrow="Sources"
          title={plural(docs.length, 'document')}
          sub={
            <span className="num">
              {pages} pages · {cited} cited by the letter
            </span>
          }
          aside={
            <Button variant="ghost" size="icon" className="-mr-1.5 size-8" onClick={openFiles} aria-label="Add documents">
              <Plus className="size-4" />
            </Button>
          }
        />
      )}

      {!reading && (
        <button
          type="button"
          onClick={openFiles}
          className="mx-4 mb-2 flex items-center gap-2.5 lg:mx-3 rounded-lg border border-dashed border-ink-3/40 px-3 py-2.5 text-left text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:bg-panel"
        >
          <Upload className="size-4 shrink-0 text-ink-3" />
          <span>
            Drop PDFs, Word, Excel or email
            <span className="block text-ink-3">Parsed on this device</span>
          </span>
        </button>
      )}

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <ul className="flex flex-col gap-1 px-4 pb-3 lg:px-2" aria-label="Documents">
          {docs.map((d) => {
            const list = values[d.id] ?? []
            const count = list.reduce((n, x) => n + x.count, 0)
            const isReading = live.reading.has(d.id)
            const recentAt = live.recent.get(d.id)
            const washing = !!recentAt && now - recentAt < 1400
            const state = d.status === 'parsing' ? 'parsing' : isReading ? 'reading' : count ? 'cited' : reading ? 'queued' : 'idle'
            const active = source?.docId === d.id
            const firstPage = d.content[0]?.n
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={d.status === 'parsing'}
                  onClick={() => openSource({ docId: d.id, page: firstPage })}
                  aria-label={`${d.name}, ${state === 'reading' ? 'reading now' : state === 'cited' ? `cited ${plural(count, 'value')}` : state === 'queued' ? 'queued' : state === 'parsing' ? 'parsing' : 'not cited'}. Open document`}
                  className={cn(
                    'flex w-full min-w-0 items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-[background-color,box-shadow,opacity] duration-150',
                    state === 'reading'
                      ? 'bg-panel shadow-[0_0_0_1px_color-mix(in_srgb,var(--cobalt)_35%,transparent)]'
                      : active
                        ? 'bg-panel shadow-[0_0_0_1px_var(--rule)]'
                        : 'hover:bg-panel/70',
                    state === 'queued' && 'opacity-60',
                    d.status === 'parsing' && 'cursor-default',
                    washing && 'field-wash'
                  )}
                >
                  <DocBadge kind={d.kind} className="mt-px" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{d.name}</span>
                    {state === 'parsing' ? (
                      <span className="mt-1 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-rule">
                          <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${d.progress ?? 0}%` }} />
                        </span>
                        <span className="num font-mono text-[10px] text-ink-3">
                          {d.parser === 'ocr' ? 'OCR' : 'Parsing'} {d.progress ?? 0}%
                        </span>
                      </span>
                    ) : (
                      <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px]">
                        <StateText state={state} count={count} />
                        <span className="num truncate text-ink-3">
                          · {d.kind === 'xlsx' ? '1 sheet' : d.kind === 'eml' ? '1 message' : `${d.pages} pages`}
                          {state !== 'reading' && ` · ${parserLabel[d.parser]}`}
                        </span>
                      </span>
                    )}
                    {state === 'reading' && <SweepBar className="mt-2" />}
                    {list.length > 0 && (
                      <span className="mt-1 line-clamp-2 block text-[11.5px] leading-snug text-ink-3">
                        <AnimatePresence initial={false}>
                          {list.map((x, i) => {
                            const fresh = now - (flash[x.fieldId] ?? 0) < 1800
                            return (
                              <motion.span
                                key={x.fieldId}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ duration: 0.3 }}
                                className={cn(fresh && 'font-medium text-ink')}
                              >
                                {i > 0 && <span className="text-ink-3"> · </span>}
                                {labelOf(x.fieldId)}
                                {x.fieldId === 'hourlyRates' && ` (${x.count})`}
                              </motion.span>
                            )
                          })}
                        </AnimatePresence>
                      </span>
                    )}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t border-rule px-4 py-2.5 text-[11px] text-ink-3">
        <HardDrive className="size-3.5" />
        <span className="truncate">Stored locally · projects/acme/project.db</span>
      </div>
    </div>
  )
}

function StateText({ state, count }: { state: 'reading' | 'cited' | 'queued' | 'idle'; count: number }) {
  if (state === 'reading')
    return (
      <span className="flex shrink-0 items-center gap-1.5 font-medium text-cobalt-ink">
        <Dot live /> Reading now
      </span>
    )
  if (state === 'cited') return <span className="num shrink-0 text-ink-2">Cited {plural(count, 'value')}</span>
  if (state === 'queued') return <span className="shrink-0 text-ink-3">Queued</span>
  return <span className="shrink-0 text-ink-3">Not cited</span>
}
