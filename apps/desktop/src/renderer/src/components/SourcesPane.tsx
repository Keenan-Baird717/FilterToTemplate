import { HardDrive, Plus, Upload } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { Button } from '@/components/ui/button'
import { useParsingTicker } from '@/lib/agent'
import { ScrollArea } from '@/components/ui/scroll-area'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { DocBadge } from './status'

const parserLabel = {
  'text-layer': 'Text layer',
  ocr: 'OCR',
  word: 'Word',
  sheet: 'Sheet',
  email: 'Email'
} as const

export function SourcesPane() {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const source = useApp((s) => s.source)
  const openSource = useApp((s) => s.openSource)
  const addFiles = useApp((s) => s.addFiles)
  const cites = citationsByDoc(fields, rates)
  const pages = docs.reduce((n, d) => n + d.pages, 0)

  useParsingTicker()

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (files.length) addFiles(files.map((f) => ({ name: f.name })))
    }
  })

  return (
    <aside {...getRootProps({ className: 'relative flex h-full min-h-0 flex-col bg-ground' })} aria-label="Sources">
      <input {...getInputProps({ id: 'source-files' })} />
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <div>
          <h2 className="text-[13px] font-semibold">Sources</h2>
          <p className="num text-[12px] text-ink-3">
            {docs.length} files · {pages} pages
          </p>
        </div>
        <Button variant="ghost" size="icon" className="size-8" onClick={open} aria-label="Add documents">
          <Plus className="size-4" />
        </Button>
      </div>

      <button
        type="button"
        onClick={open}
        className="mx-3 mb-2 flex items-center gap-2.5 rounded-lg border border-dashed border-ink-3/40 px-3 py-2.5 text-left text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:bg-panel"
      >
        <Upload className="size-4 shrink-0 text-ink-3" />
        <span>
          Drop PDFs, Word, Excel or email
          <span className="block text-ink-3">Parsed on this device</span>
        </span>
      </button>

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <ul className="flex flex-col gap-px px-2 pb-3">
          {docs.map((d) => {
            const active = source?.docId === d.id
            const count = cites[d.id]?.length ?? 0
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={d.status === 'parsing'}
                  onClick={() => openSource({ docId: d.id, page: d.content[0]?.n })}
                  className={cn(
                    'flex w-full min-w-0 items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors',
                    active ? 'bg-panel shadow-[0_0_0_1px_var(--rule)]' : 'hover:bg-panel/70',
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
                        <span className="num font-mono text-[10px] text-ink-3">{d.parser === 'ocr' ? 'OCR' : 'Parsing'}</span>
                      </span>
                    ) : (
                      <span className="num block text-[11px] text-ink-3">
                        {d.kind === 'xlsx' ? '1 sheet' : d.kind === 'eml' ? '1 message' : `${d.pages} pages`} · {parserLabel[d.parser]}
                      </span>
                    )}
                  </span>
                  {count > 0 && (
                    <span className="num mt-0.5 rounded-full bg-cobalt-soft px-1.5 font-mono text-[10px] leading-[18px] text-cobalt-ink" title={`Cited ${count} times`}>
                      {count}
                    </span>
                  )}
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

      {isDragActive && (
        <div className="pointer-events-none absolute inset-2 flex items-center justify-center rounded-xl border-2 border-dashed border-cobalt bg-cobalt-soft/90 text-[13px] font-medium text-cobalt-ink">
          Drop to add to this project
        </div>
      )}
    </aside>
  )
}
