import { Search } from 'lucide-react'
import { project } from '../../../agent-core/demo-data'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useApp } from '@/lib/store'
import { isMacLike } from './PrototypeBar'

/** Workbench header: breadcrumb and the jump-to search. */
export function TitleBar() {
  const setCommandOpen = useApp((s) => s.setCommandOpen)

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-rule bg-ground px-3">
      <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
        <span className="truncate text-ink-2">{project.client}</span>
        <span className="text-ink-3">/</span>
        <span className="truncate text-ink">{project.title}</span>
      </nav>

      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="hidden h-7 w-full max-w-[340px] items-center gap-2 rounded-md border border-rule bg-panel px-2.5 text-[12px] text-ink-3 transition-colors hover:text-ink-2 md:flex"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Jump to a field or document</span>
          <Kbd>{isMacLike() ? '⌘' : 'Ctrl'} K</Kbd>
        </button>
      </div>

      <Button variant="ghost" size="icon" className="size-8 md:hidden" onClick={() => setCommandOpen(true)} aria-label="Search">
        <Search className="size-4" />
      </Button>
    </header>
  )
}
