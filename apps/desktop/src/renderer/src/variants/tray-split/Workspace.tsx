import { Download, FileText, ListChecks, RotateCcw } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useDefaultLayout } from 'react-resizable-panels'
import { toast } from 'sonner'
import { sections, template } from '../../../../agent-core/demo-data'
import { FieldRowContext, ProgressStrip, SectionBlock } from '@/components/FillPane'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { runFill, useAgent } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { useApp } from '@/lib/store'
import { LetterPane } from './LetterPane'
import { clickGuard, NeedsYouTray, useQuestionState, useTrayRowOptions } from './NeedsYouTray'
import { citedDocAt, safeStorage, scrollIntoBox, useTray } from './state'

/**
 * The template workspace: header, then the field list (tray pinned on top)
 * and the live letter side by side. Narrower windows show one at a time.
 */
export function Workspace({ wide }: { wide: boolean }) {
  const view = useApp((s) => s.view)
  const layout = useDefaultLayout({ id: 'ftt-tray-split-layout', storage: safeStorage, panelIds: ['fields', 'letter'] })

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Template">
      <WorkspaceHeader showToggle={!wide} />
      {wide ? (
        <div className="min-h-0 flex-1">
          <ResizablePanelGroup orientation="horizontal" defaultLayout={layout.defaultLayout} onLayoutChanged={layout.onLayoutChanged}>
            <ResizablePanel id="fields" defaultSize="48" minSize={400} style={{ overflow: 'hidden' }}>
              <FieldsColumn />
            </ResizablePanel>
            <ResizableHandle
              withHandle
              aria-label="Resize the field list and the letter"
              className="z-10 bg-rule transition-colors after:w-2.5 data-[separator=active]:bg-cobalt data-[separator=focus]:bg-cobalt data-[separator=hover]:bg-cobalt/60 [&>div]:h-6 [&>div]:w-2.5 [&>div]:rounded-[3px] [&>div]:border-rule [&>div]:bg-panel [&>div]:text-ink-3"
            />
            <ResizablePanel id="letter" defaultSize="52" minSize={360} style={{ overflow: 'hidden' }}>
              <LetterPane />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      ) : (
        <div className="min-h-0 flex-1">{view === 'preview' ? <LetterPane /> : <FieldsColumn />}</div>
      )}
    </section>
  )
}

function WorkspaceHeader({ showToggle }: { showToggle: boolean }) {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const { busy } = useAgent()
  const { pending, skipped } = useQuestionState()
  const asking = pending.length > 0 && !skipped

  return (
    <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-5 pt-4 pb-3 sm:px-6">
      <div className="flex min-w-56 flex-1 items-baseline gap-2.5">
        <h1 className="truncate text-[19px] leading-tight font-semibold tracking-[-0.01em]">{template.name}</h1>
        <span className="font-mono text-[12px] text-ink-3">v{template.version}</span>
      </div>
      {showToggle && (
        // Phones switch with the tab bar instead.
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)} className="hidden lg:flex">
          <TabsList className="h-8">
            <TabsTrigger value="fields" className="relative h-6 gap-1.5 px-2.5 text-[13px]">
              <ListChecks className="size-3.5" /> Fields
              {asking && view !== 'fields' && (
                <>
                  <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-warn" aria-hidden />
                  <span className="sr-only">, needs you</span>
                </>
              )}
            </TabsTrigger>
            <TabsTrigger value="preview" className="h-6 gap-1.5 px-2.5 text-[13px]">
              <FileText className="size-3.5" /> Letter
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}
      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={runFill} disabled={busy}>
              <RotateCcw className="size-3.5" /> Run again
            </Button>
          </TooltipTrigger>
          <TooltipContent>Clear the fields and watch the agent fill them</TooltipContent>
        </Tooltip>
        <Button size="sm" className="h-8 gap-1.5" onClick={() => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))}>
          <Download className="size-3.5" /> Export .docx
        </Button>
      </div>
    </header>
  )
}

