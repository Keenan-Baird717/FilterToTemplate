import './theme.css'
import { Download, Menu, MoreHorizontal, PanelRightClose, PanelRightOpen, Paperclip, RotateCcw, Upload } from 'lucide-react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { project, template } from '../../../../agent-core/demo-data'
import type { AppUIMessage } from '../../../../shared/protocol'
import { Conversation, ConversationContent, ConversationScrollButton } from '@/components/ai-elements/conversation'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { runFill, useAgent, useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { ArtifactPanel, useParsingSimulation } from './ArtifactPanel'
import { runExport } from './cards'
import { Composer } from './Composer'
import { Rail } from './Rail'
import { Thread } from './Thread'
import { useChatUI } from './ui-store'
import { ProgressRing, useMediaQuery } from './shared'

/** Open the document beside the chat the first time the agent changes it in a turn. */
function useAutoOpen(enabled: boolean, busy: boolean, messages: AppUIMessage[]) {
  const flash = useApp((s) => s.flash)
  const lastUser = messages.findLast((m) => m.role === 'user')?.id
  const handled = useRef<string | null>(null)
  const since = useRef(Date.now())
  useEffect(() => {
    if (!enabled || !busy || !lastUser || handled.current === lastUser) return
    let latest = 0
    for (const t of Object.values(flash)) latest = Math.max(latest, t)
    if (latest <= since.current) return
    handled.current = lastUser
    const ui = useChatUI.getState()
    if (!ui.panelOpen) ui.openPanel('document')
  }, [flash, busy, enabled, lastUser])
}

/** Route the shared Ctrl/⌘K "jump to field" and "show preview" actions into this layout's panel. */
function useCommandBridge() {
  useEffect(() => {
    const { focusField, setView } = useApp.getState()
    useApp.setState({
      focusField: (id) => useChatUI.getState().openPanel('fields', id),
      setView: (view) => {
        setView(view)
        useChatUI.getState().openPanel(view === 'preview' ? 'document' : 'fields')
      }
    })
    return () => useApp.setState({ focusField, setView })
  }, [])
}

function Header({
  wide,
  panelOpen,
  busy,
  onTogglePanel,
  onMenu,
  onFillAgain,
  onAddFiles
}: {
  wide: boolean
  panelOpen: boolean
  busy: boolean
  onTogglePanel: () => void
  onMenu: () => void
  onFillAgain: () => void
  onAddFiles: () => void
}) {
  const { counts, done, total } = useSummary()
  const openPanel = useChatUI((s) => s.openPanel)
  const attention = counts.conflict + counts.missing

  return (
    <header className="flex h-14 shrink-0 items-center gap-1.5 border-b border-rule px-2 sm:gap-2 sm:px-5">
      {!wide && (
        <Button variant="ghost" size="icon" className="size-9 shrink-0" onClick={onMenu} aria-label="Show projects">
          <Menu className="size-[18px]" />
        </Button>
      )}
      <div className="min-w-0 flex-1 pl-1 sm:pl-0">
        <h1 className="chat-display truncate text-[17px] leading-tight font-semibold text-ink">{project.title}</h1>
        <p className="truncate text-[12px] text-ink-3">
          {project.client} <span className={cn('hidden', !panelOpen && 'sm:inline')}>· {template.name} v{template.version}</span>
        </p>
      </div>
      <button
        type="button"
        onClick={() => openPanel('fields')}
        className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-rule bg-panel px-2.5 text-[12.5px] transition-colors hover:bg-panel-2"
        aria-label={`${done} of ${total} filled${attention ? `, ${attention} need you` : ''}. Show fields`}
      >
        <ProgressRing value={done} total={total} size={16} />
        <span className="num font-medium text-ink">
          {done}/{total}
        </span>
        {attention > 0 && <span className="hidden text-warn md:inline">· {attention} need you</span>}
      </button>
      <Button variant="ghost" size="sm" className={cn('hidden h-8 gap-1.5 text-[13px] text-ink-2', !panelOpen && 'md:flex')} onClick={runExport}>
        <Download className="size-4" /> Export
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9 shrink-0 text-ink-2" aria-label="More actions">
            <MoreHorizontal className="size-[18px]" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={onFillAgain} disabled={busy}>
            <RotateCcw /> Fill again from scratch
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onAddFiles}>
            <Paperclip /> Add documents
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={runExport}>
            <Download /> Export .docx
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="ghost"
        size="sm"
        onClick={onTogglePanel}
        aria-pressed={panelOpen}
        aria-label={panelOpen ? 'Hide the document' : 'Show the document'}
        className={cn('h-9 shrink-0 gap-1.5 px-2.5 text-[13px] sm:px-3', panelOpen ? 'bg-cobalt-soft text-cobalt hover:bg-cobalt-soft hover:text-cobalt' : 'text-ink-2')}
      >
        {panelOpen ? <PanelRightClose className="size-[18px]" /> : <PanelRightOpen className="size-[18px]" />}
        <span className="hidden sm:inline">Document</span>
      </Button>
    </header>
  )
}

