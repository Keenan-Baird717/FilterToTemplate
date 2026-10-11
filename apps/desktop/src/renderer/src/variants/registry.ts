import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

// Each prototype is a full layout over the same fill state, agent and Word
// render. Select one with the bar at the top, Alt+1…6, or a URL hash (#canvas).

export interface VariantDef {
  id: string
  name: string
  thesis: string
  /** 1: first exploration. 2: Workbench refinements (questions out of the chat, livelier sources). */
  round: 1 | 2
  Component: LazyExoticComponent<ComponentType>
}

// VITE_ONLY_VARIANT=<id> builds just that prototype (plus Workbench); the
// constant comparisons fold away at build time so other folders aren't bundled.
const ONLY = import.meta.env.VITE_ONLY_VARIANT as string | undefined
const skipped = () => import('./skipped')

export const variants: VariantDef[] = [
  { id: 'workbench', round: 1, name: 'Workbench', thesis: 'Sources, fields and the agent side by side', Component: lazy(() => import('./workbench')) },
  { id: 'canvas', round: 1, name: 'Canvas', thesis: 'The letter is the interface: edit and verify values right on the page', Component: lazy(ONLY && ONLY !== 'canvas' ? skipped : () => import('./canvas')) },
  { id: 'steps', round: 1, name: 'Steps', thesis: 'A guided flow that asks for one decision at a time', Component: lazy(ONLY && ONLY !== 'steps' ? skipped : () => import('./steps')) },
  { id: 'chat', round: 1, name: 'Chat', thesis: 'Talk to the agent; the document opens beside the conversation', Component: lazy(ONLY && ONLY !== 'chat' ? skipped : () => import('./chat')) },
  { id: 'triage', round: 1, name: 'Triage', thesis: 'Review every value against its evidence, from the keyboard', Component: lazy(ONLY && ONLY !== 'triage' ? skipped : () => import('./triage')) },
  { id: 'grid', round: 1, name: 'Grid', thesis: 'Every field in one dense sheet, built for large templates', Component: lazy(ONLY && ONLY !== 'grid' ? skipped : () => import('./grid')) },
  { id: 'tray', round: 2, name: 'Tray', thesis: 'Questions pinned above the fields; sources fold to a rail that wakes when the agent reads', Component: lazy(ONLY && ONLY !== 'tray' ? skipped : () => import('./tray')) },
  { id: 'inplace', round: 2, name: 'In place', thesis: 'Answer questions inside the field rows; the left pane shows evidence for what you are looking at', Component: lazy(ONLY && ONLY !== 'inplace' ? skipped : () => import('./inplace')) },
  { id: 'sidekick', round: 2, name: 'Sidekick', thesis: 'One side panel with Needs you, Agent and Sources tabs; the fields get the room', Component: lazy(ONLY && ONLY !== 'sidekick' ? skipped : () => import('./sidekick')) },
  { id: 'dock', round: 2, name: 'Dock', thesis: 'Sources become a dock along the bottom; questions arrive as one focused card', Component: lazy(ONLY && ONLY !== 'dock' ? skipped : () => import('./dock')) },
  { id: 'phases', round: 2, name: 'Phases', thesis: 'The left column changes with the job: reading, then questions, then review', Component: lazy(ONLY && ONLY !== 'phases' ? skipped : () => import('./phases')) }
]

export const defaultVariant = variants[0]

export function variantFromHash(hash: string): VariantDef {
  const id = hash.replace(/^#/, '')
  return variants.find((v) => v.id === id) ?? defaultVariant
}