const rowOf = (target: EventTarget | null) => (target as HTMLElement | null)?.closest?.<HTMLElement>('[id^="field-"]') ?? null

/** Progress, the Needs-you tray, then the field rows. Selecting a row finds its value in the letter. */
function FieldsColumn() {
  const rowOptions = useTrayRowOptions()
  const setHoverDoc = useTray((s) => s.setHoverDoc)
  const phase = useTray((s) => s.phase)
  const selected = useTray((s) => s.selected)
  const selectNonce = useTray((s) => s.selectNonce)
  const { pending, skipped } = useQuestionState()
  const rootRef = useRef<HTMLDivElement>(null)
  const asking = pending.length > 0 && !skipped

  const viewport = () => rootRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')
  const rowEl = (id: string | null) => (id ? (rootRef.current?.querySelector<HTMLElement>(`#field-${CSS.escape(id)}`) ?? null) : null)

  // Rows are selectable from the keyboard too.
  useEffect(() => {
    rootRef.current?.querySelectorAll<HTMLElement>('[id^="field-"]').forEach((row) => {
      if (row.tabIndex < 0) row.tabIndex = 0
    })
  })

  // Draw the shared selection (covers the rates row, which has no row options).
  useEffect(() => {
    rootRef.current?.querySelectorAll('[data-split-selected]').forEach((n) => n.removeAttribute('data-split-selected'))
    rowEl(selected)?.setAttribute('data-split-selected', '')
  })

  // A selection made in the letter, the tray or the command menu brings its row into view.
  const mounted = useRef(false)
  useEffect(() => {
    const first = !mounted.current
    mounted.current = true
    const { selectOrigin } = useTray.getState()
    if (!selected || (!first && selectOrigin === 'row')) return
    const t = setTimeout(() => scrollIntoBox(viewport(), rowEl(selected), { behavior: first ? 'instant' : 'smooth' }), first ? 0 : 30)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectNonce])

  const pick = (row: HTMLElement) => {
    const id = row.id.slice('field-'.length)
    useTray.getState().select(id, 'row')
  }


  return (
    <div
      ref={rootRef}
      data-split-fill
      className="flex h-full min-h-0 flex-col bg-panel"
      onClickCapture={(e) => {
        clickGuard.onControl = !!(e.target as HTMLElement).closest('button, a, input, textarea, label, [role="radio"]')
      }}
      onClick={(e) => {
        const row = rowOf(e.target)
        if (row && !clickGuard.onControl) pick(row)
      }}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === rowOf(e.target)) {
          e.preventDefault()
          pick(e.target as HTMLElement)
        }
      }}
      onMouseOver={(e) => setHoverDoc(citedDocAt(e.target))}
      onMouseLeave={() => setHoverDoc(null)}
      onFocus={(e) => setHoverDoc(citedDocAt(e.target))}
      onBlur={() => setHoverDoc(null)}
    >
      {/* Rows that open the tray hover in the warn tone. */}
      {pending.length > 0 && (
        <style>{`${pending
          .map((i) => `[data-split-fill] #field-${CSS.escape(i.fieldId)}:hover:not([data-split-selected])`)
          .join(',')}{background-color:color-mix(in srgb,var(--warn-soft) 45%,transparent)}`}</style>
      )}
      {/* The tray already says what needs the user, so the strip stays quiet meanwhile. */}
      <ProgressStrip status={asking || phase === 'applying' ? null : undefined} />
      <NeedsYouTray />
      <FieldRowContext.Provider value={rowOptions}>
        <ScrollArea className="min-h-0 flex-1">
          <div className="@container mx-auto flex max-w-[880px] flex-col gap-6 px-5 pt-5 pb-16 sm:px-6">
            {sections.map((section) => (
              <SectionBlock key={section.id} section={section} />
            ))}
          </div>
        </ScrollArea>
      </FieldRowContext.Provider>
    </div>
  )
}
