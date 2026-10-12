import { Plus, Upload } from 'lucide-react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { citationsByDoc, useApp } from '@/lib/store'
import { DocCard, ReadingDot, orderDocs, useDockActivity } from './docs'
import { useDock } from './model'

/** Phones: the dock becomes the Sources tab, the same cards stacked. */
export function SourcesTab({ onAddFiles }: { onAddFiles: () => void }) {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const openDocId = useApp((s) => s.source?.docId)
  const hoverDoc = useDock((s) => s.hoverDoc)
  const cites = useMemo(() => citationsByDoc(fields, rates), [fields, rates])
  const act = useDockActivity()
  const reduce = useReducedMotion()
  const pages = docs.reduce((n, d) => n + d.pages, 0)

  return (
    <section className="flex h-full min-h-0 flex-col bg-ground" aria-label="Sources">
      <header className="flex items-center justify-between gap-3 border-b border-rule px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-[13px] font-semibold">Sources</h2>
          <p className="num flex items-center gap-1.5 text-[12px] text-ink-3">
            {act.reading.size > 0 ? (
              <span className="flex items-center gap-1.5 text-cobalt-ink">
                <ReadingDot /> The agent is reading {act.reading.size === 1 ? 'a document' : `${act.reading.size} documents`}
              </span>
            ) : (
              `${docs.length} files · ${pages} pages`
            )}
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-8 gap-1 text-[12px]" onClick={onAddFiles}>
          <Plus className="size-3.5" /> Add files
        </Button>
      </header>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="grid grid-cols-1 gap-3 px-4 py-4 sm:grid-cols-2">
          <LayoutGroup>
            {orderDocs(docs, act).map((d) => (
              <motion.div key={d.id} layout={reduce ? false : 'position'} transition={{ type: 'spring', stiffness: 520, damping: 42 }}>
                <DocCard
                  doc={d}
                  wide
                  cites={cites[d.id] ?? []}
                  reading={act.reading.has(d.id)}
                  recentAt={act.busy && !act.reading.has(d.id) ? act.recent.get(d.id) : undefined}
                  pointed={hoverDoc === d.id}
                  open={openDocId === d.id}
                />
              </motion.div>
            ))}
          </LayoutGroup>
          <button
            type="button"
            onClick={onAddFiles}
            className="flex items-center gap-2.5 rounded-lg border border-dashed border-ink-3/40 px-3 py-3 text-left text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:bg-panel"
          >
            <Upload className="size-4 shrink-0 text-ink-3" />
            <span>
              Add PDFs, Word, Excel or email
              <span className="block text-ink-3">Parsed on this device</span>
            </span>
          </button>
        </div>
      </ScrollArea>
    </section>
  )
}
