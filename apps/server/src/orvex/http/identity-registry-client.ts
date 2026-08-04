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
 * ENG-2503 (A-TENANCY / D-S17) — global tenant/hostname reservation at mint
 * time. Identity's GLOBAL registry is the sole adjudicator of cross-cell
 * uniqueness; this engine's own `workspaces_hostname_unique` constraint
 * stays a PER-CELL BACKSTOP only, never the cross-cell source of truth.
 * `principalKind` records the polymorphic tenant shape: `'user'` (personal —
 * no Clerk org anywhere) vs `'org'` (a Team keyed on the Clerk-org id
 * identity mints — this engine never mints it).
 */
export interface RegistryReserveRequest {
  readonly tenantId: string;
  readonly hostname: string;
  readonly principalKind: 'user' | 'org';
}

/**
 * Reserve outcome. `orgId` is present when identity minted/vouched an org
 * principal for an `'org'`-kind reservation (the personal→Teams
 * upgrade-pass re-keys the tenant onto it).
 */
export interface RegistryReserveResult {
  readonly tenantId: string;
  readonly reserved: boolean;
  readonly orgId?: string;
}

/**
 * Typed, distinguishable failure modes — the caller maps each to its own
 * honest HTTP status (never a single opaque 500 that hides WHY the registry
 * mutation didn't happen). `TENANT_ALREADY_RESERVED` (ENG-2503) is the
 * cross-cell mint-collision rejection: the global registry refused a
 * second reservation of the same tenant/hostname.
 */
export type RegistryClientErrorCode =
  | 'NOT_FOUND'
  | 'STALE_MOVE'
  | 'DEPENDENCY_ERROR'
  | 'TENANT_ALREADY_RESERVED';

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
    super('orvex registry client is not configured (ORVEX_IDENTITY_URL unset)');
    this.name = 'RegistryClientNotConfiguredError';
  }
}

export interface IdentityRegistryClient {
  /**
   * Calls identity's `POST /internal/registry/move` (ENG-3427) — the REAL,
   * atomic, `moveId`-keyed idempotent registry cell-binding relocation
   * (ENG-1507 `Registry.Move`), reached via the engine-facing counterpart
   * of the machine-only `/v1/registry/move` this engine holds no
   * client-credentials grant for (see the implementation's own doc
   * comment). Throws `RegistryClientError` with a typed `code` on a
   * non-2xx identity response; never fabricates a success.
   */
  moveTenantCell(req: RegistryMoveRequest): Promise<RegistryMoveResult>;

  /**
   * Calls identity's `GET /v1/registry/tenants/{id}/cell` — an INDEPENDENT
   * post-move read-back of the routing-core row (never trusts the move
   * response alone; a fresh GET is the real observed outcome, same
   * discipline as identity's own `/internal/rehearsal/*` probes).
   */
  resolveTenantCell(tenantId: string): Promise<RegistryTenantCell>;

  /**
   * ENG-2503 — calls identity's `POST /v1/registry/reserve`: global
   * tenant/hostname uniqueness delegation at mint time (identity is the
   * sole writer of the routing core). Throws `RegistryClientError` with
   * `'TENANT_ALREADY_RESERVED'` on a cross-cell mint collision (409) —
   * never fabricates a reservation.
   */
  reserveTenant(req: RegistryReserveRequest): Promise<RegistryReserveResult>;
}

/**
 * Minimal fetch surface (Node 18+ global `fetch`), narrowed for injection.
 *
 * ENG-3350 — this deliberately narrows `text()`, NOT `json()`. The previous
 * shape forced {@link HttpIdentityRegistryClient.request} to call `res.json()`
 * unconditionally, so any non-JSON identity response threw a raw `SyntaxError`
 * that is NOT a {@link RegistryClientError} and escaped every typed mapping
 * below. That is exactly what happened in production: identity had no
 * `/v1/registry/reserve` route, Go's net/http answered its default
 * `404 page not found` as `text/plain`, `JSON.parse` read `404` as a number and
 * threw on the `p`, and NestJS turned the escaped SyntaxError into
 * `{"statusCode":500,"message":"Internal server error"}` — the opaque 500 that
 * made `POST /v1/exchange` refuse every fresh principal. Reading text and
 * parsing HERE is what lets a malformed body become a typed DEPENDENCY_ERROR.
 */
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
  text: () => Promise<string>;
}>;

