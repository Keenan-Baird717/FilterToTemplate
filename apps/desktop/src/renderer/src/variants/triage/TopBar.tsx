import { Check, Download, Ellipsis, FileText, FolderOpen, Plus, RotateCcw, Upload } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { project, template } from '../../../../agent-core/demo-data'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { runFill, useAgent, useSummary } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Key } from './bits'
import { items, statusOf } from './model'
import { useTriage } from './state'

const doExport = () => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))

export function TopBar() {
  const { busy } = useAgent()
  const { counts, total } = useSummary()
  const letterOpen = useTriage((s) => s.letterOpen)
  const setLetterOpen = useTriage((s) => s.setLetterOpen)
  const allReviewed = counts.approved === total

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-rule bg-panel px-4 lg:gap-5">
      <div className="hidden min-w-0 shrink-0 flex-col lg:flex">
        <span className="truncate text-[13px] leading-4 font-semibold">{project.title}</span>
        <span className="truncate text-[11px] leading-4 text-ink-3">
          {project.client} · v{template.version}
        </span>
      </div>
      <span className="hidden h-6 w-px bg-rule lg:block" aria-hidden />

      <Progress />

      <div className="ml-auto flex shrink-0 items-center gap-1">
        <SourcesButton />
        <div className="hidden items-center gap-1 md:flex">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-[4px] px-2.5 text-[12px] text-ink-2" onClick={runFill} disabled={busy}>
                <RotateCcw className="size-3.5" /> Run again
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear the values and watch the agent fill them again</TooltipContent>
          </Tooltip>
          <Button
            variant="ghost"
            size="sm"
            aria-pressed={letterOpen}
            onClick={() => setLetterOpen(!letterOpen)}
            className={cn('h-8 gap-1.5 rounded-[4px] px-2.5 text-[12px]', letterOpen ? 'bg-panel-2 text-ink' : 'text-ink-2')}
          >
            <FileText className="size-3.5" /> {letterOpen ? 'Hide letter' : 'Show letter'} <Key className="ml-0.5">D</Key>
          </Button>
          <Button
            size="sm"
            variant={allReviewed ? 'default' : 'outline'}
            className="ml-1 h-8 gap-1.5 rounded-[4px] px-2.5 text-[12px]"
            onClick={doExport}
          >
            <Download className="size-3.5" /> Export .docx
          </Button>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-[4px] md:hidden" aria-label="More actions">
              <Ellipsis className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={() => setLetterOpen(!letterOpen)}>
              <FileText /> {letterOpen ? 'Hide letter' : 'Show letter'}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={runFill} disabled={busy}>
              <RotateCcw /> Run again
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void doExport()}>
              <Download /> Export .docx
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

const segTone: Record<string, string> = {
  approved: 'bg-ok',
  verified: 'bg-ink-3/45',
  user_answered: 'bg-ink-3/45',
  conflict: 'bg-warn',
  missing: 'bg-bad',
  drafting: 'bg-cobalt/60 animate-pulse',
  empty: 'bg-rule'
}

function Progress() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const activity = useApp((s) => s.activity)
  const { counts, total, done } = useSummary()
  const selected = useTriage((s) => s.selected)
  const select = useTriage((s) => s.select)
  const needs = counts.conflict + counts.missing
  const reviewed = counts.approved

  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 md:max-w-[560px]">
      <div className="flex shrink-0 items-baseline gap-1 text-[13px] whitespace-nowrap">
        <span className="num font-mono font-semibold text-ink">{reviewed}</span>
        <span className="text-ink-2">
          of {total} <span className="hidden sm:inline">reviewed</span>
        </span>
      </div>
      <div
        className="flex h-5 min-w-[90px] flex-1 items-center gap-[3px]"
        role="img"
        aria-label={`${reviewed} of ${total} reviewed, ${done} filled, ${needs} need you`}
      >
        {items.map((item) => {
          const st = statusOf(item.id, fields, rates)
          const isSel = item.id === selected
          return (
            <button
              key={item.id}
              type="button"
              tabIndex={-1}
              aria-hidden
              title={item.label}
              onClick={() => select(item.id, { detail: true })}
              className="group/seg relative flex h-full flex-1 items-center"
            >
              <span className={cn('h-[5px] w-full rounded-[1px] transition-colors duration-300 group-hover/seg:h-[7px]', segTone[st])} />
              {isSel && <span className="absolute inset-x-0 -bottom-[1px] h-[2px] rounded-full bg-cobalt" />}
            </button>
          )
        })}
      </div>
      <div className="hidden min-w-0 shrink items-center text-[12px] whitespace-nowrap text-ink-2 xl:flex">
        {activity ? (
          <Shimmer className="truncate text-[12px] font-medium" duration={1.6}>{`${activity}…`}</Shimmer>
        ) : needs ? (
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            {needs} need{needs === 1 ? 's' : ''} you
          </span>
        ) : reviewed === total ? (
          <span className="flex items-center gap-1 text-ok">
            <Check className="size-3.5" /> Ready to export
          </span>
        ) : (
          <span className="num">{done} filled</span>
        )}
      </div>
    </div>
  )
}

