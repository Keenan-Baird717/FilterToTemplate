import { Columns2, Download, FileText, Highlighter, ListChecks, RotateCcw } from 'lucide-react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { sections, template } from '../../../../agent-core/demo-data'
import type { FieldState } from '../../../../shared/protocol'
import { DocxView } from '@/components/DocxView'
import { FieldRowContext, ProgressStrip, SectionBlock, type FieldRowOptions } from '@/components/FillPane'
import { PreviewPane } from '@/components/PreviewPane'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { questionsIn, runFill, useAgent, useOpenQuestion } from '@/lib/agent'
import { exportDocx } from '@/lib/docx'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { scrollToCenter, useMediaQuery, useSidekick } from './state'

type Mode = 'fields' | 'split' | 'preview'

/**
 * The main column: the template's fields (FillPane's building blocks) with a
 * header that adds "Side by side" on very wide screens.
 */
export function FieldsColumn() {
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const split = useSidekick((s) => s.split)
  const setSplit = useSidekick((s) => s.setSplit)
  const selectedId = useSidekick((s) => s.selectedId)
  const select = useSidekick((s) => s.select)
  const wide = useMediaQuery('(min-width: 1600px)')
  const { busy } = useAgent()
  const mode: Mode = view === 'preview' ? 'preview' : split && wide ? 'split' : 'fields'

  const setMode = (m: Mode) => {
    if (m === 'preview') return setView('preview')
    setView('fields')
    setSplit(m === 'split')
  }

  const rowOptions = useMemo<FieldRowOptions>(
    () => ({
      conflictNote: <ConflictNote />,
      renderExtra: (fieldId, field) => <RowExtra fieldId={fieldId} field={field} />,
      selectedId: mode === 'split' ? selectedId : null,
      onSelect: mode === 'split' ? (id) => select(id) : undefined
    }),
    [mode, selectedId, select]
  )

  return (
    <section className="flex h-full min-h-0 flex-col bg-panel" aria-label="Template">
      <header className="flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-rule px-5 py-3 sm:px-6 lg:h-[57px] lg:flex-nowrap lg:py-0">
        <div className="flex min-w-56 flex-1 items-baseline gap-2.5">
          <h1 className="truncate text-[19px] leading-tight font-semibold tracking-[-0.01em]">{template.name}</h1>
          <span className="shrink-0 font-mono text-[12px] text-ink-3">v{template.version}</span>
        </div>
        <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
          <TabsList className="h-8">
            <TabsTrigger value="fields" className="h-6 gap-1.5 px-2.5 text-[13px]">
              <ListChecks className="size-3.5" /> Fields
            </TabsTrigger>
            {wide && (
              <TabsTrigger value="split" className="h-6 gap-1.5 px-2.5 text-[13px]">
                <Columns2 className="size-3.5" /> Side by side
              </TabsTrigger>
            )}
            <TabsTrigger value="preview" className="h-6 gap-1.5 px-2.5 text-[13px]">
              <FileText className="size-3.5" /> Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5" onClick={runFill} disabled={busy}>
                <RotateCcw className="size-3.5" />
                <span className="lg:max-xl:sr-only">Run again</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Clear the fields and watch the agent fill them</TooltipContent>
          </Tooltip>
          <Button size="sm" className="h-8 gap-1.5" onClick={() => exportDocx().catch((e) => toast.error('Export failed', { description: String(e) }))}>
            <Download className="size-3.5" /> Export .docx
          </Button>
        </div>
      </header>

      <ProgressStrip />

      <FieldRowContext.Provider value={rowOptions}>
        <div className="min-h-0 flex-1">
          {mode === 'preview' ? (
            <PreviewPane />
          ) : mode === 'split' ? (
            <div className="grid h-full min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] grid-rows-[minmax(0,1fr)]">
              <FieldList narrow />
              <LetterBeside />
            </div>
          ) : (
            <FieldList />
          )}
        </div>
      </FieldRowContext.Provider>
    </section>
  )
}

