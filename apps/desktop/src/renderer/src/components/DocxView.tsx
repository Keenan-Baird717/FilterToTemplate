import { renderAsync } from 'docx-preview'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MARK, markerFields } from '../../../doc-engine/render'
import { registerDocumentFonts, renderPreviewDocx } from '@/lib/docx'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'

// The real filled layout.docx, rendered with docx-preview. Values arrive
// wrapped in invisible markers (see doc-engine/render.ts) and become
// <span class="ftt-val" data-field="…"> or <span class="ftt-missing" …>.
// Any prototype can embed this; overlays passed as children are positioned
// relative to the scrolled document.

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

export interface DocxViewProps {
  /** Underline filled values (missing values are always marked). */
  highlight?: boolean
  /** Called when a filled or missing value in the document is clicked. */
  onValueClick?: (fieldId: string, element: HTMLElement) => void
  /** Largest scale to use when fitting the page to the available width. */
  maxZoom?: number
  /** Field to mark as selected (adds .ftt-selected to its spans). */
  selectedField?: string | null
  className?: string
  /** Rendered inside the scrolled content, above the page (position: absolute works). */
  children?: ReactNode
  'aria-label'?: string
}

export function DocxView({ highlight = true, onValueClick, maxZoom = 1, selectedField, className, children, ...rest }: DocxViewProps) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const scrollRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'rendering' | 'ready' | 'error'>('rendering')
  const [zoom, setZoom] = useState(1)

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
        console.error('[docx]', error)
        if (!cancelled) setState('error')
      }
    }, 180)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [fields, rates])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setZoom(Math.min(maxZoom, (entry.contentRect.width - 32) / PAGE_PX)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [maxZoom])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    host.querySelectorAll('.ftt-selected').forEach((n) => n.classList.remove('ftt-selected'))
    if (selectedField) host.querySelectorAll(`[data-field="${CSS.escape(selectedField)}"]`).forEach((n) => n.classList.add('ftt-selected'))
  }, [selectedField, state, fields, rates])

  return (
    <div ref={scrollRef} className={cn('relative h-full min-h-0 overflow-auto', className)}>
      {state === 'error' && <p className="p-6 text-[13px] text-bad">The layout couldn’t be rendered. Run pnpm template:check.</p>}
      <div className="relative">
        <div
          ref={hostRef}
          className="ftt-docx"
          data-highlight={highlight}
          data-state={state}
          style={{ zoom }}
          aria-label={rest['aria-label'] ?? 'Letter preview'}
          aria-busy={state === 'rendering'}
          onClick={(e) => {
            const el = (e.target as HTMLElement).closest<HTMLElement>('[data-field]')
            if (el?.dataset.field) onValueClick?.(el.dataset.field, el)
          }}
        />
        {children}
      </div>
    </div>
  )
}
