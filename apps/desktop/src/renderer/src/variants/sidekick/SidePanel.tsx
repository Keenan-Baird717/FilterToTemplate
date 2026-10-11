import { FolderOpen, Inbox, MessagesSquare, PanelRightClose, PanelRightOpen, type LucideIcon } from 'lucide-react'
import { motion } from 'motion/react'
import { Tabs as TabsPrimitive } from 'radix-ui'
import type { ReactNode } from 'react'
import { ChatPane } from '@/components/ChatPane'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAgent, useEngineName, useOpenQuestion, type useLiveSources } from '@/lib/agent'
import { useApp } from '@/lib/store'
import { cn } from '@/lib/utils'
import { CountBadge, PulseDot, isReady, reviewItems } from './bits'
import { LiveSources } from './LiveSources'
import { NeedsYou } from './NeedsYou'
import { useSidekick, type PanelTab } from './state'

type Live = ReturnType<typeof useLiveSources>

/** Badge for the Needs-you tab: open questions (warn), else values ready to approve (neutral). */
export function useNeedsBadge(): { n: number; tone: 'warn' | 'neutral' } | null {
  const open = useOpenQuestion()
  const fields = useApp((s) => s.fields)
  const rates = useApp((s) => s.rates)
  if (open) return { n: open.items.length, tone: 'warn' }
  const ready = reviewItems(fields, rates)
    .flatMap((g) => g.items)
    .filter((i) => isReady(i.status)).length
  return ready ? { n: ready, tone: 'neutral' } : null
}

export const tabMeta: Record<PanelTab, { label: string; icon: LucideIcon }> = {
  needs: { label: 'Needs you', icon: Inbox },
  agent: { label: 'Agent', icon: MessagesSquare },
  sources: { label: 'Sources', icon: FolderOpen }
}

/** Badges for one tab, shared by the tab bar, the collapsed strip and the phone bar. */
export function TabBadges({ tab, live, compact }: { tab: PanelTab; live: Live; compact?: boolean }) {
  const current = useSidekick((s) => s.tab)
  const collapsed = useSidekick((s) => s.collapsed)
  const attention = useSidekick((s) => s.attention)
  const docs = useApp((s) => s.docs.length)
  const needs = useNeedsBadge()
  const { busy } = useAgent()
  const hidden = current !== tab || collapsed

  if (tab === 'needs') {
    if (!needs) return null
    return (
      <span className="relative inline-flex">
        {attention === 'needs' && <span className="absolute inset-0 animate-ping rounded-full bg-warn/50" aria-hidden />}
        <CountBadge n={needs.n} tone={needs.tone} />
        <span className="sr-only">{needs.tone === 'warn' ? ' questions' : ' ready to approve'}</span>
      </span>
    )
  }
  if (tab === 'agent') {
    return busy && hidden ? (
      <>
        <PulseDot ping={false} />
        <span className="sr-only"> working</span>
      </>
    ) : null
  }
  const reading = live.reading.size > 0
  return (
    <span className="inline-flex items-center gap-1.5">
      {reading && hidden && (
        <>
          <PulseDot />
          <span className="sr-only"> reading</span>
        </>
      )}
      {!compact && <CountBadge n={docs} tone="neutral" />}
    </span>
  )
}

/**
 * One side panel with three tabs. Collapses to a slim strip that keeps the
 * badges; on phones it fills the screen and the bottom bar picks the tab.
 */
