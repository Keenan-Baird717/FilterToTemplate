import { ChevronDown, Monitor, Moon, RotateCcw, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { resetExample } from '@/lib/agent'
import { useApp, type Theme } from '@/lib/store'
import { cn } from '@/lib/utils'
import { earlierVariants, primaryVariants, type VariantDef } from '@/variants/registry'

export function isMacLike() {
  const platform = window.ftt?.platform
  return platform === 'darwin' || (!platform && /Mac|iPhone|iPad/.test(navigator.platform))
}

const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const themeIcon = { system: Monitor, light: Sun, dark: Moon }
const themeLabel = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' }

/**
 * Top strip for comparing prototypes. It also owns the window chrome: the
 * drag region and room for the macOS traffic lights or Windows controls.
 */
export function PrototypeBar() {
  const current = useApp((s) => s.variant)
  const setVariant = useApp((s) => s.setVariant)
  const theme = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)
  const ThemeIcon = themeIcon[theme]
  const mac = isMacLike()
  const earlierCurrent = earlierVariants.find((v) => v.id === current)

  return (
    <header
      className={cn(
        'drag flex h-10 shrink-0 items-center gap-2 border-b border-rule bg-ground pr-2 pl-3',
        window.ftt && mac && 'pl-[84px]',
        window.ftt && !mac && 'pr-[150px]'
      )}
    >
      <div className="flex shrink-0 items-center gap-2">
        <Logo />
        <span className="hidden text-[13px] font-semibold sm:inline">FilterToTemplate</span>
        <span className="hidden text-[11px] text-ink-3 lg:inline">prototypes</span>
      </div>

      <nav className="no-drag flex min-w-0 flex-1 justify-start overflow-x-auto [scrollbar-width:none] sm:justify-center" aria-label="Prototypes">
        <div className="flex items-center gap-0.5 rounded-lg bg-panel-2 p-0.5">
          {primaryVariants.map((v, i) => (
            <span key={v.id} className="contents">
              {i > 0 && primaryVariants[i - 1].tag && !v.tag && (
                <span className="mx-1 flex shrink-0 items-center gap-1.5 pl-1 text-[10px] font-medium tracking-wide text-ink-3 uppercase" aria-hidden>
                  <span className="h-4 w-px bg-rule" />
                  From V2
                </span>
              )}
              <VariantTab v={v} shortcut={i + 1} active={current === v.id} onSelect={() => setVariant(v.id)} />
            </span>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-rule" aria-hidden />
          {earlierCurrent && <VariantTab v={earlierCurrent} active onSelect={() => setVariant(earlierCurrent.id)} />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-7 shrink-0 items-center gap-1 rounded-md px-2.5 text-[12px] whitespace-nowrap text-ink-2 transition-colors hover:text-ink data-[state=open]:bg-panel data-[state=open]:text-ink"
              >
                Earlier <span className="num font-mono text-[10px] text-ink-3">{earlierVariants.length}</span>
                <ChevronDown className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[340px]">
              {([1, 2] as const).map((round) => (
                <DropdownMenuGroup key={round}>
                  <DropdownMenuLabel className="text-[10px] font-medium tracking-wide text-ink-3 uppercase">
                    {round === 1 ? 'Round 1 · first explorations' : 'Round 2 · Workbench refinements'}
                  </DropdownMenuLabel>
                  {earlierVariants
                    .filter((v) => v.round === round)
                    .map((v) => (
                      <DropdownMenuItem key={v.id} onSelect={() => setVariant(v.id)} className="flex-col items-start gap-0.5 py-1.5">
                        <span className={cn('text-[13px]', current === v.id && 'font-semibold')}>{v.name}</span>
                        <span className="text-[11px] leading-snug text-ink-3">{v.thesis}</span>
                      </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </nav>

      <div className="no-drag flex shrink-0 items-center gap-0.5">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Reset example"
              onClick={() => {
                resetExample()
                toast('Example reset', { description: 'Fields, questions and chat are back to the start.' })
              }}
            >
              <RotateCcw className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Reset example</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setTheme(nextTheme[theme])} aria-label={themeLabel[theme]}>
              <ThemeIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{themeLabel[theme]}</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}

function VariantTab({ v, shortcut, active, onSelect }: { v: VariantDef; shortcut?: number; active: boolean; onSelect: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onSelect}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[12px] whitespace-nowrap transition-colors',
            active ? 'bg-panel font-medium text-ink shadow-[0_0_0_1px_var(--rule)]' : 'text-ink-2 hover:text-ink'
          )}
        >
          {v.name}
          {v.tag && (
            <span className="rounded-[4px] bg-cobalt-soft px-1 font-mono text-[9px] leading-[15px] font-medium tracking-wide text-cobalt-ink uppercase">
              {v.tag}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {v.thesis}
        {shortcut && shortcut <= 9 ? ` · Alt+${shortcut}` : ''}
      </TooltipContent>
    </Tooltip>
  )
}

/** Mark: a page whose lines resolve into filled fields. */
function Logo() {
  return (
    <svg viewBox="0 0 20 20" className="size-5 shrink-0" aria-hidden>
      <rect x="3" y="1.5" width="14" height="17" rx="2.5" fill="var(--cobalt)" />
      <rect x="6" y="6" width="8" height="1.6" rx="0.8" fill="var(--on-cobalt)" opacity="0.55" />
      <rect x="6" y="9.2" width="5.5" height="1.6" rx="0.8" fill="var(--on-cobalt)" opacity="0.55" />
      <rect x="6" y="12.4" width="8" height="2.2" rx="1.1" fill="var(--marker)" />
    </svg>
  )
}