export interface HttpIdentityRegistryClientDeps {
  /** Identity base URL (`ORVEX_IDENTITY_URL`). */
  readonly baseUrl: string;
  /** Request timeout (ms). Bounds a hung dependency into an honest failure. */
  readonly timeoutMs: number;
  /**
   * ENG-3350 — the shared engine↔identity internal bearer
   * (`INTERNAL_API_BEARER_TOKEN`), presented on the ORIGIN-LOCKED
   * `POST /internal/registry/reserve` seam. It is the SAME secret identity
   * already sends this engine on `/internal/principals/provision`; nothing new
   * is provisioned for it. `null` when unset ⇒ `reserveTenant` refuses with a
   * typed DEPENDENCY_ERROR rather than calling unauthenticated (fail closed).
   */
  readonly internalToken: string | null;
  /** Injected fetch (ACCEPT-DON'T-CREATE); defaults to global `fetch`. */
  readonly fetch: RegistryFetchLike;
}

/**
 * The ONE place a success body becomes an object, typed on the way.
 *
 * ENG-3350 — `request()` maps an empty body to `payload: null`, which is right
 * for the 404/409 branches (they never read it) and wrong for every branch that
 * DOES: `payload as Record<string, unknown>` is a compile-time cast with no
 * runtime check, so `null` (an empty body, a whitespace-only body, or a literal
 * `null`) reached a property read and threw a raw `TypeError`. That is the same
 * escape as the `SyntaxError` this fix exists to close — an untyped throw
 * crossing the seam, which NestJS renders as `{"statusCode":500}` — so it is
 * closed the same way, at the parse boundary rather than at each call site.
 */
