import axios from "axios";
import { getGlobalEndpoint } from "@/lib/config.ts";
import { CellDiscovery, CellDiscoveryClient } from "./types";

/**
 * The real (axios-backed) discovery client adapter (one-adapter rule, CS §3).
 * Deliberately a BARE axios instance, not the app's `api` client
 * (apps/client/src/lib/api-client.ts) — that client is scoped to same-origin
 * `/api` calls and its interceptor assumes a cell is already resolved;
 * discovery itself must run before any cell is known, against the separate
 * global endpoint (CS §7 seam map: Front-end <-> global discovery endpoint).
 */
export function createCellDiscoveryClient(): CellDiscoveryClient {
  return {
    async discover(accountId: string): Promise<CellDiscovery> {
      const endpoint = getGlobalEndpoint();
      const response = await axios.get(`${endpoint}/discovery`, {
        params: { accountId },
      });
      const payload = (response.data ?? {}) as Record<string, unknown>;
      // AC7 — read only the two pinned contract fields; any additive extra
      // fields on the response are ignored without error.
      return {
        cellHost: String(payload.cellHost),
        cellEpoch: Number(payload.cellEpoch),
      };
    },
  };
}
