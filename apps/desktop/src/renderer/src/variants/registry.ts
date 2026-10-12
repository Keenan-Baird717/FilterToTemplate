import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

// Each prototype is a full layout over the same fill state, agent and Word
// render. Select one with the bar at the top, Alt+1…6, or a URL hash (#canvas).

export interface VariantDef {
  id: string
  name: string
  thesis: string
  /** 1: first exploration. 2: Workbench refinements (questions out of the chat, livelier sources). 3: spin-offs of Tray (V2). */
  round: 1 | 2 | 3
  /** Chosen direction: Workbench is the base design, Tray is V2. */
  tag?: 'Base' | 'V2'
  Component: LazyExoticComponent<ComponentType>
}

// VITE_ONLY_VARIANT=<id> builds just that prototype (plus Workbench); the
// constant comparisons fold away at build time so other folders aren't bundled.
const ONLY = import.meta.env.VITE_ONLY_VARIANT as string | undefined
const skipped = () => import('./skipped')

export const variants: VariantDef[] = [
  { id: 'workbench', round: 1, tag: 'Base', name: 'Workbench', thesis: 'Sources, fields and the agent side by side', Component: lazy(() => import('./workbench')) },
  { id: 'canvas', round: 1, name: 'Canvas', thesis: 'The letter is the interface: edit and verify values right on the page', Component: lazy(ONLY && ONLY !== 'canvas' ? skipped : () => import('./canvas')) },
  { id: 'steps', round: 1, name: 'Steps', thesis: 'A guided flow that asks for one decision at a time', Component: lazy(ONLY && ONLY !== 'steps' ? skipped : () => import('./steps')) },
  { id: 'chat', round: 1, name: 'Chat', thesis: 'Talk to the agent; the document opens beside the conversation', Component: lazy(ONLY && ONLY !== 'chat' ? skipped : () => import('./chat')) },
  { id: 'triage', round: 1, name: 'Triage', thesis: 'Review every value against its evidence, from the keyboard', Component: lazy(ONLY && ONLY !== 'triage' ? skipped : () => import('./triage')) },
  { id: 'grid', round: 1, name: 'Grid', thesis: 'Every field in one dense sheet, built for large templates', Component: lazy(ONLY && ONLY !== 'grid' ? skipped : () => import('./grid')) },
  { id: 'tray', round: 2, tag: 'V2', name: 'Tray', thesis: 'Questions pinned above the fields; sources fold to a rail that wakes when the agent reads', Component: lazy(ONLY && ONLY !== 'tray' ? skipped : () => import('./tray')) },
  { id: 'inplace', round: 2, name: 'In place', thesis: 'Answer questions inside the field rows; the left pane shows evidence for what you are looking at', Component: lazy(ONLY && ONLY !== 'inplace' ? skipped : () => import('./inplace')) },
  { id: 'sidekick', round: 2, name: 'Sidekick', thesis: 'One side panel with Needs you, Agent and Sources tabs; the fields get the room', Component: lazy(ONLY && ONLY !== 'sidekick' ? skipped : () => import('./sidekick')) },
  { id: 'dock', round: 2, name: 'Dock', thesis: 'Sources become a dock along the bottom; questions arrive as one focused card', Component: lazy(ONLY && ONLY !== 'dock' ? skipped : () => import('./dock')) },
  { id: 'phases', round: 2, name: 'Phases', thesis: 'The left column changes with the job: reading, then questions, then review', Component: lazy(ONLY && ONLY !== 'phases' ? skipped : () => import('./phases')) },
  { id: 'tray-evidence', round: 3, name: 'Evidence', thesis: 'V2 with a left column that opens into evidence for the field you select, then folds back into the live rail', Component: lazy(ONLY && ONLY !== 'tray-evidence' ? skipped : () => import('./tray-evidence')) },
  { id: 'tray-split', round: 3, name: 'Split', thesis: 'V2 with the live Word letter beside the fields and the agent tucked into a drawer', Component: lazy(ONLY && ONLY !== 'tray-split' ? skipped : () => import('./tray-split')) },
  { id: 'tray-review', round: 3, name: 'Review', thesis: "V2's tray carries you through the whole job: questions, then review, then export", Component: lazy(ONLY && ONLY !== 'tray-review' ? skipped : () => import('./tray-review')) },
  { id: 'tray-focus', round: 3, name: 'Focus', thesis: 'V2, calmer: finished sections fold away and the agent becomes a floating composer', Component: lazy(ONLY && ONLY !== 'tray-focus' ? skipped : () => import('./tray-focus')) },
  { id: 'tray-trail', round: 3, name: 'Trail', thesis: 'V2 with a visible trail of what the agent did and a history on every value', Component: lazy(ONLY && ONLY !== 'tray-trail' ? skipped : () => import('./tray-trail')) }
]

export const defaultVariant = variants[0]

export function variantFromHash(hash: string): VariantDef {
  const id = hash.replace(/^#/, '')
  return variants.find((v) => v.id === id) ?? defaultVariant
}