function SourcesButton() {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const openSource = useApp((s) => s.openSource)
  const addFiles = useApp((s) => s.addFiles)
  const cites = citationsByDoc(fields, rates)
  const parsing = docs.filter((d) => d.status === 'parsing').length

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (!files.length) return
      addFiles(files.map((f) => ({ name: f.name })))
      toast(`Adding ${files.length === 1 ? files[0].name : `${files.length} files`}`)
    }
  })

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 rounded-[4px] px-2.5 text-[12px] text-ink-2" aria-label={`Sources, ${docs.length} files`}>
          <FolderOpen className="size-3.5" />
          <span className="hidden sm:inline">Sources</span>
          <span className="num font-mono text-[11px] text-ink-3">{docs.length}</span>
          {parsing > 0 && <span className="size-1.5 animate-pulse rounded-full bg-cobalt" aria-hidden />}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-32px))] rounded-[6px] border-rule p-0">
        <div {...getRootProps({ className: 'relative flex flex-col' })}>
          <input {...getInputProps({ id: 'triage-source-files' })} />
          <div className="flex items-center justify-between border-b border-rule px-3 py-2">
            <span className="text-[12px] font-semibold">
              Sources <span className="num font-mono font-normal text-ink-3">{docs.length}</span>
            </span>
            <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-[4px] px-2 text-[12px]" onClick={open}>
              <Plus className="size-3.5" /> Add files
            </Button>
          </div>
          <ul className="triage-scroll max-h-[320px] overflow-y-auto py-1">
            {docs.map((d) => {
              const n = cites[d.id]?.length ?? 0
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    disabled={d.status === 'parsing'}
                    onClick={() => openSource({ docId: d.id, page: d.content[0]?.n })}
                    className="grid w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-panel-2 disabled:cursor-default disabled:hover:bg-transparent"
                  >
                    <span className="font-mono text-[11px] font-semibold text-cobalt">{d.id}</span>
                    <span className="min-w-0">
                      <span className="block truncate text-[12px] text-ink">{d.name}</span>
                      {d.status === 'parsing' && (
                        <span className="mt-1 block h-[3px] overflow-hidden rounded-full bg-rule">
                          <span className="block h-full bg-cobalt transition-[width] duration-300" style={{ width: `${d.progress ?? 0}%` }} />
                        </span>
                      )}
                    </span>
                    <span className="num font-mono text-[11px] text-ink-3">
                      {d.status === 'parsing' ? (d.parser === 'ocr' ? 'OCR' : 'Parsing') : n ? `${n} cited` : `${d.pages}p`}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <button
            type="button"
            onClick={open}
            className="m-2 mt-1 flex items-center gap-2 rounded-[4px] border border-dashed border-ink-3/40 px-3 py-2 text-left text-[12px] text-ink-2 transition-colors hover:border-cobalt/50 hover:text-ink"
          >
            <Upload className="size-3.5 shrink-0 text-ink-3" />
            Drop PDFs, Word, Excel or email here
          </button>
          {isDragActive && (
            <div className="pointer-events-none absolute inset-1 flex items-center justify-center rounded-[6px] border-2 border-dashed border-cobalt bg-cobalt-soft/90 text-[13px] font-medium text-cobalt">
              Drop to add to this project
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
