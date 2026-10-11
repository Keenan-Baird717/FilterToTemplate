import { Check, ChevronRight, Download, Files, ListTree, Plus, RotateCcw } from 'lucide-react'
import { createContext, useContext, useState } from 'react'
import { toast } from 'sonner'
import { project, template } from '../../../../agent-core/demo-data'
import { DocBadge } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { runFill, useAgent, useSummary } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { citationsByDoc, useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { attentionIds, labelOf, useCanvas } from './model'

// Minimal chrome above the desk: what this is, how far along it is, and the
// few actions that apply to the whole letter.

export const FilePicker = createContext<() => void>(() => {})

export function Toolbar() {
  const setOutlineOpen = useCanvas((s) => s.setOutlineOpen)
  const { busy } = useAgent()

  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-rule px-4 sm:gap-2.5 lg:px-5">
      <Button variant="ghost" size="icon" className="-ml-1.5 size-8 shrink-0 text-ink-2 lg:hidden" aria-label="Show outline" onClick={() => setOutlineOpen(true)}>
        <ListTree className="size-4" />
      </Button>
      <div className="flex min-w-0 flex-1 items-baseline gap-2">
        <h1 className="min-w-0 truncate text-[14px] font-semibold tracking-[-0.01em] text-ink sm:text-[15px]">
          {project.title}
          <span className="hidden font-normal text-ink-2 sm:inline"> · {project.client}</span>
        </h1>
        <span className="hidden shrink-0 rounded-md border border-rule px-1.5 font-mono text-[11px] leading-5 text-ink-3 md:inline" title={`${template.name} template, version ${template.version}`}>
          v{template.version}
        </span>
      </div>

      <Progress />
      <NeedYou />

      <span className="mx-0.5 hidden h-5 w-px bg-rule sm:block" aria-hidden />

      <SourcesButton />
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-ink-2 md:px-2.5" onClick={runFill} disabled={busy} aria-label="Run the fill again">
            <RotateCcw className="size-3.5" />
            <span className="hidden xl:inline">Run again</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Clear the values and fill the letter again</TooltipContent>
      </Tooltip>
      <Button
        size="sm"
        className="h-8 shrink-0 gap-1.5 px-2.5"
        aria-label="Export .docx"
        onClick={() => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))}
      >
        <Download className="size-3.5" />
        <span className="hidden sm:inline">Export .docx</span>
      </Button>
    </header>
  )
}

function Progress() {
  const { total, done } = useSummary()
  const r = 9
  const c = 2 * Math.PI * r
  const complete = done === total
  return (
    <div className="flex shrink-0 items-center gap-2" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-label={`${done} of ${total} items filled`}>
      <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden>
        <circle cx="12" cy="12" r={r} fill="none" strokeWidth="3" className="stroke-rule" />
        <circle
          cx="12"
          cy="12"
          r={r}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - done / total)}
          className={cn('transition-[stroke-dashoffset,stroke] duration-700 ease-out', complete ? 'stroke-ok' : 'stroke-cobalt')}
        />
      </svg>
      <span className="num hidden text-[13px] whitespace-nowrap text-ink min-[480px]:inline">
        <span className="font-semibold">{done}</span>
        <span className="text-ink-3">/{total}</span>
        <span className="hidden text-ink-3 md:inline"> filled</span>
      </span>
    </div>
  )
}

