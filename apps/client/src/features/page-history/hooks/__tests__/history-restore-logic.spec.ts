import { describe, expect, it } from "vitest";
import {
  historyRestoreReducer,
  initialHistoryRestoreState,
  HistoryRestoreState,
} from "../history-restore-logic";

/**
 * ENG-1369 (AC6) — the ported 4-transition contract for the thin restore
 * state machine (mirrors the fork's
 * `orvex-client/page-history/__tests__/history-restore-logic.spec.ts`):
 * pending set on trigger, cleared on success, retained on failure, and a
 * fresh trigger after a failure (retry) overwrites the retained id.
 */
describe("historyRestoreReducer (ENG-1369 AC6)", () => {
  it("starts with pendingRestoreId = null", () => {
    expect(initialHistoryRestoreState.pendingRestoreId).toBeNull();
  });

  it("1) TRIGGER sets pendingRestoreId synchronously", () => {
    const next = historyRestoreReducer(initialHistoryRestoreState, {
      type: "TRIGGER",
      historyId: "history-1",
    });
    expect(next.pendingRestoreId).toBe("history-1");
  });

  it("2) SUCCESS clears pendingRestoreId to null", () => {
    const pending: HistoryRestoreState = { pendingRestoreId: "history-1" };
    const next = historyRestoreReducer(pending, { type: "SUCCESS" });
    expect(next.pendingRestoreId).toBeNull();
  });

  it("3) FAILURE retains pendingRestoreId (for retry)", () => {
    const pending: HistoryRestoreState = { pendingRestoreId: "history-1" };
    const next = historyRestoreReducer(pending, { type: "FAILURE" });
    expect(next.pendingRestoreId).toBe("history-1");
  });

  it("4) a retry TRIGGER after a FAILURE overwrites the retained id", () => {
    const pending: HistoryRestoreState = { pendingRestoreId: "history-1" };
    const afterFailure = historyRestoreReducer(pending, { type: "FAILURE" });
    const retried = historyRestoreReducer(afterFailure, {
      type: "TRIGGER",
      historyId: "history-2",
    });
    expect(retried.pendingRestoreId).toBe("history-2");
  });
});
