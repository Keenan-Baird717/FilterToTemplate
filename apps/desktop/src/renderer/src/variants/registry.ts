import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

// Each prototype is a full layout over the same fill state, agent and Word
// render. Select one with the bar at the top, Alt+1…6, or a URL hash (#canvas).

export interface VariantDef {
  id: string
  name: string
  thesis: string
  Component: LazyExoticComponent<ComponentType>
}

// VITE_ONLY_VARIANT=<id> builds just that prototype (plus Workbench); the
// constant comparisons fold away at build time so other folders aren't bundled.
const ONLY = import.meta.env.VITE_ONLY_VARIANT as string | undefined
const skipped = () => import('./skipped')

export const variants: VariantDef[] = [
  { id: 'workbench', name: 'Workbench', thesis: 'Sources, fields and the agent side by side', Component: lazy(() => import('./workbench')) },
  { id: 'canvas', name: 'Canvas', thesis: 'The letter is the interface: edit and verify values right on the page', Component: lazy(ONLY && ONLY !== 'canvas' ? skipped : () => import('./canvas')) },
  { id: 'steps', name: 'Steps', thesis: 'A guided flow that asks for one decision at a time', Component: lazy(ONLY && ONLY !== 'steps' ? skipped : () => import('./steps')) },
  { id: 'chat', name: 'Chat', thesis: 'Talk to the agent; the document opens beside the conversation', Component: lazy(ONLY && ONLY !== 'chat' ? skipped : () => import('./chat')) },
  { id: 'triage', name: 'Triage', thesis: 'Review every value against its evidence, from the keyboard', Component: lazy(ONLY && ONLY !== 'triage' ? skipped : () => import('./triage')) },
  { id: 'grid', name: 'Grid', thesis: 'Every field in one dense sheet, built for large templates', Component: lazy(ONLY && ONLY !== 'grid' ? skipped : () => import('./grid')) }
]

export const defaultVariant = variants[0]

export function variantFromHash(hash: string): VariantDef {
  const id = hash.replace(/^#/, '')
  return variants.find((v) => v.id === id) ?? defaultVariant
}
