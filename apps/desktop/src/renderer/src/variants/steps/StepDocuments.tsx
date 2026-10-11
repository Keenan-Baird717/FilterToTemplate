import { ArrowRight, Check, RotateCcw, UploadCloud } from 'lucide-react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import type { DemoDocument } from '../../../../agent-core/demo-data'
import { Button } from '@/components/ui/button'
import { useAgent } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { DocTile, kindLabel, shortDocName, StepIntro } from './parts'
import { StepFooter } from './StepFooter'

/** Simulated ingest for files added in the preview (the shell's sources pane isn't mounted here). */
export function useParsingTicker() {
  const parsing = useApp((s) => s.docs.some((d) => d.status === 'parsing' && d.id !== 'D8'))
  const advanceParsing = useApp((s) => s.advanceParsing)
  useEffect(() => {
    if (!parsing) return
    const t = setInterval(() => {
      const done = advanceParsing()
      if (done.length) toast.success(done.length === 1 ? `${done[0]} is ready` : `${done.length} files are ready`)
    }, 450)
    return () => clearInterval(t)
  }, [parsing, advanceParsing])
}

export function StepDocuments({ onNext, onRunFill }: { onNext: () => void; onRunFill: () => void }) {
  const docs = useApp((s) => s.docs)
  const addFiles = useApp((s) => s.addFiles)
  const { busy } = useAgent()
  const ready = docs.filter((d) => d.status === 'indexed').length
  const reading = docs.length - ready

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (!files.length) return
      addFiles(files.map((f) => ({ name: f.name })))
      toast(files.length === 1 ? `Added ${files[0].name}` : `Added ${files.length} files`, { description: 'Reading them now.' })
    }
  })

  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[1080px] flex-1 px-4 pt-8 pb-12 sm:px-8 sm:pt-12">
        <StepIntro step={1} title="Add your documents">
          Agreements, notes, emails and spreadsheets for this matter. Files are read on this device and never leave it.
        </StepIntro>

        <div
          {...getRootProps({
            className: cn(
              'relative mt-8 flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition-colors sm:flex-row sm:gap-5 sm:px-8 sm:py-9 sm:text-left',
              isDragActive ? 'border-cobalt bg-cobalt-soft' : 'border-rule bg-panel-2/60 hover:border-ink-3/40'
            )
          })}
        >
          <input {...getInputProps({ 'aria-label': 'Choose files to add' })} />
          <span className={cn('flex size-14 shrink-0 items-center justify-center rounded-full', isDragActive ? 'bg-cobalt text-on-cobalt' : 'bg-panel text-ink-2 shadow-[0_0_0_1px_var(--rule)]')}>
            <UploadCloud className="size-6" strokeWidth={1.75} />
          </span>
          <div className="min-w-0 sm:flex-1">
            <p className="text-[18px] font-semibold text-ink">{isDragActive ? 'Drop to add them' : 'Drop more files here'}</p>
            <p className="mt-1 text-[14px] text-ink-3">PDF, Word, Excel or email. Scanned pages are read with OCR.</p>
          </div>
          <Button type="button" variant="outline" className="h-11 shrink-0 rounded-full bg-panel px-5 text-[15px]" onClick={open}>
            Choose files
          </Button>
        </div>

        <div className="mt-10 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="text-[17px] font-semibold text-ink">In this matter</h2>
          <p className="text-[14px] text-ink-3 tabular-nums">
            {docs.length} files · {ready} ready{reading ? ` · ${reading} reading` : ''}
          </p>
        </div>
        <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {docs.map((d, i) => (
            <DocCard key={d.id} doc={d} index={i} />
          ))}
        </ul>
      </div>

      <StepFooter
        hint={reading ? `${reading} file${reading === 1 ? ' is' : 's are'} still being read. You can carry on.` : 'All files are ready.'}
        secondary={
          <Button variant="ghost" className="h-11 gap-2 rounded-full px-4 text-[15px] text-ink-2" onClick={onRunFill} disabled={busy}>
            <RotateCcw className="size-4" /> <span className="hidden sm:inline">Fill again from these</span>
            <span className="sr-only sm:hidden">Fill again from these</span>
          </Button>
        }
        primary={
          <Button className="h-11 gap-2 rounded-full px-6 text-[15px] font-semibold" onClick={onNext}>
            Check what we found <ArrowRight className="size-4" />
          </Button>
        }
      />
    </div>
  )
}

function DocCard({ doc, index }: { doc: DemoDocument; index: number }) {
  const openSource = useApp((s) => s.openSource)
  const reduce = useReducedMotion()
  const parsing = doc.status === 'parsing'
  const meta = doc.kind === 'xlsx' ? '1 sheet' : doc.kind === 'eml' ? '1 message' : `${doc.pages} pages`

  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03 }}
      className="min-w-0"
    >
      <button
        type="button"
        disabled={parsing}
        onClick={() => openSource({ docId: doc.id, page: doc.content[0]?.n })}
        className="group flex h-full w-full min-w-0 flex-col gap-4 rounded-xl border border-rule bg-panel p-4 text-left transition-colors hover:border-ink-3/40 hover:bg-panel-2/50 disabled:cursor-default disabled:hover:border-rule disabled:hover:bg-panel"
        aria-label={`${doc.name}, ${kindLabel[doc.kind]}, ${meta}, ${parsing ? 'still reading' : 'ready'}`}
      >
        <span className="flex min-w-0 items-start gap-3">
          <DocTile kind={doc.kind} />
          <span className="min-w-0 flex-1">
            <span className="line-clamp-2 text-[15px] leading-snug font-medium break-words text-ink" title={doc.name}>
              {shortDocName(doc.name)}
            </span>
            <span className="mt-0.5 block text-[13px] text-ink-3 tabular-nums">
              {kindLabel[doc.kind]} · {meta} · {doc.added}
            </span>
          </span>
        </span>
        <span className="mt-auto block">
          {parsing ? (
            <span className="flex items-center gap-3">
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${doc.progress ?? 0}%` }} />
              </span>
              <span className="shrink-0 text-[12.5px] text-ink-3 tabular-nums">
                {doc.parser === 'ocr' ? 'Reading scans' : 'Reading'} · {doc.progress ?? 0}%
              </span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-[13px] font-medium text-ok">
              <Check className="size-3.5" strokeWidth={2.5} /> Ready
              <span className="ml-auto font-normal text-ink-3 opacity-0 transition-opacity group-hover:opacity-100">Open</span>
            </span>
          )}
        </span>
      </button>
    </motion.li>
  )
}
