/**
 * Pinned contracts shape (ENG-1364, Orvex Studio Contracts satellite —
 * `CellDiscovery`). AC7 (forward-compat): a real discovery response may
 * carry additional fields beyond these two; only cellHost + cellEpoch are
 * ever read (see cell-discovery-client.ts).
 */
export interface CellDiscovery {
  cellHost: string;
  cellEpoch: number;
}

/** The persisted pin is exactly the discovery result last accepted. */
export type CellPin = CellDiscovery;

/**
 * True-external port (CS §5) — the network boundary the discovery client
 * crosses (Front-end ↔ global discovery endpoint, ENG-1364). Injected so it
 * is substitutable in tests (CS §7 seam map, "a port is justified").
 */
export interface CellDiscoveryClient {
  discover(accountId: string): Promise<CellDiscovery>;
}

/** The outcome of resolveCell — the single decision point (CS §3 deep module). */
export type CellDecision =
  | { outcome: "pinned"; cellHost: string; cellEpoch: number }
  | { outcome: "redirect"; cellHost: string; cellEpoch: number }
  | { outcome: "noop"; cellHost: string; cellEpoch: number }
  | { outcome: "error" };
