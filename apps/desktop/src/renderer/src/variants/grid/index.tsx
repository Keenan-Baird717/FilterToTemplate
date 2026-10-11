import './theme.css'
import { Upload } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { fieldDefs } from '../../../../agent-core/demo-data'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { submitAnswers, useAgent } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { AnswerBar, Header, Toolbar } from './Chrome'
import { AgentConsole } from './Console'
import { SheetGrid, type GridActions } from './Grid'
import { DocPane, Inspector } from './Inspector'
import { RATES, canApprove } from './model'
import { emailOk, useGrid, useLiveQuestion, useMediaQuery } from './state'

// Grid: every template value in one dense, keyboard-driven sheet, with bulk
// approval, inline answers, a detail inspector and the live Word document.

const EDITABLE = new Set(['text', 'email', 'money', 'date'])

/** Simulated ingest progress for files added in this preview. */
function useParsingTicker() {
  const parsing = useApp((s) => s.docs.some((d) => d.status === 'parsing' && d.id !== 'D8'))
  const advanceParsing = useApp((s) => s.advanceParsing)
  useEffect(() => {
    if (!parsing) return
    const t = setInterval(() => {
      const done = advanceParsing()
      if (done.length) toast.success(done.length === 1 ? `Indexed ${done[0]}` : `Indexed ${done.length} files`)
    }, 450)
    return () => clearInterval(t)
  }, [parsing, advanceParsing])
}

export default function GridPrototype() {
  const wide = useMediaQuery('(min-width: 1024px)')
  const panel = useGrid((s) => s.panel)
  const sheet = useGrid((s) => s.sheet)
  const set = useGrid((s) => s.set)
  const setPref = useGrid((s) => s.setPref)
  const addFiles = useApp((s) => s.addFiles)
  const question = useLiveQuestion()
  const { busy } = useAgent()

  useParsingTicker()

  // Sent answers show as "Sending" only until the agent's turn ends.
  useEffect(() => {
    if (!busy) set({ sent: {} })
  }, [busy, set])

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (!files.length) return
      addFiles(files.map((f) => ({ name: f.name })))
      toast(files.length === 1 ? `Adding ${files[0].name}` : `Adding ${files.length} files`, { description: 'Parsed on this device. The agent can use them on the next run.' })
    }
  })

  const actions: GridActions = useMemo(
    () => ({
      approve: (key) => {
        const { fields, rates, approveField } = useApp.getState()
        const status = key === RATES ? rates.status : fields[key]?.status
        if (status && canApprove(status)) return approveField(key)
        if (status === 'approved') toast.message('Already approved')
        else if (status === 'conflict') toast.message('Choose a value first', { description: 'Press Enter on the row to pick one.' })
        else if (status === 'missing') toast.message('Type a value first', { description: 'Press Enter on the row to start typing.' })
        else toast.message('Waiting for the agent to fill this one')
      },
      startEdit: (key) => {
        if (key.startsWith(RATES)) {
          toast.message('Rates come from the rate card', { description: 'Ask the agent to change them.' })
          return
        }
        const f = useApp.getState().fields[key]
        const def = fieldDefs[key]
        if (!f || !def) return
        if (f.status === 'conflict') return set({ choosing: key })
        if (f.status === 'missing' && (def.kind === 'email' || def.kind === 'text')) {
          document.getElementById(`grid-input-${key}`)?.focus()
          return
        }
        if (f.status === 'drafting' || f.status === 'empty') {
          toast.message('Waiting for the agent to fill this one')
          return
        }
        if (def.kind === 'narrative') {
          set({ editing: key })
          if (wide) setPref('panel', 'inspector')
          else set({ sheet: 'inspector' })
          return
        }
        if (EDITABLE.has(def.kind)) return set({ editing: key })
        toast.message(`${def.label} is a switch in the template`, { description: 'Ask the agent to change it.' })
      },
      submitDraft: () => {
        if (!question || busy) return
        const draft = useGrid.getState().draft
        const missingChoice = question.items.find((i) => i.kind === 'choice' && !draft[i.fieldId])
        if (missingChoice) {
          toast.message('Choose the effective date first')
          set({ choosing: missingChoice.fieldId })
          return
        }
        const values: Record<string, string> = {}
        for (const item of question.items) {
          const v = (draft[item.fieldId] ?? '').trim()
          if (!v) continue
          if (item.inputType === 'email' && !emailOk(v)) {
            document.getElementById(`grid-input-${item.fieldId}`)?.focus()
            return
          }
          values[item.fieldId] = v
        }
        submitAnswers(question, values)
        set({ sent: values, draft: {} })
      }
    }),
    [question, busy, wide, set, setPref]
  )

  const onDocument = () => {
    if (wide) setPref('panel', panel === 'document' ? 'inspector' : 'document')
    else set({ sheet: 'document' })
  }
  const onDetails = () => {
    if (wide) setPref('panel', panel === 'inspector' ? 'none' : 'inspector')
    else set({ sheet: 'inspector' })
  }

  return (
    <div className="grid-root flex h-full min-h-0 flex-col bg-ground text-ink">
      <Header openPicker={open} />
      <Toolbar wide={wide} actions={actions} onDocument={onDocument} onDetails={onDetails} />
      <div className="flex min-h-0 flex-1">
        <div {...getRootProps({ className: 'relative flex min-w-0 flex-1 flex-col bg-panel' })}>
          <input {...getInputProps({ 'aria-label': 'Add files' })} />
          <main className="flex min-h-0 flex-1 flex-col" aria-label="Sheet">
            <AnswerBar actions={actions} />
            <SheetGrid wide={wide} onInspect={() => set({ sheet: 'inspector' })} actions={actions} />
          </main>
          {isDragActive && (
            <div className="pointer-events-none absolute inset-2 z-30 flex flex-col items-center justify-center gap-2 rounded-[8px] border-2 border-dashed border-cobalt bg-cobalt-soft/90 text-[13px] font-medium text-cobalt">
              <Upload className="size-5" />
              Drop to add to this project
            </div>
          )}
        </div>
        {wide && panel !== 'none' && (
          <aside
            className={cn('min-h-0 shrink-0 border-l border-rule', panel === 'document' ? 'w-[46%] max-w-[780px] min-w-[420px]' : 'w-[340px] xl:w-[380px]')}
            aria-label={panel === 'document' ? 'Document' : 'Details'}
          >
            {panel === 'document' ? (
              <DocPane onClose={() => setPref('panel', 'inspector')} closeLabel="Close the document" />
            ) : (
              <Inspector actions={actions} onClose={() => setPref('panel', 'none')} />
            )}
          </aside>
        )}
      </div>
      <AgentConsole />

      {!wide && (
        <Sheet open={!!sheet} onOpenChange={(o) => !o && set({ sheet: null })}>
          <SheetContent side="right" showCloseButton={false} className="grid-root w-full gap-0 border-rule bg-panel p-0 sm:max-w-[460px]">
            <SheetTitle className="sr-only">{sheet === 'document' ? 'Document' : 'Details'}</SheetTitle>
            <SheetDescription className="sr-only">
              {sheet === 'document' ? 'The filled Word document' : 'Value, history and evidence for the selected row'}
            </SheetDescription>
            {sheet === 'document' ? (
              <DocPane onClose={() => set({ sheet: null })} closeLabel="Close" />
            ) : (
              <Inspector actions={actions} onClose={() => set({ sheet: null })} closeLabel="Close details" />
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
