import { create } from 'zustand'

// View state for the Chat prototype only (panel, tabs, composer chips).
// Fill state, documents and the agent stay in the shared store.

export type PanelTab = 'document' | 'fields'

interface ChatUI {
  panelOpen: boolean
  tab: PanelTab
  /** Field selected in the document (ring + inspector). */
  selected: string | null
  /** Ask the open panel to scroll a field into view; tick makes repeats fire. */
  reveal: { id: string; tick: number } | null
  /** Context chips (field ids) waiting in the composer. */
  chips: string[]
  railCollapsed: boolean
  railSheetOpen: boolean
  composerTick: number
  questionTick: number

  openPanel: (tab?: PanelTab, fieldId?: string | null, select?: boolean) => void
  closePanel: () => void
  setPanelOpen: (open: boolean) => void
  setTab: (tab: PanelTab) => void
  select: (fieldId: string | null) => void
  addChip: (fieldId: string) => void
  removeChip: (fieldId: string) => void
  clearChips: () => void
  toggleRail: () => void
  setRailSheetOpen: (open: boolean) => void
  focusComposer: () => void
  focusQuestion: () => void
}

const startsOpen = () => {
  try {
    return window.matchMedia('(min-width: 1280px)').matches
  } catch {
    return false
  }
}

let tick = 0

export const useChatUI = create<ChatUI>((set) => ({
  panelOpen: startsOpen(),
  tab: 'document',
  selected: null,
  reveal: null,
  chips: [],
  railCollapsed: false,
  railSheetOpen: false,
  composerTick: 0,
  questionTick: 0,

  openPanel: (tab, fieldId, select = false) =>
    set((s) => ({
      panelOpen: true,
      tab: tab ?? s.tab,
      reveal: fieldId ? { id: fieldId, tick: ++tick } : s.reveal,
      selected: select && fieldId ? fieldId : s.selected
    })),
  closePanel: () => set({ panelOpen: false }),
  setPanelOpen: (panelOpen) => set({ panelOpen }),
  setTab: (tab) => set({ tab }),
  select: (selected) => set({ selected }),
  addChip: (fieldId) => set((s) => (s.chips.includes(fieldId) ? s : { chips: [...s.chips, fieldId] })),
  removeChip: (fieldId) => set((s) => ({ chips: s.chips.filter((c) => c !== fieldId) })),
  clearChips: () => set({ chips: [] }),
  toggleRail: () => set((s) => ({ railCollapsed: !s.railCollapsed })),
  setRailSheetOpen: (railSheetOpen) => set({ railSheetOpen }),
  focusComposer: () => set((s) => ({ composerTick: s.composerTick + 1 })),
  focusQuestion: () => set((s) => ({ questionTick: s.questionTick + 1 }))
}))
