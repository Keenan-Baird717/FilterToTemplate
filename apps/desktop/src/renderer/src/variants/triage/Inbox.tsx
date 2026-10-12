import { CheckCheck } from 'lucide-react'
import { LayoutGroup, motion } from 'motion/react'
import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { toast } from 'sonner'
import { sections } from '../../../../agent-core/demo-data'
import type { QuestionSet } from '../../../../shared/protocol'
import { useOpenQuestion } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { StatusIcon } from './bits'
import { canApprove, docIdsOf, groupItems, groupOrder, groupTitle, items, rowValue, sourcesOf, statusOf, visibleOrder, type Item } from './model'
import { useJustChanged, useTriage } from './state'

const spring = { type: 'spring', stiffness: 520, damping: 42, mass: 0.8 } as const

/** Left column: every item, grouped by what it needs from the reviewer. */
export function Inbox() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const filter = useTriage((s) => s.filter)
  const selected = useTriage((s) => s.selected)
  const groups = useMemo(() => groupItems(fields, rates, filter), [fields, rates, filter])
  const listRef = useRef<HTMLDivElement>(null)
  const question = useOpenQuestion()

  // Keep the selected row in view as the selection or the grouping changes.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-item="${CSS.escape(selected)}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [selected, groups])

  return (
    <nav aria-label="Review items" className="flex h-full min-h-0 flex-col bg-panel">
      <InboxHeader />
      <motion.div
        ref={listRef}
        layoutScroll
        role="listbox"
        tabIndex={0}
        aria-label="Items to review"
        aria-activedescendant={`triage-opt-${selected}`}
        className="triage-scroll min-h-0 flex-1 overflow-y-auto pb-6 focus-visible:outline-1 focus-visible:outline-offset-[-1px]"
        onKeyDown={(e) => {
          if (e.key === 'Enter') useTriage.getState().setShowDetail(true)
        }}
      >
        <LayoutGroup id="triage-inbox">
          {groupOrder.map((g) =>
            groups[g].length ? (
              <div key={g} role="group" aria-labelledby={`triage-group-${g}`}>
                <motion.div
                  layout="position"
                  transition={spring}
                  id={`triage-group-${g}`}
                  className="sticky top-0 z-10 flex h-8 items-center gap-2 border-b border-rule bg-panel px-4 text-[11px] font-semibold tracking-[0.04em] text-ink-2 uppercase"
                >
                  {groupTitle[g]}
                  <span className={cn('num font-mono text-[11px] font-medium', g === 'needs' ? 'text-cobalt' : 'text-ink-3')}>{groups[g].length}</span>
                </motion.div>
                {groups[g].map((item) => (
                  <Row key={item.id} item={item} selected={item.id === selected} question={question} />
                ))}
              </div>
            ) : null
          )}
        </LayoutGroup>
        {!groups.needs.length && !groups.review.length && !groups.approved.length && (
          <p className="px-4 py-8 text-[13px] text-ink-3">No items in this section.</p>
        )}
      </motion.div>
    </nav>
  )
}

