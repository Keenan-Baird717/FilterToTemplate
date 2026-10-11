import { FileText, Highlighter } from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { useApp } from '@/lib/store'
import { DocxView } from './DocxView'

export function PreviewPane() {
  const highlight = useApp((s) => s.highlight)
  const setHighlight = useApp((s) => s.setHighlight)
  const focusField = useApp((s) => s.focusField)

  return (
    <div className="flex h-full min-h-0 flex-col bg-ground">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-panel px-5 py-2 text-[12px] text-ink-3 sm:px-6">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText className="size-3.5 shrink-0" />
          <span>Filled layout.docx · page breaks approximate</span>
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-ink-2" htmlFor="highlight-fields">
          <Highlighter className="size-3.5" /> Highlight filled values
          <Switch id="highlight-fields" checked={highlight} onCheckedChange={setHighlight} />
        </label>
      </div>
      <DocxView className="flex-1" highlight={highlight} onValueClick={(id) => focusField(id)} />
    </div>
  )
}
