import type { FieldState, QuestionSet, RatesState } from '../../../../shared/protocol'
import { statusMeta } from '@/components/status'
import { RATES, draftDisplay, labelOf, statusOf } from './model'

// Works on the DOM DocxView renders. Each render replaces the page, so the
// desk re-runs decorate() after every swap: status attributes for styling,
// keyboard access, drafted answers written into the letter, selection and the
// "just changed" wash.

export interface PageParts {
  scroller: HTMLElement
  content: HTMLElement
  host: HTMLElement
}

/** DocxView's scroll container, its positioned content box and the page host. */
export function pageParts(wrapper: HTMLElement | null): PageParts | null {
  const scroller = wrapper?.firstElementChild as HTMLElement | null
  const content = scroller?.querySelector<HTMLElement>(':scope > div.relative')
  const host = scroller?.querySelector<HTMLElement>('.ftt-docx')
  return scroller && content && host ? { scroller, content, host } : null
}

export const spansFor = (host: HTMLElement, fieldId: string) =>
  Array.from(host.querySelectorAll<HTMLElement>(`[data-field="${CSS.escape(fieldId)}"]`))

/** Values without their own marker get anchored to nearby text. */
const fallbackAnchor: Record<string, string> = { 'fee.basis': 'fee.cap', includesLitigation: 'scopeSummary' }

export function anchorFor(host: HTMLElement, fieldId: string, nth: number): HTMLElement | null {
  const spans = spansFor(host, fieldId)
  if (spans.length) return spans[Math.min(nth, spans.length - 1)]
  const alt = fallbackAnchor[fieldId]
  return alt ? (spansFor(host, alt)[0] ?? null) : null
}

/**
 * The layout renders the fee basis as a sentence and the litigation box as a
 * glyph, without markers. Wrap that text so it is clickable like any value.
 */
function wrapFirst(host: HTMLElement, re: RegExp, fieldId: string) {
  if (host.querySelector(`[data-field="${CSS.escape(fieldId)}"]`)) return
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n as Text
    if (text.parentElement?.closest('[data-field]')) continue
    const m = re.exec(text.data)
    if (!m) continue
    const middle = text.splitText(m.index)
    middle.splitText(m[0].length)
    const span = document.createElement('span')
    span.className = 'ftt-val cv-extra'
    span.dataset.field = fieldId
    middle.replaceWith(span)
    span.append(middle)
    return
  }
}

export interface DecorateContext {
  fields: Record<string, FieldState>
  rates: RatesState
  flash: Record<string, number>
  question: QuestionSet | null
  draft: Record<string, string>
  openId: string | null
  /** True right after DocxView swapped in a new page. */
  fresh: boolean
}

export function decorate(host: HTMLElement, ctx: DecorateContext) {
  if (ctx.fresh) {
    wrapFirst(host, /[☐☒]/, 'includesLitigation')
    wrapFirst(host, /hourly basis|fixed fee/, 'fee.basis')
  }
  const now = Date.now()
  const spans = Array.from(host.querySelectorAll<HTMLElement>('[data-field]'))

  for (const el of spans) {
    const id = el.dataset.field ?? ''
    if (!id) continue
    const status = statusOf(id, ctx.fields, ctx.rates)
    const missing = el.classList.contains('ftt-missing')
    el.dataset.cvStatus = status
    // The layout's placeholder for the empty rate table uses the raw id.
    if (missing && id === RATES && el.textContent === `[${RATES}]`) el.textContent = `[${labelOf(id)}]`
    el.tabIndex = 0
    el.setAttribute('role', 'button')

    // A drafted answer for a missing value reads in the letter before it is sent.
    const item = ctx.question?.items.find((i) => i.fieldId === id)
    const drafted = missing && item ? (ctx.draft[id] ?? '').trim() : ''
    if (drafted) {
      if (el.dataset.cvOrig === undefined) el.dataset.cvOrig = el.textContent ?? ''
      el.textContent = draftDisplay(item!, drafted)
      el.dataset.cvDraft = 'true'
    } else if (el.dataset.cvOrig !== undefined) {
      el.textContent = el.dataset.cvOrig
      delete el.dataset.cvOrig
      delete el.dataset.cvDraft
    }

    const candidates = ctx.fields[id]?.candidates?.length ?? 0
    if (missing && status === 'conflict' && !drafted) el.dataset.cvHint = `${candidates || 2} options`
    else delete el.dataset.cvHint

    const label = labelOf(id)
    const state = drafted ? 'your answer, not sent' : statusMeta[status].label.toLowerCase()
    el.setAttribute('aria-label', missing && !drafted ? `${label}: ${state}` : `${label}: ${el.textContent} (${state})`)
    el.title = drafted ? 'Your answer · not sent yet' : ''

    el.classList.toggle('cv-selected', id === ctx.openId)

    if (ctx.fresh) {
      const t = ctx.flash[id]
      if (t && now - t < 2000) el.classList.add('cv-flash')
    }
  }
}
