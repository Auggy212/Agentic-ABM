import { create } from "zustand";

/**
 * Controls the Copilot panel from outside the Copilot component.
 * Any page can call `openCopilot(message)` to pop the panel open
 * with a pre-filled (and auto-sent) prompt.
 */

interface CopilotPanelState {
  open: boolean;
  pendingPrompt: string | null;
  openCopilot: (prompt?: string) => void;
  closeCopilot: () => void;
  consumePrompt: () => string | null;
}

export const useCopilotPanel = create<CopilotPanelState>((set, get) => ({
  open: false,
  pendingPrompt: null,

  openCopilot: (prompt?: string) =>
    set({ open: true, pendingPrompt: prompt ?? null }),

  closeCopilot: () => set({ open: false, pendingPrompt: null }),

  consumePrompt: () => {
    const p = get().pendingPrompt;
    set({ pendingPrompt: null });
    return p;
  },
}));
