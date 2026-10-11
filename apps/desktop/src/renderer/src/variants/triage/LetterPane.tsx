import { X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { DocxView } from '@/components/DocxView'
import { Button } from '@/components/ui/button'
import { itemById } from './model'
import { useTriage } from './state'

/** The real filled letter, with the selected value marked and scrolled into view. */
export function LetterPane() {
  const selected = useTriage((s) => s.selected)
  const select = useTriage((s) => s.select)
  const setLetterOpen = useTriage((s) => s.setLetterOpen)
  const hostRef = useRef<HTMLDivElement>(null)
  const [marked, setMarked] = useState<boolean | null>(null)
  const item = itemById[selected]

  // Scroll the selected value to the middle once it exists in the rendered page.
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tryScroll = () => {
      const el = host.querySelector<HTMLElement>(`[data-field="${CSS.escape(selected)}"]`)
      const scroller = host.querySelector<HTMLElement>('.overflow-auto')
      const ready = host.querySelector('.ftt-docx[data-state="ready"]')
      if (!ready) return
      setMarked(!!el)
      if (!el || !scroller || done) return
      done = true
      const a = el.getBoundingClientRect()
      const b = scroller.getBoundingClientRect()
      scroller.scrollTo({ top: scroller.scrollTop + (a.top - b.top) - b.height / 2 + a.height / 2, behavior: 'smooth' })
    }
    tryScroll()
    const mo = new MutationObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(tryScroll, 60)
    })
    mo.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-state'] })
    return () => {
      mo.disconnect()
      clearTimeout(timer)
    }
  }, [selected])

  return (
    <section aria-label="Letter preview" className="flex h-full min-h-0 flex-col bg-ground">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-rule bg-panel px-3 text-[12px]">
        <span className="font-medium text-ink">Letter</span>
        <span className="min-w-0 truncate text-ink-3">
          {item && marked !== false ? (
            <>
              Showing <span className="text-cobalt">{item.label}</span>
            </>
          ) : item ? (
            `${item.label} shapes the letter but isn’t a marked value`
          ) : null}
        </span>
        <Button variant="ghost" size="icon" className="ml-auto size-7 rounded-[4px] text-ink-3" aria-label="Hide the letter" onClick={() => setLetterOpen(false)}>
          <X className="size-4" />
        </Button>
      </div>
      <div ref={hostRef} className="min-h-0 flex-1">
        <DocxView highlight={false} selectedField={selected} onValueClick={(id) => itemById[id] && select(id, { detail: true })} aria-label="Filled engagement letter" />
      </div>
    </section>
  )
}
