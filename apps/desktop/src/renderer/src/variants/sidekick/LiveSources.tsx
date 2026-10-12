import { HardDrive, Plus, Upload } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { fieldDefs, type DemoDocument } from '../../../../agent-core/demo-data'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { DocBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { useLiveSources } from '@/lib/agent'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { PulseDot } from './bits'
import { scrollToNearest, useSidekick } from './state'

const parserLabel = {
  'text-layer': 'Text layer',
  ocr: 'OCR',
  word: 'Word',
  sheet: 'Sheet',
  email: 'Email'
} as const

type Live = ReturnType<typeof useLiveSources>

/**
 * The Sources tab: SourcesPane, brought to life. Documents the agent is
 * reading float into a "Being read now" group, documents that were just cited
 * flash and say for what, and a citation chip hovered in the fields lights its
 * document up here.
 */
export function LiveSources({ live }: { live: Live }) {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const flash = useApp((s) => s.flash)
  const activity = useApp((s) => s.activity)
  const source = useApp((s) => s.source)
  const addFiles = useApp((s) => s.addFiles)
  const hoverDoc = useSidekick((s) => s.hoverDoc)
  const cites = citationsByDoc(fields, rates)
  const pages = docs.reduce((n, d) => n + d.pages, 0)
  const reading = docs.filter((d) => live.reading.has(d.id))
  const rest = docs.filter((d) => !live.reading.has(d.id))

  // Which fields a recently cited document was just cited for.
  const now = Date.now()
  const citedFor = (docId: string) =>
    (cites[docId] ?? [])
      .filter((c) => now - (flash[c.fieldId] ?? 0) < 4000)
      .map((c) => (c.fieldId === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[c.fieldId]?.label ?? c.fieldId)))
      .filter((v, i, a) => a.indexOf(v) === i)

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (files.length) addFiles(files.map((f) => ({ name: f.name })))
    }
  })

  const row = (d: DemoDocument) => (
    <DocRow
      key={d.id}
      doc={d}
      count={cites[d.id]?.length ?? 0}
      reading={live.reading.has(d.id)}
      citedAt={live.recent.get(d.id)}
      citedFor={live.recent.has(d.id) ? citedFor(d.id) : []}
      hovered={hoverDoc === d.id}
      active={source?.docId === d.id}
    />
  )

  return (
    <div {...getRootProps({ className: 'relative flex h-full min-h-0 flex-col bg-ground' })}>
      <input {...getInputProps({ id: 'source-files' })} />
      <div className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
        <p className="num text-[12px] text-ink-3" aria-live="polite">
          {reading.length ? `Reading ${reading.length} of ${docs.length} files` : `${docs.length} files · ${pages} pages`}
        </p>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[12px] text-ink-2" onClick={open}>
          <Plus className="size-3.5" /> Add files
        </Button>
      </div>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block [&_[data-slot=scroll-area-viewport]>div]:relative">
        <LayoutGroup>
          {/* Always mounted so rows can move in and out by layoutId without an exiting copy. */}
          <motion.section
            initial={false}
            animate={reading.length ? { height: 'auto', opacity: 1 } : { height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
            aria-label="Being read now"
            aria-hidden={!reading.length}
          >
            <div className="mx-2 mb-3 rounded-lg border border-cobalt/25 bg-panel px-1 pt-2 pb-1">
              <div className="flex items-center gap-2 px-2 pb-1.5">
                <PulseDot />
                <span className="eyebrow text-cobalt-ink">Being read now</span>
                {activity && (
                  <Shimmer className="ml-auto truncate text-[11px]" duration={1.6}>
                    {activity}
                  </Shimmer>
                )}
              </div>
              <ul className="flex flex-col gap-px">{reading.map(row)}</ul>
            </div>
          </motion.section>
          <section aria-label="All documents">
            {reading.length > 0 && <h3 className="eyebrow px-4 pb-1">Other files</h3>}
            <ul className="flex flex-col gap-px px-2 pb-3">{rest.map(row)}</ul>
          </section>
        </LayoutGroup>

        <button
          type="button"
          onClick={open}
          className="mx-3 mb-4 flex w-[calc(100%-1.5rem)] items-center gap-2.5 rounded-lg border border-dashed border-ink-3/40 px-3 py-2.5 text-left text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:bg-panel"
        >
          <Upload className="size-4 shrink-0 text-ink-3" />
          <span>
            Drop PDFs, Word, Excel or email
            <span className="block text-ink-3">Parsed on this device</span>
          </span>
        </button>
      </ScrollArea>

      <div className="flex items-center gap-2 border-t border-rule px-4 py-2.5 text-[11px] text-ink-3">
        <HardDrive className="size-3.5 shrink-0" />
        <span className="truncate">Stored locally · projects/acme/project.db</span>
      </div>

      {isDragActive && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-cobalt bg-cobalt-soft/90 text-[13px] font-medium text-cobalt-ink">
          Drop to add to this project
        </div>
      )}
    </div>
  )
}

