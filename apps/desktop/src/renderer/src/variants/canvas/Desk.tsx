import { AnimatePresence, motion } from 'motion/react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { DocxView } from '@/components/DocxView'
import { useOpenQuestion } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { Composer } from './Composer'
import { FieldCard } from './FieldCard'
import { useCanvas, useDraft } from './model'
import { anchorFor, decorate, pageParts, spansFor } from './page'

// The desk: the filled letter as the main surface, a card anchored to whatever
// value is open, and the agent composer floating at the bottom.

const CARD_W = 360
/** Height kept clear for the floating composer when deciding where a card fits. */
const BOTTOM_RESERVE = 128
const TOP_GAP = 14
const GAP = 10
const BLOCKS = new Set(['scopeSummary', 'hourlyRates'])

interface CardPos {
  top: number
  left: number
  width: number
  side: 'below' | 'above' | 'margin'
}

export function Desk() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const deskRef = useRef<HTMLDivElement>(null)
  const cardEl = useRef<HTMLDivElement | null>(null)
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const flash = useApp((s) => s.flash)
  const question = useOpenQuestion()
  const draft = useDraft(question)
  const open = useCanvas((s) => s.open)
  const openField = useCanvas((s) => s.openField)
  const closeField = useCanvas((s) => s.closeField)
  const [renders, setRenders] = useState(0)
  const [pos, setPos] = useState<CardPos | null>(null)
  /** Measured card height, tagged with the open it belongs to. */
  const [cardH, setCardH] = useState<{ key: number; h: number }>({ key: -1, h: 0 })
  const [narrow, setNarrow] = useState(false)
  const revealed = useRef<number | null>(null)

  // Latest state for the mutation observer, which outlives renders.
  const ctx = useRef({ fields, rates, flash, question, draft, openId: open?.fieldId ?? null })
  ctx.current = { fields, rates, flash, question, draft, openId: open?.fieldId ?? null }

  const run = useCallback((fresh: boolean) => {
    const parts = pageParts(wrapRef.current)
    if (parts) decorate(parts.host, { ...ctx.current, fresh })
  }, [])

  // Re-decorate every time DocxView swaps in a freshly rendered page, and put
  // keyboard focus back on the value it was on before the swap.
  const focused = useRef<{ id: string; nth: number } | null>(null)
  useEffect(() => {
    const parts = pageParts(wrapRef.current)
    if (!parts) return
    const mo = new MutationObserver(() => {
      run(true)
      setRenders((n) => n + 1)
      const f = focused.current
      const a = document.activeElement
      if (f && (!a || a === document.body)) anchorFor(parts.host, f.id, f.nth)?.focus({ preventScroll: true })
    })
    mo.observe(parts.host, { childList: true })
    // Track the focused value by field, since its element won't survive a re-render.
    const onIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement
      const id = parts.host.contains(t) ? t.dataset.field : undefined
      focused.current = id ? { id, nth: Math.max(0, spansFor(parts.host, id).indexOf(t)) } : null
    }
    const onDown = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest?.('[data-field]')) focused.current = null
    }
    document.addEventListener('focusin', onIn)
    document.addEventListener('pointerdown', onDown)
    return () => {
      mo.disconnect()
      document.removeEventListener('focusin', onIn)
      document.removeEventListener('pointerdown', onDown)
    }
  }, [run])

  // ...and whenever what the page should show changes without a re-render.
  useEffect(() => run(false), [run, fields, rates, question, draft, open])

  useEffect(() => {
    const el = deskRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 680))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Measure the card as soon as it mounts, and whenever its content changes size.
  const openKey = open?.key ?? -1
  const cardRef = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return
      cardEl.current = el
      const ro = new ResizeObserver(() => setCardH({ key: openKey, h: el.offsetHeight }))
      ro.observe(el)
      return () => {
        ro.disconnect()
        if (cardEl.current === el) cardEl.current = null
      }
    },
    [openKey]
  )
  /** The side chosen when the card was revealed, kept while it stays open. */
  const side = useRef<{ key: number; side: CardPos['side'] } | null>(null)
  const shownH = useRef(0)

  // Place the card beside its value (in the desk margin when there's room,
  // otherwise under it, or above it near the bottom) and scroll once so the
  // value and the whole card are in view together.
  useLayoutEffect(() => {
    if (!open || narrow) return setPos(null)
    const parts = pageParts(wrapRef.current)
    if (!parts) return
    const { scroller, content, host } = parts
    const cw = content.clientWidth
    const width = Math.min(CARD_W, cw - 32)
    const el = anchorFor(host, open.fieldId, open.nth)
    if (!el) return setPos({ top: scroller.scrollTop + 24, left: (cw - width) / 2, width, side: 'below' })

    const measured = cardH.key === open.key
    const h = measured ? cardH.h : 320
    const c = content.getBoundingClientRect()
    // Blocks (the scope paragraphs, the rate column) anchor to the whole block.
    const rects = (BLOCKS.has(open.fieldId) ? spansFor(host, open.fieldId) : [el]).map((n) => n.getBoundingClientRect())
    const r = {
      top: Math.min(...rects.map((x) => x.top)),
      bottom: Math.max(...rects.map((x) => x.bottom)),
      left: Math.min(...rects.map((x) => x.left))
    }
    const page = el.closest('section')?.getBoundingClientRect()
    // Everything below in content coordinates (they move with the scroll).
    const off = c.top - scroller.getBoundingClientRect().top + scroller.scrollTop
    const vTop = r.top - c.top
    const vBottom = r.bottom - c.top
    const viewH = scroller.clientHeight - BOTTOM_RESERVE - TOP_GAP
    const viewTop = scroller.scrollTop - off + TOP_GAP
    const maxScroll = scroller.scrollHeight - scroller.clientHeight

    const options: { pos: CardPos; top: number; bottom: number }[] = []
    if (page && c.right - page.right >= width + 40) {
      const top = vTop - 18
      options.push({ pos: { top, left: page.right - c.left + 22, width, side: 'margin' }, top: Math.min(top, vTop), bottom: Math.max(top + h, vBottom) })
    } else {
      const left = Math.min(Math.max(16, r.left - c.left - 14), cw - width - 16)
      options.push({ pos: { top: vBottom + GAP, left, width, side: 'below' }, top: vTop, bottom: vBottom + GAP + h })
      options.push({ pos: { top: vTop - GAP - h, left, width, side: 'above' }, top: vTop - GAP - h, bottom: vBottom })
    }
    const fitsNow = (o: (typeof options)[number]) => o.top >= viewTop && o.bottom <= viewTop + viewH
    // Scroll needed for an option, or null when it can't fully fit even with scrolling.
    const scrollFor = (o: (typeof options)[number]) => {
      const span = o.bottom - o.top
      const lead = open.scroll ? Math.max(0, (viewH - span) * 0.3) : 0
      let viewStart = open.scroll ? o.top - lead : Math.min(Math.max(viewTop, o.bottom - viewH), o.top)
      if (span > viewH) viewStart = o.top
      const target = Math.min(Math.max(0, viewStart + off - TOP_GAP), maxScroll)
      const startAfter = target - off + TOP_GAP
      return o.top >= startAfter - 1 && o.bottom <= startAfter + viewH + 1 ? target : null
    }

    const kept = side.current?.key === open.key ? options.find((o) => o.pos.side === side.current!.side) : undefined
    let choice = kept ?? (open.scroll ? undefined : options.find(fitsNow))
    let scrollTo: number | null = null
    if (kept) scrollTo = null
    else if (!choice) {
      for (const o of options) {
        const t = scrollFor(o)
        if (t !== null) {
          choice = o
          scrollTo = t
          break
        }
      }
    }
    if (!choice) {
      choice = options[0]
      scrollTo = Math.min(Math.max(0, choice.top + off - TOP_GAP), maxScroll)
    }
    setPos(choice.pos)

    // Scroll once per open, after the card has been measured.
    if (measured && revealed.current !== open.key) {
      revealed.current = open.key
      side.current = { key: open.key, side: choice.pos.side }
      shownH.current = h
      if (scrollTo !== null && Math.abs(scrollTo - scroller.scrollTop) > 2) scroller.scrollTo({ top: scrollTo, behavior: 'smooth' })
      if (open.focus) focusCard(cardEl.current)
    } else if (measured && shownH.current !== h) {
      // The card grew or shrank (an edit form, a validation note): keep it in view.
      shownH.current = h
      if (!fitsNow(choice)) {
        const viewStart = Math.min(Math.max(viewTop, choice.bottom - viewH), choice.top)
        scroller.scrollTo({ top: Math.min(Math.max(0, viewStart + off - TOP_GAP), maxScroll), behavior: 'smooth' })
      }
    }
  }, [open, narrow, renders, cardH])

  // Docked (narrow) cards: scroll the value into the visible strip above the card and focus.
  useEffect(() => {
    if (!open || !narrow || cardH.key !== open.key || revealed.current === open.key) return
    revealed.current = open.key
    const parts = pageParts(wrapRef.current)
    const el = parts && anchorFor(parts.host, open.fieldId, open.nth)
    if (parts && el) {
      const s = parts.scroller.getBoundingClientRect()
      const r = el.getBoundingClientRect()
      const visible = parts.scroller.clientHeight - cardH.h - 24
      const target = parts.scroller.scrollTop + (r.top - s.top) - Math.max(16, visible * 0.35)
      parts.scroller.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
    }
    if (open.focus) focusCard(cardEl.current)
  }, [open, narrow, cardH])

  const close = useCallback(
    (refocus: boolean) => {
      const o = useCanvas.getState().open
      closeField()
      if (!refocus || !o) return
      const parts = pageParts(wrapRef.current)
      const el = parts && anchorFor(parts.host, o.fieldId, o.nth)
      el?.focus({ preventScroll: true })
    },
    [closeField]
  )

  // Escape closes the card from anywhere on the desk.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const a = document.activeElement
      if (a && a !== document.body && !deskRef.current?.contains(a)) return
      close(true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  const nthOf = (el: HTMLElement, fieldId: string) => {
    const parts = pageParts(wrapRef.current)
    return parts ? Math.max(0, spansFor(parts.host, fieldId).indexOf(el)) : 0
  }

  const onValue = (fieldId: string, el: HTMLElement) => {
    const nth = nthOf(el, fieldId)
    const cur = useCanvas.getState().open
    if (cur && cur.fieldId === fieldId && cur.nth === nth) return closeField()
    openField(fieldId, { nth })
  }

  const card = open && <FieldCard key={open.fieldId} fieldId={open.fieldId} onClose={() => close(true)} className={narrow ? 'max-h-[min(520px,62vh)] w-full' : 'w-full'} />

  return (
    <div ref={deskRef} className="relative h-full min-h-0 overflow-hidden">
      <div
        ref={wrapRef}
        className="h-full"
        onClick={(e) => {
          const t = e.target as HTMLElement
          if (useCanvas.getState().sheetOpen) useCanvas.getState().setSheetOpen(false)
          if (open && !t.closest('[data-field],[data-cv-card]')) closeField()
        }}
        onKeyDown={(e) => {
          const t = e.target as HTMLElement
          if ((e.key === 'Enter' || e.key === ' ') && t.dataset.field) {
            e.preventDefault()
            openField(t.dataset.field, { nth: nthOf(t, t.dataset.field), focus: true })
          }
        }}
      >
        <DocxView maxZoom={1.1} onValueClick={onValue} aria-label="Engagement letter, filled. Select a value to review it." className="[scrollbar-gutter:stable]">
          {!narrow && (
            <p className="pointer-events-none absolute inset-x-0 top-3.5 text-center text-[12px] text-ink-3 select-none">
              Select any value in the letter to see its source, edit or approve it.
            </p>
          )}
          <AnimatePresence>
            {!narrow && open && (
              <motion.div
                key={open.key}
                ref={cardRef}
                initial={{ opacity: 0, y: pos?.side === 'above' ? 6 : -6, scale: 0.985 }}
                animate={pos ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.18, ease: [0.2, 0.8, 0.2, 1] }}
                className="absolute z-20"
                style={{ top: pos?.top ?? 0, left: pos?.left ?? 0, width: pos?.width ?? CARD_W, visibility: pos ? 'visible' : 'hidden' }}
              >
                {card}
              </motion.div>
            )}
          </AnimatePresence>
        </DocxView>
      </div>

      {/* Narrow desks: the card docks at the bottom instead of covering the small page. */}
      <AnimatePresence>
        {narrow && open && (
          <motion.div
            key="docked"
            ref={cardRef}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
            className="absolute inset-x-4 bottom-4 z-30"
          >
            {card}
          </motion.div>
        )}
      </AnimatePresence>

      <Composer hidden={narrow && !!open} />
    </div>
  )
}

function focusCard(wrapper: HTMLElement | null) {
  if (!wrapper) return
  const target =
    wrapper.querySelector<HTMLElement>('input, textarea, [role="radio"][tabindex="0"]') ?? wrapper.querySelector<HTMLElement>('[data-cv-card]')
  target?.focus({ preventScroll: true })
}
