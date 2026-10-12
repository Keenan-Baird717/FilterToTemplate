import './theme.css'
import { Upload } from 'lucide-react'
import { useEffect } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Desk } from './Desk'
import { useCanvas } from './model'
import { Outline, Rail } from './Outline'
import { FilePicker, Toolbar } from './Toolbar'

/**
 * Canvas: the letter is the interface. The filled Word page is the main
 * surface; every value on it opens a card to verify, edit, approve or answer
 * in place. An outline, a slim toolbar and a floating agent composer recede
 * around it.
 */
export default function Canvas() {
  const addFiles = useApp((s) => s.addFiles)
  const advanceParsing = useApp((s) => s.advanceParsing)
  const parsing = useApp((s) => s.docs.some((d) => d.status === 'parsing' && d.id !== 'D8'))
  const railCollapsed = useCanvas((s) => s.railCollapsed)
  const setRailCollapsed = useCanvas((s) => s.setRailCollapsed)
  const outlineOpen = useCanvas((s) => s.outlineOpen)
  const setOutlineOpen = useCanvas((s) => s.setOutlineOpen)

  // Simulated ingest for files added in this preview.
  useEffect(() => {
    if (!parsing) return
    const t = setInterval(() => {
      const done = advanceParsing()
      if (done.length) toast.success(done.length === 1 ? `Read ${done[0]}` : `Read ${done.length} files`)
    }, 450)
    return () => clearInterval(t)
  }, [parsing, advanceParsing])

  // The command menu's "jump to field": go to it on the page and open its card.
  useEffect(
    () =>
      useApp.subscribe((s, prev) => {
        if (s.reveal && s.reveal !== prev.reveal) useCanvas.getState().openField(s.reveal.fieldId, { scroll: true, focus: true })
      }),
    []
  )

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    noClick: true,
    noKeyboard: true,
    onDrop: (files) => {
      if (!files.length) return
      addFiles(files.map((f) => ({ name: f.name })))
      toast(files.length === 1 ? `Adding ${files[0].name}` : `Adding ${files.length} files`, { description: 'Reading on this device. They show under Sources.' })
    }
  })

  return (
    <FilePicker.Provider value={open}>
      <div {...getRootProps({ className: 'relative flex h-full min-h-0 flex-col bg-ground text-ink' })}>
        <input {...getInputProps({ id: 'source-files', 'aria-label': 'Add documents' })} />
        <Toolbar />
        <div className="flex min-h-0 flex-1">
          <aside
            className={cn(
              'hidden shrink-0 border-r border-rule transition-[width] duration-200 ease-out lg:block',
              railCollapsed ? 'w-[52px]' : 'w-[256px]'
            )}
          >
            {railCollapsed ? <Rail onExpand={() => setRailCollapsed(false)} /> : <Outline onCollapse={() => setRailCollapsed(true)} />}
          </aside>
          <main className="min-w-0 flex-1" aria-label="Letter">
            <Desk />
          </main>
        </div>

        <Sheet open={outlineOpen} onOpenChange={setOutlineOpen}>
          <SheetContent side="left" className="w-[min(320px,86vw)] gap-0 border-rule bg-ground p-0 pt-2">
            <SheetTitle className="sr-only">Letter outline</SheetTitle>
            <SheetDescription className="sr-only">Every value in the letter with its state. Select one to open it on the page.</SheetDescription>
            <Outline onPick={() => setOutlineOpen(false)} />
          </SheetContent>
        </Sheet>

        {isDragActive && (
          <div className="pointer-events-none absolute inset-3 z-50 flex flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cobalt bg-cobalt-soft/90 text-cobalt">
            <Upload className="size-6" />
            <p className="text-[14px] font-medium">Drop to add to this project</p>
            <p className="text-[12px] text-ink-2">PDF, Word, Excel or email. Read on this device.</p>
          </div>
        )}
      </div>
    </FilePicker.Provider>
  )
}
