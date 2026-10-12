import { PanelLeftClose, PanelLeftOpen, Plus } from 'lucide-react'
import { project, template } from '../../../../agent-core/demo-data'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useEngineName, useSummary } from '@/lib/agent'
import { cn } from '@/lib/utils'

// Invented past projects, shown only to suggest what the list looks like.
const examples = [
  { initials: 'NT', client: 'Northwind Traders', title: 'Mutual NDA', when: 'Sep 30' },
  { initials: 'BF', client: 'Brightline Foods', title: 'Vendor agreement', when: 'Sep 12' },
  { initials: 'OC', client: 'Oakridge Clinics', title: 'Engagement letter', when: 'Aug 28' }
]

function Monogram({ text, active }: { text: string; active?: boolean }) {
  return (
    <span
      className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-[9px] font-mono text-[11px] font-medium',
        active ? 'bg-cobalt-soft text-cobalt' : 'bg-panel-2 text-ink-3'
      )}
      aria-hidden
    >
      {text}
    </span>
  )
}

export function Rail({ collapsed, onToggle, onNewFill }: { collapsed: boolean; onToggle?: () => void; onNewFill: () => void }) {
  const { done, total } = useSummary()
  const engine = useEngineName()

  if (collapsed) {
    return (
      <nav aria-label="Projects" className="flex h-full w-14 shrink-0 flex-col items-center gap-2 border-r border-rule bg-ground py-3">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="size-9 rounded-[10px] border-rule bg-panel" onClick={onNewFill} aria-label="New fill">
              <Plus className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">New fill</TooltipContent>
        </Tooltip>
        <div className="my-1 h-px w-6 bg-rule" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-current="page" className="relative rounded-[10px] p-0.5 ring-1 ring-cobalt/40" aria-label={`${project.client}, ${project.title}, ${done} of ${total} filled`}>
              <Monogram text="AH" active />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {project.client} · {done}/{total}
          </TooltipContent>
        </Tooltip>
        {examples.map((e) => (
          <Tooltip key={e.client}>
            <TooltipTrigger asChild>
              <span tabIndex={0} className="rounded-[10px] p-0.5 opacity-70 outline-none focus-visible:ring-2 focus-visible:ring-cobalt" aria-label={`Example: ${e.client}, ${e.title}`}>
                <Monogram text={e.initials} />
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">
              Example · {e.client}
            </TooltipContent>
          </Tooltip>
        ))}
        <span className="flex-1" />
        {onToggle && (
          <Button variant="ghost" size="icon" className="size-8 text-ink-3" onClick={onToggle} aria-label="Expand the sidebar">
            <PanelLeftOpen className="size-4" />
          </Button>
        )}
      </nav>
    )
  }

  return (
    <nav aria-label="Projects" className="flex h-full w-[236px] shrink-0 flex-col border-r border-rule bg-ground">
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        <Button variant="outline" className="h-9 flex-1 justify-start gap-2 rounded-[10px] border-rule bg-panel px-3 text-[13px] font-medium" onClick={onNewFill}>
          <Plus className="size-4" /> New fill
        </Button>
        {onToggle && (
          <Button variant="ghost" size="icon" className="size-9 text-ink-3" onClick={onToggle} aria-label="Collapse the sidebar">
            <PanelLeftClose className="size-4" />
          </Button>
        )}
      </div>

      <div className="chat-scroll min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <div className="px-2 pt-3 pb-1.5 text-[11.5px] font-medium text-ink-3">Current</div>
        <div aria-current="page" className="flex items-center gap-2.5 rounded-[10px] bg-panel px-2 py-2 shadow-[0_0_0_1px_var(--rule)]">
          <Monogram text="AH" active />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-ink">{project.client}</span>
            <span className="block truncate text-[12px] text-ink-3">{project.title}</span>
          </span>
          <span className="num shrink-0 font-mono text-[11px] text-ink-3" aria-label={`${done} of ${total} filled`}>
            {done}/{total}
          </span>
        </div>

        <div className="flex items-center justify-between px-2 pt-5 pb-1.5">
          <span className="text-[11.5px] font-medium text-ink-3">Earlier</span>
          <span className="rounded-full border border-dashed border-ink-3/50 px-1.5 text-[10.5px] leading-[16px] text-ink-3">Examples</span>
        </div>
        <ul className="flex flex-col gap-0.5" aria-label="Example projects (not real)">
          {examples.map((e) => (
            <li key={e.client} className="flex items-center gap-2.5 rounded-[10px] px-2 py-2 opacity-75" title="Example only. Not a real project.">
              <Monogram text={e.initials} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] text-ink-2">{e.client}</span>
                <span className="block truncate text-[12px] text-ink-3">
                  {e.title} · {e.when}
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-rule px-4 py-3">
        <div className="truncate text-[12px] text-ink-2">
          {template.name} <span className="font-mono text-[11px] text-ink-3">v{template.version}</span>
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 truncate text-[11.5px] text-ink-3">
          <span className="size-1.5 shrink-0 rounded-full bg-warn" aria-hidden />
          {engine}
        </div>
      </div>
    </nav>
  )
}
