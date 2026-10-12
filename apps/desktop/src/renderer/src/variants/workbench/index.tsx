import { FileText, FolderOpen, MessagesSquare } from 'lucide-react'
import { useEffect } from 'react'
import { ChatPane } from '@/components/ChatPane'
import { FillPane } from '@/components/FillPane'
import { SourcesPane } from '@/components/SourcesPane'
import { TitleBar } from '@/components/TitleBar'
import { useApp, type Pane } from '@/lib/store'
import { cn } from '@/lib/utils'

const tabs: { id: Pane; label: string; icon: typeof FileText }[] = [
  { id: 'sources', label: 'Sources', icon: FolderOpen },
  { id: 'template', label: 'Template', icon: FileText },
  { id: 'chat', label: 'Agent', icon: MessagesSquare }
]

/** The original three-pane layout. */
export default function Workbench() {
  const pane = useApp((s) => s.pane)
  const setPane = useApp((s) => s.setPane)
  const reveal = useApp((s) => s.reveal)

  useEffect(() => {
    if (reveal) useApp.getState().focusField(reveal.fieldId)
  }, [reveal])

  return (
    <div className="flex h-full flex-col bg-ground text-ink">
      <TitleBar />
      {/* Wide: three panes side by side. Narrow: one pane at a time with a tab bar. */}
      <main className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] overflow-clip lg:grid-cols-[232px_minmax(0,1fr)_340px] xl:grid-cols-[264px_minmax(0,1fr)_400px]">
        <div className={cn('min-h-0 border-rule lg:block lg:border-r', pane === 'sources' ? 'block' : 'hidden')}>
          <SourcesPane />
        </div>
        <div className={cn('min-h-0 lg:block', pane === 'template' ? 'block' : 'hidden')}>
          <FillPane />
        </div>
        <div className={cn('min-h-0 border-rule lg:block lg:border-l', pane === 'chat' ? 'block' : 'hidden')}>
          <ChatPane />
        </div>
      </main>
      <nav className="grid shrink-0 grid-cols-3 border-t border-rule bg-panel lg:hidden" aria-label="Panes">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setPane(t.id)}
            aria-current={pane === t.id ? 'page' : undefined}
            className={cn('flex flex-col items-center gap-0.5 py-2 text-[11px]', pane === t.id ? 'text-cobalt' : 'text-ink-3')}
          >
            <t.icon className="size-4.5" />
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  )
}
