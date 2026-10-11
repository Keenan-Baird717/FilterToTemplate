import { Monitor, Moon, Search, Sun } from 'lucide-react'
import { project } from '../../../agent-core/demo-data'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useApp, type Theme } from '@/lib/store'
import { cn } from '@/lib/utils'

const nextTheme: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
const themeIcon = { system: Monitor, light: Sun, dark: Moon }
const themeLabel = { system: 'Theme: match system', light: 'Theme: light', dark: 'Theme: dark' }

export function TitleBar() {
  const theme = useApp((s) => s.theme)
  const setTheme = useApp((s) => s.setTheme)
  const setCommandOpen = useApp((s) => s.setCommandOpen)
  const platform = window.ftt?.platform
  const isMac = platform === 'darwin' || (!platform && /Mac/.test(navigator.platform))
  const ThemeIcon = themeIcon[theme]

  return (
    <header
      className={cn(
        'drag flex h-11 shrink-0 items-center gap-3 border-b border-rule bg-ground px-3',
        window.ftt && isMac && 'pl-[84px]',
        window.ftt && !isMac && 'pr-[150px]'
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Logo />
        <nav className="flex min-w-0 items-center gap-1.5 text-[13px]" aria-label="Breadcrumb">
          <span className="hidden font-semibold sm:inline">FilterToTemplate</span>
          <span className="hidden text-ink-3 sm:inline">/</span>
          <span className="truncate text-ink-2">{project.client}</span>
          <span className="text-ink-3">/</span>
          <span className="truncate text-ink">{project.title}</span>
        </nav>
      </div>

      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={() => setCommandOpen(true)}
          className="no-drag hidden h-7 w-full max-w-[340px] items-center gap-2 rounded-md border border-rule bg-panel px-2.5 text-[12px] text-ink-3 transition-colors hover:text-ink-2 md:flex"
        >
          <Search className="size-3.5" />
          <span className="flex-1 text-left">Jump to a field or document</span>
          <Kbd>{isMac ? '⌘' : 'Ctrl'} K</Kbd>
        </button>
      </div>

      <div className="no-drag flex items-center gap-1">
        <Button variant="ghost" size="icon" className="size-8 md:hidden" onClick={() => setCommandOpen(true)} aria-label="Search">
          <Search className="size-4" />
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => setTheme(nextTheme[theme])} aria-label={themeLabel[theme]}>
              <ThemeIcon className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{themeLabel[theme]}</TooltipContent>
        </Tooltip>
      </div>
    </header>
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