/** "N need you": each press opens the next value that needs a decision. */
function NeedYou() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const { busy } = useAgent()
  const { total, done } = useSummary()
  const open = useCanvas((s) => s.open)
  const openField = useCanvas((s) => s.openField)
  const ids = attentionIds(fields, rates)

  if (ids.length) {
    const at = open ? ids.indexOf(open.fieldId) : -1
    const next = ids[(at + 1) % ids.length]
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={() => openField(next, { scroll: true, focus: true })}
            aria-label={`${ids.length} need you. Go to ${labelOf(next)}`}
            className="flex h-7 shrink-0 items-center gap-1.5 rounded-full bg-warn-soft pr-1.5 pl-2.5 text-[12px] font-medium whitespace-nowrap text-warn transition-[filter] hover:brightness-[0.97] dark:hover:brightness-110"
          >
            <span className="size-1.5 rounded-full bg-warn" aria-hidden />
            <span className="num">{ids.length}</span>
            <span className="hidden sm:inline">need you</span>
            <ChevronRight className="size-3.5" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Go to {labelOf(next)}</TooltipContent>
      </Tooltip>
    )
  }
  if (!busy && done === total) {
    return (
      <span className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-ok-soft px-2.5 text-[12px] font-medium whitespace-nowrap text-ok">
        <Check className="size-3.5" aria-hidden />
        <span className="hidden sm:inline">Ready to export</span>
        <span className="sr-only sm:hidden">Ready to export</span>
      </span>
    )
  }
  return null
}

const parserLabel = { 'text-layer': 'Text layer', ocr: 'OCR', word: 'Word', sheet: 'Sheet', email: 'Email' } as const

function SourcesButton() {
  const docs = useApp((s) => s.docs)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const openSource = useApp((s) => s.openSource)
  const pick = useContext(FilePicker)
  const [open, setOpen] = useState(false)
  const cites = citationsByDoc(fields, rates)
  const pages = docs.reduce((n, d) => n + d.pages, 0)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 px-2 text-ink-2 md:px-2.5" aria-label={`Sources, ${docs.length} files`}>
          <Files className="size-3.5" />
          <span className="hidden md:inline">Sources</span>
          <span className="num hidden rounded-full bg-panel-2 px-1.5 font-mono text-[10px] leading-4 text-ink-2 sm:inline">{docs.length}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[min(380px,calc(100vw-32px))] rounded-xl border-rule p-0 shadow-[var(--cv-float)]">
        <div className="flex items-center gap-3 px-4 pt-3.5 pb-2.5">
          <div className="min-w-0 flex-1">
            <h2 className="text-[13px] font-semibold text-ink">Sources</h2>
            <p className="num text-[12px] text-ink-3">
              {docs.length} files · {pages} pages · read on this device
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-8 gap-1.5"
            onClick={() => {
              setOpen(false)
              pick()
            }}
          >
            <Plus className="size-3.5" /> Add files
          </Button>
        </div>
        <ul className="flex max-h-[min(400px,58vh)] flex-col gap-px overflow-y-auto border-t border-rule p-1.5">
          {docs.map((d) => {
            const count = cites[d.id]?.length ?? 0
            const parsing = d.status === 'parsing'
            return (
              <li key={d.id}>
                <button
                  type="button"
                  disabled={parsing}
                  onClick={() => {
                    setOpen(false)
                    openSource({ docId: d.id, page: d.content[0]?.n })
                  }}
                  className="flex w-full min-w-0 items-start gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-panel-2 disabled:cursor-default disabled:hover:bg-transparent"
                >
                  <DocBadge kind={d.kind} className="mt-px" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-ink">{d.name}</span>
                    {parsing ? (
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-1 flex-1 overflow-hidden rounded-full bg-rule">
                          <span className="block h-full rounded-full bg-cobalt transition-[width] duration-300" style={{ width: `${d.progress ?? 0}%` }} />
                        </span>
                        <span className="font-mono text-[10px] text-ink-3">{d.parser === 'ocr' ? 'Reading scan' : 'Reading'}</span>
                      </span>
                    ) : (
                      <span className="num block text-[11px] text-ink-3">
                        {d.kind === 'xlsx' ? '1 sheet' : d.kind === 'eml' ? '1 message' : `${d.pages} pages`} · {parserLabel[d.parser]} · added {d.added}
                      </span>
                    )}
                  </span>
                  {count > 0 && (
                    <span className="num mt-0.5 shrink-0 text-[11px] text-ink-3" title={`Cited ${count} times`}>
                      {count} cited
                    </span>
                  )}
                </button>
              </li>
            )
          })}
        </ul>
        <p className="border-t border-rule px-4 py-2.5 text-[11px] text-ink-3">Drop files anywhere on the desk to add them.</p>
      </PopoverContent>
    </Popover>
  )
}