function DocRow({
  doc,
  count,
  reading,
  citedAt,
  citedFor,
  hovered,
  active
}: {
  doc: DemoDocument
  count: number
  reading: boolean
  citedAt?: number
  citedFor: string[]
  hovered: boolean
  active: boolean
}) {
  const openSource = useApp((s) => s.openSource)
  const ref = useRef<HTMLLIElement>(null)

  useEffect(() => {
    if (hovered) scrollToNearest(ref.current)
  }, [hovered])

  const parsing = doc.status === 'parsing'
  return (
    <motion.li ref={ref} layout="position" layoutId={`sk-doc-${doc.id}`} transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }}>
      <button
        type="button"
        disabled={parsing}
        onClick={() => openSource({ docId: doc.id, page: doc.content[0]?.n })}
        className={cn(
          'relative flex w-full min-w-0 items-start gap-2.5 overflow-hidden rounded-md px-2 py-2 text-left transition-colors',
          hovered ? 'bg-cobalt-soft ring-1 ring-cobalt/40' : active ? 'bg-panel shadow-[0_0_0_1px_var(--rule)]' : 'hover:bg-panel/70',
          reading && !hovered && 'hover:bg-cobalt-soft/50',
          parsing && 'cursor-default'
        )}
      >
        {citedAt && <span key={citedAt} className="field-wash pointer-events-none absolute inset-0 rounded-md" aria-hidden />}
        <DocBadge kind={doc.kind} className="relative mt-px" />
        <span className="relative min-w-0 flex-1">
          <span className="block truncate text-[13px] text-ink">{doc.name}</span>
          {parsing ? (
            <span className="mt-1 flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-rule">
                <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${doc.progress ?? 0}%` }} />
              </span>
              <span className="num font-mono text-[10px] text-ink-3">{doc.parser === 'ocr' ? 'OCR' : 'Parsing'}</span>
            </span>
          ) : reading ? (
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-cobalt-ink">
              <span className="sk-reading-bar" aria-hidden />
              Reading
            </span>
          ) : citedFor.length ? (
            <span className="block truncate text-[11px] font-medium text-cobalt-ink">Cited for {citedFor.join(', ')}</span>
          ) : (
            <span className="num block text-[11px] text-ink-3">
              {doc.kind === 'xlsx' ? '1 sheet' : doc.kind === 'eml' ? '1 message' : `${doc.pages} pages`} · {parserLabel[doc.parser]}
            </span>
          )}
        </span>
        {count > 0 && (
          <motion.span
            key={count}
            initial={{ scale: 1.35 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 18 }}
            className="num relative mt-0.5 rounded-full bg-cobalt-soft px-1.5 font-mono text-[10px] leading-[18px] text-cobalt-ink"
            title={`Cited ${count} time${count === 1 ? '' : 's'}`}
            aria-label={`Cited ${count} time${count === 1 ? '' : 's'}`}
          >
            {count}
          </motion.span>
        )}
      </button>
    </motion.li>
  )
}