function InboxHeader() {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const approveSection = useApp((s) => s.approveSection)
  const filter = useTriage((s) => s.filter)
  const setFilter = useTriage((s) => s.setFilter)
  const section = sections.find((s) => s.id === filter)
  const ready = section ? items.filter((i) => i.section.id === section.id && canApprove(statusOf(i.id, fields, rates))) : []
  const open = (id: string) => items.filter((i) => (id === 'all' || i.section.id === id) && statusOf(i.id, fields, rates) !== 'approved').length

  const chips = [{ id: 'all', title: 'All' }, ...sections.map((s) => ({ id: s.id, title: s.title }))]

  return (
    <div className="flex flex-col gap-2 border-b border-rule px-3 pt-3 pb-2.5">
      <div className="flex flex-wrap gap-1" role="group" aria-label="Show section">
        {chips.map((c) => {
          const n = open(c.id)
          const on = filter === c.id
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              title={n ? `${n} left to review` : 'All reviewed'}
              onClick={() => {
                setFilter(c.id)
                // Keep the selection inside what's shown.
                const order = visibleOrder(fields, rates, c.id)
                const t = useTriage.getState()
                if (order.length && !order.some((i) => i.id === t.selected)) t.select(order[0].id)
              }}
              className={cn(
                'inline-flex h-6 items-center gap-1.5 rounded-[4px] border px-2 text-[12px] transition-colors',
                on ? 'border-ink bg-ink text-panel' : 'border-rule text-ink-2 hover:border-ink-3/50 hover:text-ink'
              )}
            >
              {c.title}
              {n > 0 && <span className={cn('num font-mono text-[10px]', on ? 'text-panel/70' : 'text-ink-3')}>{n}</span>}
            </button>
          )
        })}
      </div>
      {section && ready.length > 0 && (
        <button
          type="button"
          onClick={() => {
            approveSection(section.id)
            toast.success(`Approved ${ready.length} in ${section.title}`)
          }}
          className="flex h-7 items-center gap-2 rounded-[4px] px-1.5 text-left text-[12px] text-ink-2 transition-colors hover:bg-panel-2 hover:text-ink"
        >
          <CheckCheck className="size-3.5 text-ok" />
          Approve {ready.length === 1 ? 'the checked item' : `all ${ready.length} checked items`} in {section.title}
        </button>
      )}
    </div>
  )
}

function Row({ item, selected, question }: { item: Item; selected: boolean; question: QuestionSet | null }) {
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  const stamp = useApp((s) => s.flash[item.id])
  const draft = useTriage((s) => (question && s.draft.qid === question.id ? s.draft.values[item.id] : undefined))
  const select = useTriage((s) => s.select)
  const wash = useJustChanged(stamp)
  const status = statusOf(item.id, fields, rates)
  const f = fields[item.id]
  const value = rowValue(item.id, fields, rates)
  const docs = docIdsOf(sourcesOf(item.id, fields, rates))
  const draftShown = draft ? (f?.candidates?.find((c) => String(c.value) === draft)?.display ?? draft) : null

  let valueNode: ReactNode
  if (draftShown) {
    valueNode = (
      <>
        <span className="truncate text-ink">{draftShown}</span>
        <span className="shrink-0 rounded-[3px] bg-cobalt-soft px-1 font-sans text-[10px] font-medium text-cobalt">Draft</span>
      </>
    )
  } else if (status === 'conflict') valueNode = <span className="truncate font-sans text-warn">Two values</span>
  else if (status === 'missing') valueNode = <span className="truncate font-sans text-bad">Missing</span>
  else if (status === 'drafting') valueNode = <span className="truncate font-sans text-cobalt">Writing…</span>
  else if (!value) valueNode = <span className="truncate font-sans text-ink-3">Not filled yet</span>
  else valueNode = <span className="truncate">{value}</span>

  const docText = docs.length ? `${docs[0]}${docs.length > 1 ? ` +${docs.length - 1}` : ''}` : f?.by === 'user' ? 'You' : ''

  return (
    <motion.div
      layoutId={`triage-row-${item.id}`}
      layout="position"
      transition={spring}
      id={`triage-opt-${item.id}`}
      data-item={item.id}
      role="option"
      aria-selected={selected}
      onClick={() => select(item.id, { detail: true })}
      className={cn(
        'group relative grid cursor-default grid-cols-[14px_minmax(0,1fr)_auto] items-start gap-x-2.5 px-4 py-2 transition-colors select-none',
        selected ? 'bg-cobalt-soft' : 'hover:bg-panel-2',
        wash && !selected && 'field-wash'
      )}
    >
      <span className="pt-[3px]">
        <StatusIcon status={status} />
      </span>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className={cn('truncate text-[13px] leading-5', selected ? 'font-medium text-ink' : 'text-ink')}>{item.label}</span>
        <span className="flex min-w-0 items-center gap-1.5 font-mono text-[12px] leading-4 text-ink-2">{valueNode}</span>
      </span>
      <span className={cn('num pt-[3px] font-mono text-[11px]', selected ? 'text-cobalt' : 'text-ink-3')}>{docText}</span>
      {selected && <span className="absolute inset-y-0 left-0 w-[2px] bg-cobalt" aria-hidden />}
    </motion.div>
  )
}
