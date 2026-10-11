import { Download, FileText, ListChecks, MousePointerClick, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { DocxView } from '@/components/DocxView'
import { statusMeta } from '@/components/status'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useSummary } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { runExport } from './cards'
import { FieldDetails, FieldsTab } from './FieldsTab'
import { useChatUI, type PanelTab } from './ui-store'
import { fieldLabel, scrollWithin, statusOf, StatusGlyph, statusText, valueOf } from './shared'

const RECENT_MS = 2600

/** The live Word page. Marks what the agent just changed and follows its edits. */
function DocumentTab({ busy, onAsk }: { busy: boolean; onAsk: (id: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const pending = useRef<string | null>(null)
  const selected = useChatUI((s) => s.selected)
  const reveal = useChatUI((s) => s.reveal)
  const select = useChatUI((s) => s.select)
  const addChip = useChatUI((s) => s.addChip)
  const flash = useApp((s) => s.flash)
  const drafting = useApp((s) => Object.entries(s.fields).find(([, f]) => f.status === 'drafting')?.[0] ?? null)

  const tryScroll = () => {
    const root = wrapRef.current
    const id = pending.current
    if (!root || !id) return
    const scroller = root.querySelector<HTMLElement>('.chat-doc-scroller')
    const el = scroller?.querySelector(`.ftt-docx [data-field="${CSS.escape(id)}"]`)
    if (scroller && el) {
      scrollWithin(scroller, el, 0.3)
      pending.current = null
    }
  }

  // After every render of the page: wash recently changed values, then scroll if asked.
  useEffect(() => {
    const root = wrapRef.current
    if (!root) return
    const decorate = () => {
      const now = Date.now()
      root.querySelectorAll('.chat-changed').forEach((n) => n.classList.remove('chat-changed'))
      for (const [id, t] of Object.entries(useApp.getState().flash)) {
        if (now - t < RECENT_MS) root.querySelectorAll(`.ftt-docx [data-field="${CSS.escape(id)}"]`).forEach((n) => n.classList.add('chat-changed'))
      }
      tryScroll()
    }
    const mo = new MutationObserver((records) => {
      if (records.some((r) => r.type === 'childList' && (r.target as HTMLElement).classList?.contains('ftt-docx'))) requestAnimationFrame(decorate)
    })
    mo.observe(root, { childList: true, subtree: true })
    return () => mo.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Follow the agent: scroll to each value it changes while it works.
  useEffect(() => {
    if (!busy) return
    let latest: [string, number] | null = null
    for (const e of Object.entries(flash)) if (!latest || e[1] > latest[1]) latest = e
    if (latest && Date.now() - latest[1] < RECENT_MS) {
      pending.current = latest[0]
      tryScroll()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, busy])

  useEffect(() => {
    if (!drafting) return
    pending.current = drafting
    tryScroll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafting])

  useEffect(() => {
    if (!reveal) return
    pending.current = reveal.id
    const t = setTimeout(tryScroll, 40)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reveal])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={wrapRef} className="relative min-h-0 flex-1 bg-panel-2">
        <DocxView
          className="chat-doc-scroller chat-scroll"
          maxZoom={1.05}
          selectedField={selected}
          aria-label="Engagement letter, live preview"
          onValueClick={(id) => {
            select(id)
            addChip(id)
          }}
        />
        {!selected && (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-4">
            <span className="flex items-center gap-1.5 rounded-full border border-rule bg-panel/95 px-3 py-1.5 text-[12px] text-ink-2 shadow-[var(--chat-lift)] backdrop-blur">
              <MousePointerClick className="size-3.5 text-cobalt" /> Click a value to ask about it
            </span>
          </div>
        )}
      </div>
      {selected && <Inspector id={selected} onAsk={() => onAsk(selected)} />}
    </div>
  )
}

function Inspector({ id, onAsk }: { id: string; onAsk: () => void }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const chips = useChatUI((s) => s.chips)
  const select = useChatUI((s) => s.select)
  const status = statusOf(id, fields, rates)
  const value = valueOf(id, fields, rates)
  const narrative = id === 'scopeSummary'
  return (
    <section aria-label={`${fieldLabel(id)} details`} className="chat-scroll max-h-[46%] shrink-0 overflow-y-auto border-t border-rule bg-panel px-4 pt-3 pb-3.5">
      <div className="flex items-center gap-2">
        <StatusGlyph status={status} />
        <h3 className="min-w-0 truncate text-[13.5px] font-medium text-ink">{fieldLabel(id)}</h3>
        <span className={cn('shrink-0 text-[12px] font-medium', statusText[status])}>{statusMeta[status].label}</span>
        <span className="flex-1" />
        {chips.includes(id) && <span className="hidden text-[11.5px] text-ink-3 sm:inline">Added to your message</span>}
        <Button variant="ghost" size="icon" className="size-7" aria-label="Close details" onClick={() => select(null)}>
          <X className="size-4" />
        </Button>
      </div>
      <p className={cn('mt-1 mb-3 text-[14px] break-words', value ? 'text-ink' : 'text-ink-3 italic', narrative && 'line-clamp-3')}>{value ?? (status === 'missing' ? 'Not in any document' : 'Not filled yet')}</p>
      <FieldDetails id={id} onAsk={onAsk} compact />
    </section>
  )
}

export function ArtifactPanel({ busy, onClose, onAsk }: { busy: boolean; onClose: () => void; onAsk: (id: string) => void }) {
  const tab = useChatUI((s) => s.tab)
  const setTab = useChatUI((s) => s.setTab)
  const { counts } = useSummary()
  const attention = counts.conflict + counts.missing

  return (
    <Tabs value={tab} onValueChange={(v) => setTab(v as PanelTab)} className="flex h-full min-h-0 flex-col gap-0 bg-panel">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-rule px-3">
        <TabsList className="h-9 rounded-[10px] bg-panel-2 p-1">
          <TabsTrigger value="document" className="h-7 gap-1.5 rounded-[7px] px-3 text-[13px] data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
            <FileText className="size-3.5" /> Document
          </TabsTrigger>
          <TabsTrigger value="fields" className="h-7 gap-1.5 rounded-[7px] px-3 text-[13px] data-[state=active]:shadow-[0_1px_2px_rgb(0_0_0/0.08)]">
            <ListChecks className="size-3.5" /> Fields
            {attention > 0 && (
              <span className="num ml-0.5 rounded-full bg-warn-soft px-1.5 font-mono text-[10.5px] leading-[17px] text-warn" aria-label={`${attention} need you`}>
                {attention}
              </span>
            )}
          </TabsTrigger>
        </TabsList>
        <span className="flex-1" />
        {busy && (
          <span className="hidden items-center gap-1.5 text-[12px] text-ink-3 xl:flex">
            <span className="chat-breathe size-1.5 rounded-full bg-cobalt" aria-hidden /> Updating live
          </span>
        )}
        <Button size="sm" variant="outline" className="h-8 gap-1.5 border-rule bg-panel text-[12.5px]" onClick={runExport}>
          <Download className="size-3.5" /> Export .docx
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={onClose} aria-label="Close the document panel">
              <X className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Close</TooltipContent>
        </Tooltip>
      </div>
      <TabsContent value="document" forceMount className="min-h-0 flex-1 data-[state=inactive]:hidden">
        <DocumentTab busy={busy} onAsk={onAsk} />
      </TabsContent>
      <TabsContent value="fields" className="min-h-0 flex-1">
        <FieldsTab onAsk={onAsk} />
      </TabsContent>
    </Tabs>
  )
}

/** Keep the parsing simulation running for files added from this prototype. */
export function useParsingSimulation(onIndexed: (names: string[]) => void) {
  const parsing = useApp((s) => s.docs.some((d) => d.status === 'parsing' && d.id !== 'D8'))
  const advance = useApp((s) => s.advanceParsing)
  const cb = useRef(onIndexed)
  cb.current = onIndexed
  useEffect(() => {
    if (!parsing) return
    const t = setInterval(() => {
      const done = advance()
      if (done.length) cb.current(done)
    }, 450)
    return () => clearInterval(t)
  }, [parsing, advance])
}
