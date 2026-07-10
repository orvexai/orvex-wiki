import { CellPin } from "./types";

const STORAGE_KEY_PREFIX = "cell-discovery:pin:";

function storageKey(accountId: string): string {
  return `${STORAGE_KEY_PREFIX}${accountId}`;
}

/**
 * sessionStorage-backed pin lifecycle (T3), keyed by account. The pinned
 * value carries the cellEpoch it was discovered under (PO ruling 13); a
 * tenant-move bumps the epoch server-side and is observed client-side only
 * via the 421 self-heal (clearPin -> re-discover), never by comparing a
 * locally-held "current" epoch.
 */
export function pinCell(accountId: string, pin: CellPin): void {
  try {
    sessionStorage.setItem(storageKey(accountId), JSON.stringify(pin));
  } catch {
    // sessionStorage unavailable (private mode / quota) — degrade to
    // re-discovering on every boot rather than throwing (CS §10).
  }
}

export function readPin(accountId: string): CellPin | null {
  try {
    const raw = sessionStorage.getItem(storageKey(accountId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      typeof parsed?.cellHost === "string" &&
      typeof parsed?.cellEpoch === "number"
    ) {
      return { cellHost: parsed.cellHost, cellEpoch: parsed.cellEpoch };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearPin(accountId: string): void {
  try {
    sessionStorage.removeItem(storageKey(accountId));
  } catch {
    // no-op — nothing to clear if storage is unavailable
  }
}
