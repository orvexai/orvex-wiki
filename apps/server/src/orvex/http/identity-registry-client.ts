// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

/**
 * IdentityRegistryClient (ENG-1578) — the port over orvex-studio-identity's
 * REAL, already-implemented global tenant→cell registry
 * (`internal/registry/registry.go` `Registry.Move`/`Resolve`, ENG-1507/
 * ENG-1458). Identity is the SOLE writer of the registry (PO ruling 13) —
 * this engine never mutates the cell binding itself, it only calls through.
 *
 * ACCEPT-DON'T-CREATE (CS §3.4 / §5): the registry endpoints are a NETWORK
 * SEAM, so this is a PORT — the concrete HTTP adapter is injected once at
 * module composition (mirrors `core/session-mint/identity-introspector.ts`'s
 * `IdentityIntrospector`/`HttpIdentityIntrospector` split exactly). Tests
 * inject a fake client with no network.
 *
 * DESIGN-IT-TWICE (CS §3.7 — this crosses the §7 seam map, a call to
 * ANOTHER Studio service):
 *  A. CHOSEN — a direct synchronous HTTP port to identity's already-real
 *     `/v1/registry/move` + `/v1/registry/tenants/{id}/cell` (ENG-1507).
 *     Mirrors the ALREADY-SHIPPED, already-reviewed `CallIdentityRehome`
 *     synchronous-caller shape identity's own `registryMove` doc comment
 *     names as its intended production consumer. The M14 gate needs a
 *     bounded, synchronous 200 carrying a REAL post-move observation
 *     within its 5-minute test timeout — only a synchronous call gives
 *     that without a new poll/webhook mechanism.
 *  B. REJECTED — publish a new `tenant.move.rehearsal.requested`
 *     CloudEvent on studio-spine, have identity consume it and publish a
 *     completion event this engine subscribes to (SSE/poll). Rejected:
 *     (1) no such event type is pinned in the orvex-studio-contracts
 *     catalog — adding one is a 3rd-repo ADR + contract change,
 *     disproportionate blast radius for closing M14; (2) the gate's own
 *     harness (`orvex-studio-lib` `internal/rehearsal/deployed.go`) hits
 *     ONE endpoint and decodes ONE synchronous JSON response — an async
 *     hop still needs a synchronous "wait for completion" leg somewhere
 *     for the gate to observe a bounded result, so it buys latency and
 *     complexity, not correctness.
 *  NAMED RESIDUE (not silently absorbed): the wire shape below mirrors
 *  identity's Go structs field-for-field by hand rather than through a
 *  orvex-studio-contracts-pinned schema — the SAME pre-existing gap
 *  ENG-1507 itself shipped with (its synchronous `/v1/registry/move`
 *  contract was never added to orvex-studio-contracts, only its
 *  CloudEvent legs were). Pinning it is a good, low-risk fast-follow, out
 *  of THIS ticket's collision scope (ENG-1578 closes M14; it does not
 *  re-litigate ENG-1507's already-accepted contract shape).
 */

/** The registry's routing-core row shape (mirrors identity `gen.TenantCell`, snake_case wire). */
export interface RegistryTenantCell {
  readonly tenantId: string;
  readonly cellId: string;
  readonly residencyPin: string;
  readonly cellEpoch: number;
  readonly status: string;
}

export interface RegistryMoveRequest {
  readonly moveId: string;
  readonly tenantId: string;
  readonly fromCell: string;
  readonly toCell: string;
}

/** `Registry.Move`'s result — `{tenantId, cellId}` (identity `registryMoveResponse`). */
export interface RegistryMoveResult {
  readonly tenantId: string;
  readonly cellId: string;
}

/**
 * Typed, distinguishable failure modes — the caller maps each to its own
 * honest HTTP status (never a single opaque 500 that hides WHY the registry
 * mutation didn't happen).
 */
export type RegistryClientErrorCode =
  | 'NOT_FOUND'
  | 'STALE_MOVE'
  | 'DEPENDENCY_ERROR';

export class RegistryClientError extends Error {
  constructor(
    public readonly code: RegistryClientErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RegistryClientError';
  }
}

/** Typed configuration failure — mirrors `OrvexIntrospectionNotConfiguredError`. */
export class RegistryClientNotConfiguredError extends Error {
  public readonly code = 'NOT_CONFIGURED';

  constructor() {
    super(
      'orvex registry client is not configured (ORVEX_IDENTITY_URL unset)',
    );
    this.name = 'RegistryClientNotConfiguredError';
  }
}

export interface IdentityRegistryClient {
  /**
   * Calls identity's `POST /v1/registry/move` — the REAL, atomic,
   * `moveId`-keyed idempotent registry cell-binding relocation
   * (ENG-1507 `Registry.Move`). Throws `RegistryClientError` with a typed
   * `code` on a non-2xx identity response; never fabricates a success.
   */
  moveTenantCell(req: RegistryMoveRequest): Promise<RegistryMoveResult>;