export default function ChatPrototype() {
  const wide = useMediaQuery('(min-width: 1024px)')
  const xl = useMediaQuery('(min-width: 1280px)')
  const reduce = useReducedMotion()
  const { messages, status, busy, activity, stop } = useAgent()
  const panelOpen = useChatUI((s) => s.panelOpen)
  const setPanelOpen = useChatUI((s) => s.setPanelOpen)
  const railCollapsed = useChatUI((s) => s.railCollapsed)
  const toggleRail = useChatUI((s) => s.toggleRail)
  const railSheetOpen = useChatUI((s) => s.railSheetOpen)
  const setRailSheetOpen = useChatUI((s) => s.setRailSheetOpen)
  const addFiles = useApp((s) => s.addFiles)

  // "Answer in the chat" from the phone sheet: get the sheet out of the way.
  const questionTick = useChatUI((s) => s.questionTick)
  useEffect(() => {
    if (questionTick && !wide) setPanelOpen(false)
  }, [questionTick, wide, setPanelOpen])

  useParsingSimulation((names) => toast.success(names.length === 1 ? `Indexed ${names[0]}` : `Indexed ${names.length} files`))
  useAutoOpen(wide, busy, messages)
  useCommandBridge()

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (!files.length) return
      addFiles(files.map((f) => ({ name: f.name })))
      toast(files.length === 1 ? `Added ${files[0].name}` : `Added ${files.length} files`, { description: 'Indexing on this device.' })
    }
  })

  const ask = (id: string) => {
    const ui = useChatUI.getState()
    ui.addChip(id)
    if (!wide) ui.closePanel()
    ui.focusComposer()
  }

  const fillAgain = () => {
    setRailSheetOpen(false)
    runFill()
    toast('Filling the letter again', { description: 'The agent starts over from the indexed documents.' })
  }

  const panel = <ArtifactPanel busy={busy} onClose={() => setPanelOpen(false)} onAsk={ask} />

  return (
    <div className="flex h-full min-h-0 overflow-hidden bg-ground text-ink">
      {wide && <Rail collapsed={!xl || railCollapsed} onToggle={xl ? toggleRail : undefined} onNewFill={fillAgain} />}

      <main className="flex min-w-0 flex-1">
        <section {...getRootProps({ className: 'relative flex min-w-0 flex-1 flex-col bg-panel', 'aria-label': 'Conversation' })}>
          <input {...getInputProps({ 'aria-label': 'Add documents' })} />
          <Header
            wide={wide}
            panelOpen={panelOpen}
            busy={busy}
            onTogglePanel={() => setPanelOpen(!panelOpen)}
            onMenu={() => setRailSheetOpen(true)}
            onFillAgain={fillAgain}
            onAddFiles={open}
          />
          <Conversation className="chat-convo min-h-0 flex-1">
            <ConversationContent className="mx-auto w-full max-w-[760px] gap-7 px-4 pt-7 pb-6 sm:px-6">
              <Thread messages={messages} busy={busy} status={status} activity={activity} />
            </ConversationContent>
            <ConversationScrollButton className="bottom-3 size-9 border-rule bg-panel shadow-[var(--chat-lift)]" aria-label="Scroll to the latest message" />
          </Conversation>
          <Composer busy={busy} stop={() => void stop()} onAddFiles={open} />

          {isDragActive && (
            <div className="pointer-events-none absolute inset-3 z-20 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cobalt bg-cobalt-soft/95 text-center">
              <Upload className="size-6 text-cobalt" />
              <p className="text-[15px] font-medium text-cobalt">Drop to add to {project.client}</p>
              <p className="text-[12.5px] text-ink-2">PDF, Word, Excel or email. Parsed on this device.</p>
            </div>
          )}
        </section>

        {wide && (
          <AnimatePresence initial={false}>
            {panelOpen && (
              <motion.aside
                key="artifact"
                aria-label="Document"
                initial={reduce ? false : { width: 0, opacity: 0.4 }}
                animate={{ width: '44%', opacity: 1 }}
                exit={reduce ? undefined : { width: 0, opacity: 0.4 }}
                transition={{ duration: 0.34, ease: [0.25, 0.8, 0.3, 1] }}
                className="h-full max-w-[780px] shrink-0 overflow-hidden border-l border-rule"
              >
                <div className="h-full min-w-[400px]">{panel}</div>
              </motion.aside>
            )}
          </AnimatePresence>
        )}
      </main>

      {!wide && (
        <>
          <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
            <SheetContent side="right" showCloseButton={false} aria-describedby={undefined} className="w-full gap-0 border-rule p-0 sm:max-w-[640px]">
              <SheetTitle className="sr-only">Document</SheetTitle>
              {panel}
            </SheetContent>
          </Sheet>
          <Sheet open={railSheetOpen} onOpenChange={setRailSheetOpen}>
            <SheetContent side="left" showCloseButton={false} aria-describedby={undefined} className="w-[260px] gap-0 border-rule bg-ground p-0 sm:max-w-[260px] [&>nav]:w-full">
              <SheetTitle className="sr-only">Projects</SheetTitle>
              <Rail collapsed={false} onNewFill={fillAgain} />
            </SheetContent>
          </Sheet>
        </>
      )}
    </div>
  )
}
