import { ChevronDown } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { fieldDefs } from '../../../../agent-core/demo-data'
import type { SourceRef } from '../../../../shared/protocol'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { useAgent, questionsIn } from '@/lib/agent'
import { chat } from '@/lib/chat'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { useTray } from './state'
import { ago, clockTime, entriesOf, labelOf, markTrailSeen, sectionOf, turnLabel, useNow, useTrail, type TrailEntry, type TrailEvent } from './trail'

const ease = [0.22, 1, 0.36, 1] as const

/** Trail entries not yet seen (for the rail's badge). */
export function useUnseenCount() {
  const events = useTrail((s) => s.events)
  const seenAt = useTrail((s) => s.seenAt)
  return useMemo(() => entriesOf(events.filter((e) => e.at > seenAt).sort((a, b) => b.at - a.at)).length, [events, seenAt])
}

/**
 * What the agent and you did, newest first, grouped by turn. Field entries
 * reveal their row; document entries open the source drawer.
 */
export function ActivityTrail({ visible, onNavigate, className }: { visible: boolean; onNavigate?: () => void; className?: string }) {
  const turns = useTrail((s) => s.turns)
  const events = useTrail((s) => s.events)
  const seenAt = useTrail((s) => s.seenAt)
  const now = useNow(20_000)
  const { busy } = useAgent()
  const [toggled, setToggled] = useState<Record<string, boolean>>({})
  // The seen line as it was when the trail opened, so new entries stay marked while you look.
  const [shownSeen, setShownSeen] = useState(seenAt)

  const groups = useMemo(
    () =>
      [...turns]
        .reverse()
        .map((turn) => {
          const list = events.filter((e) => e.turn === turn.id).sort((a, b) => b.at - a.at)
          return { turn, entries: entriesOf(list), latest: list[0]?.at ?? turn.at, live: list.some((e) => e.live) }
        })
        .filter((g) => g.entries.length),
    [turns, events]
  )

  const latestAt = events.reduce((m, e) => Math.max(m, e.at), 0)
  useEffect(() => {
    if (!visible) {
      setShownSeen(useTrail.getState().seenAt)
      return
    }
    const t = setTimeout(() => markTrailSeen(Date.now()), 900)
    return () => clearTimeout(t)
  }, [visible, latestAt])
  // Once marked seen, let the highlight fade a little later.
  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => setShownSeen(seenAt), 900)
    return () => clearTimeout(t)
  }, [visible, seenAt])

  const setHoverDoc = useTray((s) => s.setHoverDoc)

  return (
    <div
      className={cn('flex flex-col', className)}
      onClickCapture={() => markTrailSeen(Date.now())}
      onMouseOver={(e) => setHoverDoc((e.target as HTMLElement).closest<HTMLElement>('[data-doc-id]')?.dataset.docId ?? null)}
      onMouseLeave={() => setHoverDoc(null)}
    >
      {groups.length === 0 ? (
        <p className="px-4 py-3 text-[12px] text-ink-3">Nothing yet. What the agent reads and changes shows up here.</p>
      ) : (
        <ol className="flex flex-col pb-3" aria-label="Activity, newest first">
          {groups.map((g, gi) => {
            const activeTurn = gi === 0 && busy && g.turn.kind !== 'you'
            const open = toggled[g.turn.id] ?? gi < 2
            const steps = g.entries.length
            return (
              <li key={g.turn.id} className="flex flex-col">
                <h3 className="sticky top-0 z-[1] bg-ground px-2">
                  <button
                    type="button"
                    onClick={() => setToggled((t) => ({ ...t, [g.turn.id]: !open }))}
                    aria-expanded={open}
                    className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] text-ink-3 transition-colors hover:text-ink-2"
                  >
                    <span className="font-semibold tracking-[0.06em] text-ink-2 uppercase">{turnLabel[g.turn.kind]}</span>
                    <span aria-hidden>·</span>
                    {activeTurn ? (
                      <span className="flex items-center gap-1.5 font-medium text-cobalt-ink">
                        <LiveDot /> now
                      </span>
                    ) : (
                      <time dateTime={new Date(g.latest).toISOString()} title={clockTime(g.latest)}>
                        {ago(g.latest, now)}
                      </time>
                    )}
                    {!open && <span className="num">· {steps} step{steps === 1 ? '' : 's'}</span>}
                    <ChevronDown className={cn('ml-auto size-3.5 shrink-0 transition-transform', !open && '-rotate-90')} aria-hidden />
                  </button>
                </h3>
                <AnimatePresence initial={false}>
                  {open && (
                    <motion.ol
                      key="list"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.22, ease }}
                      className="relative mx-2 mb-2 overflow-clip pl-[14px] before:absolute before:top-2 before:bottom-3 before:left-[13px] before:w-px before:bg-rule"
                    >
                      <AnimatePresence initial={false}>
                        {g.entries.map((entry) => (
                          <motion.li
                            key={entry.key}
                            layout="position"
                            initial={{ opacity: 0, y: -6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.25, ease }}
                            className="relative"
                          >
                            <Entry entry={entry} unseen={entry.head.at > shownSeen} onNavigate={onNavigate} />
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </motion.ol>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}

function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative flex size-1.5 shrink-0', className)} aria-hidden>
      <span className="absolute inset-0 animate-ping rounded-full bg-cobalt opacity-70" />
      <span className="relative size-1.5 rounded-full bg-cobalt" />
    </span>
  )
}

// ---------------------------------------------------------------------------
// One entry
// ---------------------------------------------------------------------------

const short = (v: string | null | undefined, n = 26) => (!v ? '' : v.length > n ? `${v.slice(0, n - 1).trimEnd()}…` : v)

function F({ id }: { id: string }) {
  return <span className="font-medium text-ink">{labelOf(id)}</span>
}
function V({ v }: { v: string | null | undefined }) {
  return <span className="num text-ink">{short(v)}</span>
}

function describe(entry: TrailEntry): { text: ReactNode; live?: string; target?: 'field' | 'doc' | 'ask' } {
  const e = entry.head
  const n = entry.events.length
  const f = e.fieldId
  switch (e.kind) {
    case 'read':
      return { text: e.title, live: e.live ? e.title : undefined, target: e.docs?.length ? 'doc' : undefined }
    case 'set':
      if (e.verb === 'wrote') return { text: <>Wrote <F id={f!} /></>, target: 'field' }
      if (fieldDefs[f!]?.kind === 'narrative' || !e.value) return { text: <>Set <F id={f!} /></>, target: 'field' }
      return {
        text: (
          <>
            Set <F id={f!} /> to <V v={e.value} />
          </>
        ),
        target: 'field'
      }
    case 'draft':
      return { text: <>Writing <F id={f!} /></>, live: e.live ? `Writing ${labelOf(f!)}` : undefined, target: 'field' }
    case 'flag':
      return {
        text: (
          <>
            Flagged <F id={f!} />: 2 values
          </>
        ),
        target: 'field'
      }
    case 'missing':
      return {
        text: (
          <>
            Marked <F id={f!} /> missing
          </>
        ),
        target: 'field'
      }
    case 'clear':
      return n > 1 ? { text: `Cleared ${n} values to start over` } : { text: <>Cleared <F id={f!} /></>, target: 'field' }
    case 'answer':
      return e.verb === 'chose'
        ? {
            text: (
              <>
                You chose <V v={e.value} /> for <F id={f!} />
              </>
            ),
            target: 'field'
          }
        : {
            text: (
              <>
                You answered <F id={f!} />
                {e.value ? (
                  <>
                    : <V v={e.value} />
                  </>
                ) : null}
              </>
            ),
            target: 'field'
          }
    case 'edit':
      if (e.value == null) return { text: <>You cleared <F id={f!} /></>, target: 'field' }
      return {
        text: (
          <>
            You {e.prevField || e.prev ? 'edited' : 'set'} <F id={f!} /> to <V v={e.value} />
          </>
        ),
        target: 'field'
      }
    case 'restore':
      return { text: <>You undid your edit to <F id={f!} /></>, target: 'field' }
    case 'approve': {
      if (n === 1) return { text: <>You approved <F id={f!} /></>, target: 'field' }
      const secs = new Set(entry.events.map((x) => sectionOf(x.fieldId!)?.title))
      return {
        text:
          secs.size === 1 ? (
            <>
              You approved <span className="font-medium text-ink">{[...secs][0]}</span>
            </>
          ) : (
            `You approved ${n} values`
          ),
        target: 'field'
      }
    }
    case 'unapprove':
      return { text: <>You undid approval of <F id={f!} /></>, target: 'field' }
    case 'ask': {
      const ids = e.fieldIds ?? []
      return {
        text: (
          <>
            Asked you about{' '}
            {ids.map((id, i) => (
              <Fragment key={id}>
                {i > 0 && (i === ids.length - 1 ? ' and ' : ', ')}
                <F id={id} />
              </Fragment>
            ))}
          </>
        ),
        target: 'ask'
      }
    }
    case 'asked':
      return { text: <>You asked “{short(e.title, 60)}”</> }
    case 'skip': {
      const k = e.fieldIds?.length ?? 0
      return { text: `You skipped ${k || 'the'} question${k === 1 ? '' : 's'} for now` }
    }
  }
}

function go(entry: TrailEntry, target: 'field' | 'doc' | 'ask', onNavigate?: () => void) {
  const e = entry.head
  const app = useApp.getState()
  if (target === 'doc' && e.docs?.length) {
    const doc = app.docs.find((d) => d.id === e.docs![0])
    app.openSource({ docId: e.docs[0], page: e.page ?? doc?.content[0]?.n, locator: e.locator })
    return
  }
  if (target === 'ask') {
    const ids = e.fieldIds ?? []
    const pending = ids.filter((id) => ['conflict', 'missing'].includes(app.fields[id]?.status ?? ''))
    const newest = questionsIn(chat.messages).at(-1)
    if (pending.length && newest?.id === e.questionId) {
      if (app.answered[e.questionId!] === 'skipped') app.reopenQuestion(e.questionId!)
      app.setPane('template')
      app.setView('fields')
      useTray.getState().openTray(pending[0])
      onNavigate?.()
      return
    }
    if (ids[0]) app.revealField(ids[0])
    onNavigate?.()
    return
  }
  const id = e.fieldId
  if (!id) return
  app.revealField(id)
  onNavigate?.()
}

function Entry({ entry, unseen, onNavigate }: { entry: TrailEntry; unseen: boolean; onNavigate?: () => void }) {
  const e = entry.head
  const { text, live, target } = describe(entry)
  const tone =
    e.live
      ? 'live'
      : e.actor === 'you'
        ? 'you'
        : e.kind === 'flag'
          ? 'warn'
          : e.kind === 'missing'
            ? 'bad'
            : 'agent'
  const chips = chipsFor(e)
  const body = live ? (
    <Shimmer as="span" className="text-[12px] font-medium" duration={1.5}>
      {`${live}…`}
    </Shimmer>
  ) : (
    text
  )

  return (
    <div
      className={cn(
        'relative rounded-md py-1 pr-1.5 pl-3 text-[12px] leading-[17px] text-ink-2 transition-colors duration-1000',
        unseen ? 'bg-cobalt-soft/55' : 'bg-transparent'
      )}
    >
      <TrailDot tone={tone} />
      {target ? (
        <button
          type="button"
          onClick={() => go(entry, target, onNavigate)}
          title={clockTime(e.at)}
          className={cn(
            'inline max-w-full rounded-sm text-left align-top underline-offset-2 hover:text-ink',
            target === 'doc' ? 'decoration-ink-3/60 hover:underline' : 'hover:[&_.font-medium]:underline'
          )}
        >
          {body}
        </button>
      ) : (
        <span title={clockTime(e.at)}>{body}</span>
      )}
      {chips.length > 0 && ' '}
      {chips.length > 0 && (
        <span className="inline-flex max-w-full flex-wrap gap-1 align-[-3px]">
          {chips.map((c) => (
            <MiniChip key={c.key} chip={c} />
          ))}
        </span>
      )}
    </div>
  )
}

function TrailDot({ tone }: { tone: 'live' | 'you' | 'agent' | 'warn' | 'bad' }) {
  return (
    <span className="absolute top-[6px] left-[-5px] flex size-[9px] items-center justify-center" aria-hidden>
      {tone === 'live' && <span className="absolute inset-0 animate-ping rounded-full bg-cobalt opacity-60" />}
      <span
        className={cn(
          'relative size-[7px] rounded-full ring-2 ring-ground',
          tone === 'live' && 'bg-cobalt',
          tone === 'you' && 'bg-cobalt',
          tone === 'agent' && 'bg-ground shadow-[inset_0_0_0_1.5px_var(--ink-3)]',
          tone === 'warn' && 'bg-ground shadow-[inset_0_0_0_1.5px_var(--warn)]',
          tone === 'bad' && 'bg-ground shadow-[inset_0_0_0_1.5px_var(--bad)]'
        )}
      />
    </span>
  )
}

interface Chip {
  key: string
  docId: string
  page?: number
  locator?: string
  quote?: string
}

function chipsFor(e: TrailEvent): Chip[] {
  if (e.kind === 'read') {
    const docs = useApp.getState().docs
    const ids = e.docs ?? []
    // A read that already names its one document doesn't need a chip.
    if (ids.length === 1 && e.title && docs.some((d) => d.id === ids[0] && e.title!.includes(d.name))) return []
    return ids.map((id) => ({ key: id, docId: id }))
  }
  if (e.kind === 'clear' || e.kind === 'approve' || e.kind === 'unapprove' || e.kind === 'restore' || !e.sources?.length) return []
  const seen = new Set<string>()
  const out: Chip[] = []
  for (const s of e.sources as SourceRef[]) {
    const k = `${s.docId}:${s.page ?? s.locator ?? ''}`
    if (seen.has(k)) continue
    seen.add(k)
    out.push({ key: k, docId: s.docId, page: s.page, locator: s.locator, quote: s.quote })
  }
  return out.slice(0, 4)
}

function MiniChip({ chip: { docId, page, locator, quote } }: { chip: Chip }) {
  const doc = useApp((s) => s.docs.find((d) => d.id === docId))
  const loc = page ? `p.${page}` : locator && !/^Message/.test(locator) ? locator : ''
  return (
    <button
      type="button"
      data-doc-id={docId}
      onClick={() => useApp.getState().openSource({ docId, page: page ?? doc?.content[0]?.n, quote, locator })}
      title={`${doc?.name ?? docId}${quote ? ` · “${quote}”` : ''}`}
      aria-label={`Open ${doc?.name ?? docId}${loc ? ` at ${loc}` : ''}`}
      className="inline-flex h-[18px] max-w-full min-w-0 items-center gap-1 rounded-[5px] border border-rule bg-panel px-1 font-mono text-[10px] leading-none text-ink-3 transition-colors hover:border-cobalt/40 hover:bg-cobalt-soft hover:text-ink-2"
    >
      <span className="font-medium text-cobalt-ink">{docId}</span>
      {loc && <span className="truncate">{loc}</span>}
    </button>
  )
}
