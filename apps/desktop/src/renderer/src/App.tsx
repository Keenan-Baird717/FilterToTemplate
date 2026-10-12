import { Suspense, useEffect } from 'react'
import { CommandMenu } from '@/components/CommandMenu'
import { PrototypeBar } from '@/components/PrototypeBar'
import { SourceSheet } from '@/components/SourceSheet'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useApp } from '@/lib/store'
import { primaryVariants, variantFromHash, variants } from '@/variants/registry'

export default function App() {
  const variantId = useApp((s) => s.variant)
  const setVariant = useApp((s) => s.setVariant)
  const theme = useApp((s) => s.theme)
  const variant = variants.find((v) => v.id === variantId) ?? variants[0]
  const View = variant.Component

  useEffect(() => {
    document.documentElement.dataset.variant = variant.id
  }, [variant.id])

  useEffect(() => {
    const onHash = () => setVariant(variantFromHash(location.hash).id)
    const onKey = (e: KeyboardEvent) => {
      const n = Number(e.key)
      if (e.altKey && !e.metaKey && !e.ctrlKey && n >= 1 && n <= Math.min(9, primaryVariants.length)) {
        e.preventDefault()
        setVariant(primaryVariants[n - 1].id)
      }
    }
    window.addEventListener('hashchange', onHash)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('hashchange', onHash)
      window.removeEventListener('keydown', onKey)
    }
  }, [setVariant])

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex h-full flex-col bg-ground text-ink">
        <PrototypeBar />
        <div className="min-h-0 flex-1">
          <Suspense fallback={<div className="h-full bg-ground" />}>
            <View />
          </Suspense>
        </div>
      </div>
      <SourceSheet />
      <CommandMenu />
      <Toaster theme={theme} position="bottom-right" />
    </TooltipProvider>
  )
}
