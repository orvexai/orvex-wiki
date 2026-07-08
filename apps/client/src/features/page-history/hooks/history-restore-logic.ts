/**
 * ENG-1369 (AC6) — thin, framework-agnostic restore state-machine.
 *
 * Mirrors the fork's `orvex-client/page-history/__tests__/history-restore-logic.spec.ts`
 * contract: `pendingRestoreId` is set synchronously on trigger, cleared to
 * `null` on success, and RETAINED (for retry) on failure.
 *
 * Kept as a pure reducer (no React, no react-query) so it is unit-testable
 * in isolation and reusable from any hook implementation.
 */
export interface HistoryRestoreState {
  pendingRestoreId: string | null;
}

export type HistoryRestoreAction =
  | { type: "TRIGGER"; historyId: string }
  | { type: "SUCCESS" }
  | { type: "FAILURE" };

export const initialHistoryRestoreState: HistoryRestoreState = {
  pendingRestoreId: null,
};

export function historyRestoreReducer(
  state: HistoryRestoreState,
  action: HistoryRestoreAction,
): HistoryRestoreState {
  switch (action.type) {
    case "TRIGGER":
      return { pendingRestoreId: action.historyId };
    case "SUCCESS":
      return { pendingRestoreId: null };
    case "FAILURE":
      // Retained (not cleared) so the caller can retry the SAME id.
      return state;
    default:
      return state;
  }
}
