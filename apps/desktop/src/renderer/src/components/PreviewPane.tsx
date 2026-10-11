import { renderAsync } from 'docx-preview'
import { FileText, Highlighter, LoaderCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { MARK, markerFields } from '../../../doc-engine/render'
import { Switch } from '@/components/ui/switch'
import { registerDocumentFonts, renderPreviewDocx } from '@/lib/docx'
import { useApp } from '@/lib/store'

// Renders the real filled layout.docx (docxtemplater) with docx-preview. The
// preview variant carries invisible markers around each value; after render
// they become spans the user can click to jump to the field.

const PAGE_PX = 816 // US Letter width at 96 dpi
const markerRe = new RegExp(`([${MARK.start}${MARK.missing}])(\\d+)${MARK.sep}([^${MARK.end}]*)${MARK.end}`, 'g')

function decorate(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const hits: Text[] = []
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    if (t.data.includes(MARK.start) || t.data.includes(MARK.missing)) hits.push(t)
  }
  for (const node of hits) {
    const frag = document.createDocumentFragment()
    let last = 0
    for (const m of node.data.matchAll(markerRe)) {
      if (m.index > last) frag.append(node.data.slice(last, m.index))
      const span = document.createElement('span')
      span.className = m[1] === MARK.missing ? 'ftt-missing' : 'ftt-val'
      span.dataset.field = markerFields[Number(m[2])] ?? ''
      span.textContent = m[3]
      frag.append(span)
      last = m.index + m[0].length
    }
    if (last < node.data.length) frag.append(node.data.slice(last))
    node.replaceWith(frag)
  }
}

export function PreviewPane() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const highlight = useApp((s) => s.highlight)
  const setHighlight = useApp((s) => s.setHighlight)
  const focusField = useApp((s) => s.focusField)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'rendering' | 'ready' | 'error'>('rendering')
  const [zoom, setZoom] = useState(1)

  // Re-render the document whenever the fill state changes (debounced while
  // the agent is streaming values in).
  useEffect(() => {
    registerDocumentFonts()
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const bytes = await renderPreviewDocx()
        const staging = document.createElement('div')
        await renderAsync(bytes, staging, staging, {
          className: 'docx',
          inWrapper: true,
          breakPages: true,
          ignoreLastRenderedPageBreak: true,
          renderHeaders: true,
          renderFooters: true,
          useBase64URL: true
        })
        if (cancelled || !hostRef.current) return
        decorate(staging)
        hostRef.current.replaceChildren(...staging.childNodes)
        setState('ready')
      } catch (error) {
        console.error('[preview]', error)
        if (!cancelled) setState('error')
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [fields, rates])

  // Scale pages down to fit narrow panes.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setZoom(Math.min(1, (entry.contentRect.width - 32) / PAGE_PX)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="flex h-full min-h-0 flex-col bg-ground">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule bg-panel px-5 py-2 text-[12px] text-ink-3 sm:px-6">
        <span className="flex min-w-0 items-center gap-1.5">
          <FileText className="size-3.5 shrink-0" />
          <span>Filled layout.docx · page breaks approximate</span>
          {state === 'rendering' && <LoaderCircle className="size-3.5 shrink-0 animate-spin" aria-label="Rendering" />}
        </span>
        <label className="flex cursor-pointer items-center gap-2 text-ink-2" htmlFor="highlight-fields">
          <Highlighter className="size-3.5" /> Highlight filled values
          <Switch id="highlight-fields" checked={highlight} onCheckedChange={setHighlight} />
        </label>
      </div>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        {state === 'error' && (
          <p className="p-6 text-[13px] text-bad">The layout couldn’t be rendered. Check the template with pnpm template:check.</p>
        )}
        <div
          ref={hostRef}
          className="ftt-docx"
          data-highlight={highlight}
          style={{ zoom }}
          aria-label="Letter preview"
          onClick={(e) => {
            const id = (e.target as HTMLElement).closest<HTMLElement>('[data-field]')?.dataset.field
            if (id) focusField(id)
          }}
        />
      </div>
    </div>
  )
}
