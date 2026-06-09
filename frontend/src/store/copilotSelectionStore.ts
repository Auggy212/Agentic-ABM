import { create } from "zustand";

/**
 * Per-page selection that the Copilot reads. Each page that has a meaningful
 * "what is the operator looking at right now" calls `setSelection` from a
 * `useEffect` whenever the local selection changes (CP3 row click, CP4 drawer
 * open, etc.). Cleared when the user navigates away.
 *
 * Keep this store small — selection_ids are the only thing the backend reads.
 * Anything richer should go through the page-context loader on the server.
 */

export type SelectionEntityKind =
  | "message"
  | "buyer"
  | "account"
  | "handoff"
  | "send"
  | "halt";

export interface CopilotSelectionState {
  entityKind: SelectionEntityKind | null;
  selectionIds: string[];
  setSelection: (kind: SelectionEntityKind | null, ids: string[]) => void;
  clear: () => void;
}

export const useCopilotSelection = create<CopilotSelectionState>((set) => ({
  entityKind: null,
  selectionIds: [],
  setSelection: (kind, ids) => set({ entityKind: kind, selectionIds: ids }),
  clear: () => set({ entityKind: null, selectionIds: [] }),
}));