  /**
   * Calls identity's `GET /v1/registry/tenants/{id}/cell` — an INDEPENDENT
   * post-move read-back of the routing-core row (never trusts the move
   * response alone; a fresh GET is the real observed outcome, same
   * discipline as identity's own `/internal/rehearsal/*` probes).
   */
  resolveTenantCell(tenantId: string): Promise<RegistryTenantCell>;
}

/** Minimal fetch surface (Node 18+ global `fetch`), narrowed for injection. */
export type RegistryFetchLike = (
  input: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  status: number;
  json: () => Promise<unknown>;
}>;

export interface HttpIdentityRegistryClientDeps {
  /** Identity base URL (`ORVEX_IDENTITY_URL`). */
  readonly baseUrl: string;
  /** Request timeout (ms). Bounds a hung dependency into an honest failure. */
  readonly timeoutMs: number;
  /** Injected fetch (ACCEPT-DON'T-CREATE); defaults to global `fetch`. */
  readonly fetch: RegistryFetchLike;
}

/** Narrows an identity registry JSON body into the typed `RegistryTenantCell`. */
function narrowTenantCell(payload: unknown): RegistryTenantCell | null {
  if (typeof payload !== 'object' || payload === null) {
    return null;
  }
  const body = payload as Record<string, unknown>;
  const tenantId =
    typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';
  const cellId = typeof body.cell_id === 'string' ? body.cell_id.trim() : '';
  if (tenantId === '' || cellId === '') {
    return null;
  }
  return {
    tenantId,
    cellId,
    residencyPin:
      typeof body.residency_pin === 'string' ? body.residency_pin : '',
    cellEpoch: typeof body.cell_epoch === 'number' ? body.cell_epoch : 0,
    status: typeof body.status === 'string' ? body.status : '',
  };
}

/**
 * Real HTTP adapter over identity's registry seam. Field naming on the wire
 * mirrors identity's Go structs field-for-field (`moveId`/`tenantId`/
 * `fromCell`/`toCell` on the move request per `gen.TenantCell` json tags;
 * `tenant_id`/`cell_id`/... on the resolve read). A non-2xx / transport /
 * parse failure is a thrown `RegistryClientError` (honest failure) — NEVER
 * a fabricated cell binding.
 */
export class HttpIdentityRegistryClient implements IdentityRegistryClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetch: RegistryFetchLike;

  constructor(deps: HttpIdentityRegistryClientDeps) {
    this.baseUrl = deps.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.timeoutMs;
    this.fetch = deps.fetch;
  }

  async moveTenantCell(req: RegistryMoveRequest): Promise<RegistryMoveResult> {
    const { status, payload } = await this.request('POST', '/v1/registry/move', {
      moveId: req.moveId,
      tenantId: req.tenantId,
      fromCell: req.fromCell,
      toCell: req.toCell,
    });

    if (status === 200) {
      const body = payload as Record<string, unknown>;
      const tenantId =
        typeof body.tenantId === 'string' ? body.tenantId : '';
      const cellId = typeof body.cellId === 'string' ? body.cellId : '';
      if (tenantId === '' || cellId === '') {
        throw new RegistryClientError(
          'DEPENDENCY_ERROR',
          'identity registry move returned a malformed 200 body',
        );
      }
      return { tenantId, cellId };
    }
    if (status === 404) {
      throw new RegistryClientError('NOT_FOUND', 'registry: tenant not found');
    }
    if (status === 409) {
      throw new RegistryClientError(
        'STALE_MOVE',
        'registry: stale move (registry has moved on)',
      );
    }
    throw new RegistryClientError(
      'DEPENDENCY_ERROR',
      `identity registry move returned HTTP ${status}`,
    );
  }

  async resolveTenantCell(tenantId: string): Promise<RegistryTenantCell> {
    const { status, payload } = await this.request(
      'GET',
      `/v1/registry/tenants/${encodeURIComponent(tenantId)}/cell`,
    );

    if (status === 200) {
      const rec = narrowTenantCell(payload);
      if (!rec) {
        throw new RegistryClientError(
          'DEPENDENCY_ERROR',
          'identity registry resolve returned a malformed 200 body',
        );
      }
      return rec;
    }
    if (status === 404) {
      throw new RegistryClientError('NOT_FOUND', 'registry: tenant not found');
    }
    throw new RegistryClientError(
      'DEPENDENCY_ERROR',
      `identity registry resolve returned HTTP ${status}`,
    );
  }

  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; payload: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = await res.json();
      return { status: res.status, payload };
    } finally {
      clearTimeout(timer);
    }
  }
}

/**
 * The fail-closed client composed when `ORVEX_IDENTITY_URL` is unset. Any
 * attempt to move/resolve throws the typed NOT_CONFIGURED error — the
 * engine never fabricates a registry mutation it cannot reach.
 */
export class NotConfiguredRegistryClient implements IdentityRegistryClient {
  moveTenantCell(_req: RegistryMoveRequest): Promise<RegistryMoveResult> {
    return Promise.reject(new RegistryClientNotConfiguredError());
  }

  resolveTenantCell(_tenantId: string): Promise<RegistryTenantCell> {
    return Promise.reject(new RegistryClientNotConfiguredError());
  }
}