/** The scrolling section list. Citation chips report hover so Sources can light the doc up. */
function FieldList({ narrow }: { narrow?: boolean }) {
  const setHoverDoc = useSidekick((s) => s.setHoverDoc)
  const docUnder = (target: EventTarget) => {
    const chip = (target as HTMLElement).closest?.<HTMLElement>('button.group\\/cite')
    return chip?.querySelector('span')?.textContent ?? null
  }
  return (
    <ScrollArea
      className="h-full min-h-0 [&_[data-selected]]:bg-cobalt-soft/50"
      onPointerOver={(e) => setHoverDoc(docUnder(e.target))}
      onPointerLeave={() => setHoverDoc(null)}
      onFocus={(e) => setHoverDoc(docUnder(e.target))}
      onBlur={() => setHoverDoc(null)}
    >
      <div className={cn('@container relative mx-auto flex flex-col gap-6 px-5 pt-5 pb-16 sm:px-6', narrow ? 'max-w-none' : 'max-w-[880px]')}>
        {sections.map((section) => (
          <SectionBlock key={section.id} section={section} />
        ))}
      </div>
    </ScrollArea>
  )
}

/** The live Word document beside the fields (≥1600px). Clicking a value selects its row. */
function LetterBeside() {
  const highlight = useApp((s) => s.highlight)
  const setHighlight = useApp((s) => s.setHighlight)
  const selectedId = useSidekick((s) => s.selectedId)
  const select = useSidekick((s) => s.select)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!selectedId) return
    scrollToCenter(ref.current?.querySelector('.ftt-selected') ?? null)
  }, [selectedId])

  return (
    <div ref={ref} className="flex min-h-0 flex-col border-l border-rule bg-ground">
      <div className="flex items-center justify-between gap-2 border-b border-rule bg-panel px-4 py-2 text-[12px] text-ink-3">
        <span className="flex min-w-0 items-center gap-1.5 truncate">
          <FileText className="size-3.5 shrink-0" /> Letter · updates as values change
        </span>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-ink-2" htmlFor="sk-highlight">
          <Highlighter className="size-3.5" /> Highlight values
          <Switch id="sk-highlight" checked={highlight} onCheckedChange={setHighlight} />
        </label>
      </div>
      <DocxView
        className="flex-1"
        highlight={highlight}
        selectedField={selectedId}
        onValueClick={(id) => {
          select(id)
          scrollToCenter(document.getElementById(`field-${id}`))
        }}
      />
    </div>
  )
}

/** Which follow-up covers a field: still open, skipped, or neither. */
function useQuestionFor(fieldId: string) {
  const open = useOpenQuestion()
  const { messages } = useAgent()
  const answered = useApp((s) => s.answered)
  if (open?.items.some((i) => i.fieldId === fieldId)) return { state: 'open' as const, id: open.id }
  const newest = questionsIn(messages).at(-1)
  if (newest && answered[newest.id] === 'skipped' && newest.items.some((i) => i.fieldId === fieldId)) return { state: 'skipped' as const, id: newest.id }
  return null
}

function PanelLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className="font-medium text-cobalt-ink underline-offset-2 hover:underline"
    >
      {children}
    </button>
  )
}

function ConflictNote() {
  const q = useQuestionFor('effectiveDate')
  const choose = useSidekick((s) => s.choose)
  if (q?.state === 'open')
    return (
      <>
        Two documents disagree. <PanelLink onClick={() => choose('needs')}>Choose one in Needs you</PanelLink>
      </>
    )
  if (q?.state === 'skipped')
    return (
      <>
        Skipped for now.{' '}
        <PanelLink
          onClick={() => {
            useApp.getState().reopenQuestion(q.id)
            choose('needs')
          }}
        >
          Answer now
        </PanelLink>
      </>
    )
  return <>Two documents disagree.</>
}

function RowExtra({ fieldId, field }: { fieldId: string; field: FieldState | undefined }) {
  const q = useQuestionFor(fieldId)
  const choose = useSidekick((s) => s.choose)
  if (field?.status !== 'missing' || !q) return null
  return (
    <p className="text-[12px] text-ink-2">
      {q.state === 'open' ? (
        <PanelLink onClick={() => choose('needs')}>Add it in Needs you</PanelLink>
      ) : (
        <>
          Skipped for now.{' '}
          <PanelLink
            onClick={() => {
              useApp.getState().reopenQuestion(q.id)
              choose('needs')
            }}
          >
            Answer now
          </PanelLink>
        </>
      )}
    </p>
  )
}
