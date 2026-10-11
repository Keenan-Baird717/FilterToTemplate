import { FileText, ListChecks, Monitor, RotateCcw, TextCursorInput } from 'lucide-react'
import { useEffect } from 'react'
import { fieldDefs } from '../../../agent-core/demo-data'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator
} from '@/components/ui/command'
import { runFill } from '@/lib/chat'
import { useApp } from '@/lib/store'
import { variants } from '@/variants/registry'
import { DocBadge } from './status'

export function CommandMenu() {
  const open = useApp((s) => s.commandOpen)
  const setOpen = useApp((s) => s.setCommandOpen)
  const docs = useApp((s) => s.docs)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!useApp.getState().commandOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="Jump to" description="Search fields, documents and actions">
      <CommandInput placeholder="Search fields, documents and actions" />
      <CommandList>
        <CommandEmpty>Nothing matches. Try a field name like “retainer”.</CommandEmpty>
        <CommandGroup heading="Fields">
          {Object.values(fieldDefs).map((f) => (
            <CommandItem key={f.id} value={`field ${f.label} ${f.id}`} onSelect={() => run(() => useApp.getState().focusField(f.id))}>
              <TextCursorInput className="text-ink-3" />
              <span>{f.label}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">{f.id}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Documents">
          {docs.map((d) => (
            <CommandItem key={d.id} value={`doc ${d.name} ${d.id}`} onSelect={() => run(() => useApp.getState().openSource({ docId: d.id, page: d.content[0]?.n }))}>
              <DocBadge kind={d.kind} className="w-9" />
              <span className="truncate">{d.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Prototypes">
          {variants.map((v, i) => (
            <CommandItem key={v.id} value={`prototype ${v.name} ${v.thesis}`} onSelect={() => run(() => useApp.getState().setVariant(v.id))}>
              <span className="w-4 text-center font-mono text-[11px] text-ink-3">{i}</span>
              <span>{v.name}</span>
              <span className="ml-auto truncate pl-3 text-[11px] text-ink-3">{v.thesis}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="action run fill again" onSelect={() => run(runFill)}>
            <RotateCcw className="text-ink-3" /> Run the fill again
          </CommandItem>
          <CommandItem value="action show preview letter" onSelect={() => run(() => useApp.getState().setView('preview'))}>
            <FileText className="text-ink-3" /> Show the letter preview
          </CommandItem>
          <CommandItem value="action show fields" onSelect={() => run(() => useApp.getState().setView('fields'))}>
            <ListChecks className="text-ink-3" /> Show fields
          </CommandItem>
          <CommandItem
            value="action theme toggle dark light"
            onSelect={() =>
              run(() => {
                const s = useApp.getState()
                s.setTheme(s.theme === 'dark' ? 'light' : 'dark')
              })
            }
          >
            <Monitor className="text-ink-3" /> Switch light and dark
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
