import { useCallback, useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom";
import { CellDecision, CellDiscoveryClient } from "./types";
import { clearPin, pinCell, readPin } from "./cell-discovery-store";
import { validateCellHost } from "./cell-host-guard";
import { createCellDiscoveryClient } from "./cell-discovery-client";

/**
 * The deep module (CS §3): discover-once-then-pin (PO ruling 12).
 *
 * - A stored pin short-circuits BEFORE any network call (AC3 — zero calls).
 * - A cold boot discovers, validates the host against the open-redirect
 *   allow-list (T7), pins the result, and reports redirect-vs-noop by
 *   comparing against the current host (AC2/AC6).
 * - Discovery failure or an invalid host both surface as `error` — never a
 *   thrown exception (AC5).
 *
 * Not a pass-through: encapsulates the discover-once decision, pin
 * lifecycle, and is the single place both the boot hook and the axios 421
 * interceptor call into (>=2 real callers — CS §3 deletion test).
 */
export async function resolveCell(
  client: CellDiscoveryClient,
  accountId: string,
  currentHost: string = window.location.host,
): Promise<CellDecision> {
  const pinned = readPin(accountId);
  if (pinned) {
    return {
      outcome: "pinned",
      cellHost: pinned.cellHost,
      cellEpoch: pinned.cellEpoch,
    };
  }

  let discovery;
  try {
    discovery = await client.discover(accountId);
  } catch {
    return { outcome: "error" };
  }

  const { cellHost, cellEpoch } = discovery;
  if (!validateCellHost(cellHost)) {
    return { outcome: "error" };
  }

  pinCell(accountId, { cellHost, cellEpoch });

  if (cellHost === currentHost) {
    return { outcome: "noop", cellHost, cellEpoch };
  }
  return { outcome: "redirect", cellHost, cellEpoch };
}

/** AC2 — same path, new host, exactly one replace. */
export function redirectToCellHost(cellHost: string): void {
  const target = new URL(window.location.href);
  target.host = cellHost;
  window.location.replace(target.toString());
}

/**
 * 421 re-resolution (AC4, ruling 12): a cell-mismatch response means the
 * tenant moved (cell_epoch bumped, ruling 13) — clear the stale pin, run
 * discovery again, and redirect if the newly resolved host differs.
 * Exported for the axios interceptor (apps/client/src/lib/api-client.ts).
 */
export async function reresolveCellOnMismatch(
  accountId: string,
  client: CellDiscoveryClient = createCellDiscoveryClient(),
): Promise<void> {
  clearPin(accountId);
  const decision = await resolveCell(client, accountId);
  if (decision.outcome === "redirect") {
    redirectToCellHost(decision.cellHost);
  }
}

export interface UseCellDiscoveryOptions {
  client?: CellDiscoveryClient;
  accountId?: string;
}

/**
 * Boot hook (T2/T3) — wired into App() beside useRedirectToCloudSelect()/
 * useTrackOrigin(). Never throws: a discovery failure is reported via the
 * returned `error` flag so the caller can render a retry banner (AC5); the
 * app still mounts on the current host.
 */
export function useCellDiscovery(options: UseCellDiscoveryOptions = {}) {
  const workspace = useAtomValue(workspaceAtom);
  const accountId = options.accountId ?? workspace?.id;
  const [error, setError] = useState(false);
  const [retryToken, setRetryToken] = useState(0);
  const client = options.client;

  useEffect(() => {
    if (!accountId) return;
    let cancelled = false;
    setError(false);
    const discoveryClient = client ?? createCellDiscoveryClient();

    resolveCell(discoveryClient, accountId)
      .then((decision) => {
        if (cancelled) return;
        if (decision.outcome === "redirect") {
          redirectToCellHost(decision.cellHost);
        } else if (decision.outcome === "error") {
          setError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });

    return () => {
      cancelled = true;
    };
    // client is an injected port expected to be a stable ref across renders;
    // accountId/retryToken are the real triggers for re-running discovery.
  }, [accountId, retryToken]);

  const retry = useCallback(() => setRetryToken((t) => t + 1), []);

  return { error, retry };
}
