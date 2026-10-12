import { FileText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import { DocxView } from '@/components/DocxView'
import { Switch } from '@/components/ui/switch'
import { useAgent } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { askAbout, useQuestionState } from './NeedsYouTray'
import { scrollIntoBox, useTray, WIDE_QUERY } from './state'

const WASH_MS = 1600
const labelOf = (fieldId: string) => (fieldId === 'hourlyRates' ? 'Hourly rates' : (fieldDefs[fieldId]?.label ?? fieldId))
const spansOf = (host: HTMLElement, fieldId: string, cls = '') => [...host.querySelectorAll<HTMLElement>(`${cls}[data-field="${CSS.escape(fieldId)}"]`)]

/**
 * Values the agent just changed get a wash. The page is re-rendered on every
 * change, so a negative delay lets a wash continue across renders instead of
 * restarting.
 */
function paintWashes(host: HTMLElement) {
  const { flash, fields } = useApp.getState()
  const now = Date.now()
  for (const [id, at] of Object.entries(flash)) {
    const age = now - at
    if (age > WASH_MS) continue
    for (const el of spansOf(host, id, '.ftt-val')) {
      if (el.dataset.washAt === String(at)) continue
      el.dataset.washAt = String(at)
      el.classList.remove('split-doc-wash')
      void el.offsetWidth
      el.style.animationDelay = `-${age}ms`
      el.classList.add('split-doc-wash')
    }
  }
  // A caret at the end of whatever the agent is writing right now.
  host.querySelectorAll('.split-doc-caret').forEach((n) => n.classList.remove('split-doc-caret'))
  for (const [id, f] of Object.entries(fields)) {
    if (f.status === 'drafting') spansOf(host, id).at(-1)?.classList.add('split-doc-caret')
  }
}

/** Unsent answers from the tray, shown in place (marked "Not sent") until they're sent. */
function paintDrafts(host: HTMLElement, drafts: { fieldId: string; text: string }[]) {
  host.querySelectorAll<HTMLElement>('[data-draft-orig]').forEach((el) => {
    if (drafts.some((d) => d.fieldId === el.dataset.field)) return
    el.textContent = el.dataset.draftOrig ?? ''
    delete el.dataset.draftOrig
    el.classList.remove('split-doc-draft')
  })
  for (const { fieldId, text } of drafts) {
    for (const el of spansOf(host, fieldId)) {
      if (el.dataset.draftOrig === undefined) el.dataset.draftOrig = el.textContent ?? ''
      el.textContent = text
      el.classList.add('split-doc-draft')
    }
  }
}

function useDraftPreview() {
  const { question, skipped, pending } = useQuestionState()
  const phase = useTray((s) => s.phase)
  const draft = useTray((s) => (question ? s.drafts[question.id] : undefined))
  return useMemo(() => {
    if (!question || skipped || phase !== 'idle' || !draft) return []
    return pending.flatMap((item) => {
      const v = draft[item.fieldId]?.trim()
      if (!v) return []
      const text = item.kind === 'choice' ? (item.options?.find((o) => o.value === v)?.display ?? v) : v
      return [{ fieldId: item.fieldId, text }]
    })
  }, [question, skipped, pending, phase, draft])
}

export function LetterPane() {
  const highlight = useApp((s) => s.highlight)
  const setHighlight = useApp((s) => s.setHighlight)
  const flash = useApp((s) => s.flash)
  const selected = useTray((s) => s.selected)
  const selectNonce = useTray((s) => s.selectNonce)
  const { busy } = useAgent()
  const { question, skipped, pending } = useQuestionState()
  const drafts = useDraftPreview()
  const wrapRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLElement | null>(null)
  const [absent, setAbsent] = useState<string | null>(null)

  const live = useRef({ busy, drafts, lastUser: 0, lastFollow: 0, followed: 0, pendingScroll: true })
  live.current.busy = busy
  live.current.drafts = drafts

  const scroller = () => wrapRef.current?.firstElementChild as HTMLElement | null

  /** Bring the selected field's first value into view; note when the letter doesn't print it. */
  const showSelected = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const host = hostRef.current
    const id = useTray.getState().selected
    if (!host || !id) {
      setAbsent(null)
      return
    }
    const el = spansOf(host, id)[0]
    setAbsent(el ? null : id)
    if (el) scrollIntoBox(scroller(), el, { behavior })
  }, [])

  // Follow the agent: keep what it just changed (or is writing) in view, unless the user is reading elsewhere.
  const follow = useCallback((host: HTMLElement) => {
    const l = live.current
    if (!l.busy || Date.now() - l.lastUser < 5000) return
    const { fields, flash } = useApp.getState()
    const drafting = Object.keys(fields).find((id) => fields[id]?.status === 'drafting')
    if (drafting) {
      scrollIntoBox(scroller(), spansOf(host, drafting).at(-1), { block: 'nearest', pad: 64 })
      return
    }
    const [id, at] = Object.entries(flash)
      .filter(([fid, t]) => Date.now() - t < 1200 && t > l.followed && spansOf(host, fid, '.ftt-val').length)
      .sort((a, b) => b[1] - a[1])[0] ?? []
    if (!id || !at || Date.now() - l.lastFollow < 650) return
    l.lastFollow = Date.now()
    l.followed = at
    scrollIntoBox(scroller(), spansOf(host, id, '.ftt-val')[0])
  }, [])

  const onRendered = useCallback(
    (host: HTMLElement) => {
      hostRef.current = host
      paintWashes(host)
      paintDrafts(host, live.current.drafts)
      if (live.current.pendingScroll) {
        // First render after mounting (e.g. switching to the Letter tab): jump to the selection.
        live.current.pendingScroll = false
        showSelected('instant')
      } else if (useTray.getState().selected) {
        const id = useTray.getState().selected!
        setAbsent(spansOf(host, id).length ? null : id)
      }
      follow(host)
    },
    [follow, showSelected]
  )

  useEffect(() => {
    if (hostRef.current) paintWashes(hostRef.current)
  }, [flash])

  useEffect(() => {
    if (hostRef.current) paintDrafts(hostRef.current, drafts)
  }, [drafts])

  // A selection made in the list (or the tray, or the command menu) scrolls the letter to it.
  useEffect(() => {
    const { selectOrigin } = useTray.getState()
    if (!selectNonce) return
    if (selectOrigin !== 'letter') {
      live.current.lastUser = Date.now()
      showSelected()
    } else if (!selected) setAbsent(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectNonce])

  const onValueClick = (fieldId: string) => {
    live.current.lastUser = Date.now()
    useTray.getState().select(fieldId, 'letter')
    setAbsent(null)
    // Narrow layouts show one side at a time: go to the row.
    if (!window.matchMedia(WIDE_QUERY).matches) useApp.getState().setView('fields')
    if (pending.some((i) => i.fieldId === fieldId)) askAbout(fieldId, question, !!skipped)
  }

  const markUser = () => {
    live.current.lastUser = Date.now()
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-ground" aria-label="Letter">
      <div className="flex min-h-[45px] shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-rule bg-panel-2/60 px-4 py-2 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 text-[12px]">
          <FileText className="size-3.5 shrink-0 text-ink-3" aria-hidden />
          <span className="shrink-0 text-[13px] font-medium text-ink">Letter</span>
          <span className="min-w-0 truncate text-ink-3" aria-live="polite">
            {absent ? (
              <>{labelOf(absent)} isn’t printed as text in the letter</>
            ) : busy ? (
              <span className="inline-flex items-center gap-1.5 text-cobalt-ink">
                <span className="relative flex size-1.5 shrink-0" aria-hidden>
                  <span className="absolute inset-0 animate-ping rounded-full bg-cobalt opacity-60" />
                  <span className="relative size-1.5 rounded-full bg-cobalt" />
                </span>
                Updating as the agent writes
              </span>
            ) : (
              'Click a value to find its field'
            )}
          </span>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] text-ink-2" htmlFor="split-highlight">
          Highlight values
          <Switch id="split-highlight" size="sm" checked={highlight} onCheckedChange={setHighlight} />
        </label>
      </div>
      <div
        ref={wrapRef}
        className={cn('relative min-h-0 flex-1', '[&_.ftt-docx_.ftt-val]:outline-offset-2')}
        onWheel={markUser}
        onPointerDown={markUser}
        onKeyDown={markUser}
      >
        <DocxView className="h-full" highlight={highlight} selectedField={selected} onValueClick={onValueClick} onRendered={onRendered} />
      </div>
    </section>
  )
}