export function SidePanel({ live, className }: { live: Live; className?: string }) {
  const tab = useSidekick((s) => s.tab)
  const collapsed = useSidekick((s) => s.collapsed)
  const choose = useSidekick((s) => s.choose)
  const setCollapsed = useSidekick((s) => s.setCollapsed)

  return (
    <aside
      className={cn(
        'min-h-0 w-full flex-col bg-panel lg:shrink-0 lg:border-l lg:border-rule',
        collapsed ? 'lg:w-[52px]' : 'lg:w-[360px] xl:w-[400px]',
        className
      )}
      aria-label="Side panel"
    >
      {collapsed && <Strip live={live} />}
      <TabsPrimitive.Root
        value={tab}
        onValueChange={(v) => choose(v as PanelTab)}
        className={cn('flex min-h-0 flex-1 flex-col', collapsed && 'lg:hidden')}
      >
        <div className="hidden h-[57px] shrink-0 items-stretch gap-1 border-b border-rule pr-2 pl-1 lg:flex">
          <TabsPrimitive.List className="flex flex-1 items-stretch" aria-label="Side panel">
            {(Object.keys(tabMeta) as PanelTab[]).map((t) => (
              <TabsPrimitive.Trigger
                key={t}
                value={t}
                className="group/tab relative flex items-center gap-2 rounded-md px-3 text-[13px] font-medium text-ink-3 transition-colors outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-cobalt/40 focus-visible:ring-inset data-[state=active]:text-ink"
              >
                {tabMeta[t].label}
                <TabBadges tab={t} live={live} />
                {tab === t && (
                  <motion.span
                    layoutId="sk-tab-underline"
                    className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-cobalt"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  />
                )}
              </TabsPrimitive.Trigger>
            ))}
          </TabsPrimitive.List>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 self-center text-ink-3" onClick={() => setCollapsed(true)} aria-label="Collapse panel">
                <PanelRightClose className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              Collapse panel <Kbd className="ml-1">]</Kbd>
            </TooltipContent>
          </Tooltip>
        </div>

        <Panel value="needs">
          <NeedsYou />
        </Panel>
        <Panel value="agent">
          <AgentTab />
        </Panel>
        <Panel value="sources">
          <LiveSources live={live} />
        </Panel>
      </TabsPrimitive.Root>
    </aside>
  )
}

function Panel({ value, children }: { value: PanelTab; children: ReactNode }) {
  return (
    <TabsPrimitive.Content
      value={value}
      forceMount
      className="min-h-0 flex-1 outline-none data-[state=active]:animate-in data-[state=active]:fade-in-0 data-[state=active]:duration-200 data-[state=inactive]:hidden"
    >
      {children}
    </TabsPrimitive.Content>
  )
}

function AgentTab() {
  const engine = useEngineName()
  const { busy, activity } = useAgent()
  const choose = useSidekick((s) => s.choose)
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-rule px-4 py-2 text-[11px] text-ink-3">
        <span className={cn('size-1.5 shrink-0 rounded-full', busy ? 'animate-pulse bg-cobalt' : 'bg-ok')} aria-hidden />
        <span className="min-w-0 truncate">{busy && activity ? activity : engine}</span>
        <span className="ml-auto shrink-0 font-mono text-[10.5px]" title="Model picked from listModels() at runtime">
          Copilot · auto
        </span>
      </div>
      <ChatPane questions="pointer" onQuestionPointer={() => choose('needs')} className="min-h-0 flex-1 [&>header]:hidden" />
    </div>
  )
}

function Strip({ live }: { live: Live }) {
  const tab = useSidekick((s) => s.tab)
  const choose = useSidekick((s) => s.choose)
  const expand = useSidekick((s) => s.expand)
  return (
    <nav className="hidden w-[52px] flex-1 flex-col items-center gap-1 py-2.5 lg:flex" aria-label="Side panel (collapsed)">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="size-9 text-ink-3" onClick={expand} aria-label="Expand panel">
            <PanelRightOpen className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          Expand panel <Kbd className="ml-1">]</Kbd>
        </TooltipContent>
      </Tooltip>
      <div className="my-1.5 h-px w-6 bg-rule" />
      {(Object.keys(tabMeta) as PanelTab[]).map((t) => {
        const Icon = tabMeta[t].icon
        return (
          <Tooltip key={t}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => choose(t)}
                aria-label={tabMeta[t].label}
                className={cn(
                  'relative flex size-10 items-center justify-center rounded-lg text-ink-3 transition-colors hover:bg-panel-2 hover:text-ink',
                  tab === t && 'bg-panel-2 text-ink'
                )}
              >
                <Icon className="size-[18px]" />
                <span className={cn('absolute flex', t === 'needs' ? '-top-0.5 -right-0.5' : 'top-2 right-2')}>
                  <TabBadges tab={t} live={live} compact />
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">{tabMeta[t].label}</TooltipContent>
          </Tooltip>
        )
      })}
    </nav>
  )
}