function asJsonObject(payload: unknown, what: string): Record<string, unknown> {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    Array.isArray(payload)
  ) {
    throw new RegistryClientError(
      'DEPENDENCY_ERROR',
      `identity registry ${what} returned a success status with no JSON object body`,
    );
  }
  return payload as Record<string, unknown>;
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
  private readonly internalToken: string | null;
  private readonly fetch: RegistryFetchLike;

  constructor(deps: HttpIdentityRegistryClientDeps) {
    this.baseUrl = deps.baseUrl.replace(/\/+$/, '');
    this.timeoutMs = deps.timeoutMs;
    this.internalToken = deps.internalToken;
    this.fetch = deps.fetch;
  }

  async moveTenantCell(req: RegistryMoveRequest): Promise<RegistryMoveResult> {
    // Fail closed on a missing credential (ENG-3427, mirrors reserveTenant's
    // own ENG-3350 guard immediately below). THE DEFECT THIS CLOSES: this
    // call used to POST /v1/registry/move with NO Authorization header at
    // all. /v1/registry/move is machine-only (requireMachinePrincipal — it
    // demands an identity-minted "svc:" client-credentials grant this engine
    // does not hold in any cell, per reserveTenant's own comment below), so
    // identity denied every call with a silent 401 (no-oracle by design,
    // zero server-side log) that this client's own status switch collapsed
    // into a generic DEPENDENCY_ERROR — surfaced by the controller as a 502
    // "identity registry move failed" naming neither the real cause (wrong
    // route/credential) nor even that auth, not the move, is what failed.
    // Confirmed live: identity's own registryMove handler (which now logs
    // every failure branch, ENG-3343) emitted ZERO lines for a run that hit
    // this exact 502 — proof the request never reached it.
    //
    // Fix: identity now exposes POST /internal/registry/move (ENG-3427), the
    // engine-facing counterpart of /v1/registry/move — the SAME placement
    // reserveTenant's own /internal/registry/reserve already uses, admitting
    // the SAME already-distributed mutual internalToken. Both /internal/
    // registry/* routes now use one credential the engine already holds.
    if (this.internalToken === null) {
      throw new RegistryClientError(
        'DEPENDENCY_ERROR',
        'identity registry move requires INTERNAL_API_BEARER_TOKEN (the shared engine seam credential) and it is unset',
      );
    }
    const { status, payload } = await this.request(
      'POST',
      '/internal/registry/move',
      {
        moveId: req.moveId,
        tenantId: req.tenantId,
        fromCell: req.fromCell,
        toCell: req.toCell,
      },
      { Authorization: `Bearer ${this.internalToken}` },
    );

    if (status === 200) {
      const body = asJsonObject(payload, 'move');
      const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
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

  async reserveTenant(
    req: RegistryReserveRequest,
  ): Promise<RegistryReserveResult> {
    // Fail closed on a missing credential (ENG-3350). This is NOT the
    // single-cell `NOT_CONFIGURED` skip — that one means "no identity to
    // delegate to". This means "identity is configured but we hold no
    // credential for it", which must never be waved through as a reservation.
    if (this.internalToken === null) {
      throw new RegistryClientError(
        'DEPENDENCY_ERROR',
        'identity registry reserve requires INTERNAL_API_BEARER_TOKEN (the shared engine seam credential) and it is unset',
      );
    }
    const { status, payload } = await this.request(
      'POST',
      // ENG-3350 — the ORIGIN-LOCKED internal seam, not /v1/registry/*. The
      // /v1/registry write routes are machine-only (they require an
      // identity-minted "svc:" client-credentials grant this engine does not
      // hold in any cell); this route admits the shared engine bearer instead.
      '/internal/registry/reserve',
      {
        tenantId: req.tenantId,
        hostname: req.hostname,
        principalKind: req.principalKind,
      },
      { Authorization: `Bearer ${this.internalToken}` },
    );

    if (status === 200) {
      const body = asJsonObject(payload, 'reserve');
      const tenantId = typeof body.tenantId === 'string' ? body.tenantId : '';
      const reserved = body.reserved === true;
      if (tenantId === '' || !reserved) {
        throw new RegistryClientError(
          'DEPENDENCY_ERROR',
          'identity registry reserve returned a malformed 200 body',
        );
      }
      return {
        tenantId,
        reserved,
        orgId: typeof body.orgId === 'string' ? body.orgId : undefined,
      };
    }
    if (status === 409) {
      throw new RegistryClientError(
        'TENANT_ALREADY_RESERVED',
        'registry: tenant/hostname already reserved by another cell',
      );
    }
    if (status === 404) {
      throw new RegistryClientError('NOT_FOUND', 'registry: tenant not found');
    }
    throw new RegistryClientError(
      'DEPENDENCY_ERROR',
      `identity registry reserve returned HTTP ${status}`,
    );
  }

  /**
   * One request/response round trip, with the parse under THIS class's control.
   *
   * ENG-3350 — every failure mode below leaves as a typed
   * {@link RegistryClientError}; nothing escapes as a raw `SyntaxError`,
   * `TypeError` or `AbortError`. The class doc above promises "a non-2xx /
   * transport / parse failure is a thrown RegistryClientError"; before this fix
   * only the non-2xx leg actually kept that promise, and the parse leg's
   * escape is what turned a missing identity route into an opaque NestJS 500.
   *
   * An EMPTY body is parsed as `null` rather than rejected: some identity
   * refusals legitimately carry no body, and the per-status branches above
   * (404/409/…) never read the payload, so failing here would convert a
   * correctly-typed refusal into a DEPENDENCY_ERROR.
   */
  private async request(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
    extraHeaders?: Record<string, string>,
  ): Promise<{ status: number; payload: unknown }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let status: number;
    let raw: string;
    try {
      const res = await this.fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      status = res.status;
      raw = await res.text();
    } catch (err) {
      // Transport failure / timeout abort — honest and typed, never a
      // fabricated result and never an untyped throw crossing the seam.
      throw new RegistryClientError(
        'DEPENDENCY_ERROR',
        `identity registry ${method} ${path} failed: ${describeCause(err)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    if (raw.trim() === '') {
      return { status, payload: null };
    }
    try {
      return { status, payload: JSON.parse(raw) as unknown };
    } catch {
      throw new RegistryClientError(
        'DEPENDENCY_ERROR',
        `identity registry ${method} ${path} returned HTTP ${status} with a non-JSON body: ${snippet(raw)}`,
      );
    }
  }
}

/** Bounded, log-safe excerpt of an unexpected response body. */
function snippet(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim();
  return flat.length <= 120 ? flat : `${flat.slice(0, 120)}…`;
}

/** Message of an unknown thrown value, without assuming it is an Error. */
function describeCause(err: unknown): string {
  return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
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

  reserveTenant(_req: RegistryReserveRequest): Promise<RegistryReserveResult> {
    return Promise.reject(new RegistryClientNotConfiguredError());
  }
}
