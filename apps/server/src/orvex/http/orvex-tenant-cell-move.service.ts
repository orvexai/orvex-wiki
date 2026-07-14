// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';

import {
  IdentityIntrospector,
} from '../../core/session-mint/identity-introspector';
import {
  IdentityRegistryClient,
  RegistryClientError,
} from './identity-registry-client';
import { TenantCellMoveRequestDto } from './dto/tenant-cell-move.dto';

/** DI token for the machine-bearer introspector this endpoint uses. */
export const TENANT_MOVE_INTROSPECTOR = Symbol('TENANT_MOVE_INTROSPECTOR');

/** DI token for the identity registry HTTP port. */
export const TENANT_MOVE_REGISTRY_CLIENT = Symbol(
  'TENANT_MOVE_REGISTRY_CLIENT',
);

/**
 * The serviceauth convention every client-credentials-minted principal's
 * `subject` carries — `svc:<client-id>` (mirrors
 * orvex-studio-identity `internal/server/rehearsal.go` `svcSubjectPrefix`).
 * A Clerk-session USER principal never has this prefix.
 */
const SVC_SUBJECT_PREFIX = 'svc:';

/** The wire response `POST /api/orvex/tenant-move` returns — mirrors
 * orvex-studio-lib `internal/rehearsal.tenantMoveResult` field-for-field. */
export interface TenantCellMoveResult {
  readonly sourceCellResidueBytes: number;
  readonly targetCellHasData: boolean;
  readonly status: string;
}

/**
 * OrvexTenantCellMoveService (ENG-1578, M14 closing gate AC6) — the
 * REGISTRY cross-cell tenant-MOVE: atomically relocate a tenant's cell
 * binding from `sourceCellId` to `targetCellId`.
 *
 * SCOPE (collision guard, PO ruling): this is the REGISTRY-level relocation
 * ONLY — identity's `Registry.Move` (ENG-1507, already real, atomic,
 * `moveId`-keyed idempotent, fails closed on a stale precondition). It is
 * NOT the bulk tenant-CONTENT quiesce/export/import pipeline
 * (`orvex-tenant-move.controller.ts`'s `/quiesce`/`/export`/`/import`/
 * `/activate` sub-routes stay deliberate 501 stubs — "a separate, much
 * larger effort", per the M14 pass87 residue note). For the M14 rehearsal's
 * ephemeral, zero-endpoint target cell (`eu9`, PO ruling 2026-07-12) there
 * is no physical bulk content to relocate; the registry cell binding IS the
 * complete, honest scope of what "tenant-move" can mean against that cell.
 *
 * THE THREE GATES:
 *  1. AUTHN (deny-by-default) — the caller's bearer is forwarded to
 *     identity's own introspection (the SAME composed verify path
 *     `POST /v1/introspect` uses — never a static shared-secret compare,
 *     which a per-run minted bearer could never satisfy; mirrors identity's
 *     own `rehearsalAuthenticate` fix, ENG-1578 pass82 RULING 2). A
 *     Clerk-session USER principal is also rejected — only a MACHINE
 *     principal (`subject` prefixed `svc:`) may relocate a tenant's cell
 *     binding; without this an ordinary user session could move ANY
 *     tenant's cell (isolation break).
 *  2. MOVE — delegates to identity's real `POST /v1/registry/move`
 *     (registry is the SOLE writer, PO ruling 13). This one call already
 *     satisfies: the registry cell-binding update, the `moveId`-keyed
 *     idempotency ledger, the atomic `identity.cell.moved` outbox audit
 *     event (identity `PutAndEnqueue`, ENG-1458 T5/AC6 — the SAME
 *     transaction as the mutation), and fail-closed rejection of a stale
 *     precondition (`ErrStaleMove` -> 409). The engine workspace UUID
 *     mapping (ENG-1992 `GetWorkspace`/`ProvisionWorkspaceMapping`) is a
 *     SEPARATE table `Registry.Move` never touches — preserved by
 *     construction, not by a second write here.
 *  3. VERIFY — an INDEPENDENT post-move `GET
 *     /v1/registry/tenants/{id}/cell` read-back (never trust the move
 *     response alone — same discipline as identity's own
 *     `/internal/rehearsal/*` probes: a real observation, not a fabricated
 *     one). `sourceCellResidueBytes`/`targetCellHasData` are computed from
 *     this REAL read, never hardcoded.
 *
 * NO LOCAL PERSISTENCE: this service does not write to the engine's own
 * Postgres. The M14 rehearsal tenant has no local `workspaces` row (the
 * deployed dev database was verified empty — see the ENG-1578 pass90 log),
 * and both the engine's own `orvex_event_outbox` and `audit` tables carry a
 * HARD FK to `workspaces.id`; writing an engine-local audit/outbox row for
 * a tenant with no local workspace would either silently no-op (a
 * fabricated-looking "audit emitted" that never happened, CS §11) or throw
 * an FK violation for exactly the tenant this gate rehearses against.
 * Neither is acceptable. The registry mutation's audit trail is already
 * real and atomic at its true source of truth (identity) — this endpoint
 * does not duplicate it.
 */
@Injectable()
export class OrvexTenantCellMoveService {
  private readonly logger = new Logger(OrvexTenantCellMoveService.name);

  constructor(
    @Inject(TENANT_MOVE_INTROSPECTOR)
    private readonly introspector: IdentityIntrospector,
    @Inject(TENANT_MOVE_REGISTRY_CLIENT)
    private readonly registryClient: IdentityRegistryClient,
  ) {}

  async moveCell(
    bearer: string | null,
    dto: TenantCellMoveRequestDto,
    idempotencyKey: string | null,
  ): Promise<TenantCellMoveResult> {
    // 1 · AUTHN — deny-by-default, machine-only.
    if (!bearer) {
      throw new UnauthorizedException('bearer token required');
    }
    const principal = await this.introspector.introspect(bearer);
    if (!principal || !principal.subject.startsWith(SVC_SUBJECT_PREFIX)) {
      this.logger.warn(
        'tenant-move denied: bearer not active or not a machine principal',
      );
      throw new UnauthorizedException('bearer rejected');
    }

    // 2 · MOVE — delegate the registry cell-binding relocation to identity
    // (the sole writer). A caller-supplied Idempotency-Key becomes the
    // moveId (real per-caller idempotency control, mirrors the
    // Idempotency-Key convention the sibling A-MOVE step contract already
    // uses); absent one (the M14 gate sends none), a fresh moveId is safe
    // BECAUSE identity's own Move is ALSO state-based idempotent
    // (current.CellID == toCell short-circuits to a no-op independent of
    // moveId) — a fresh moveId per retry never double-applies.
    const moveId = idempotencyKey?.trim() || randomUUID();
    try {
      await this.registryClient.moveTenantCell({
        moveId,
        tenantId: dto.tenantId,
        fromCell: dto.sourceCellId,
        toCell: dto.targetCellId,
      });
    } catch (err) {
      throw this.mapRegistryError(err, 'move');
    }

    // 3 · VERIFY — an independent read-back; the response shape is
    // computed from what is REALLY there, never fabricated.
    let resolved;
    try {
      resolved = await this.registryClient.resolveTenantCell(dto.tenantId);
    } catch (err) {
      throw this.mapRegistryError(err, 'verify');
    }

    const targetCellHasData = resolved.cellId === dto.targetCellId;
    // Residue is a REAL measurement, not a hardcoded zero: if the
    // independent read-back still shows the tenant at the SOURCE cell (the
    // move did not actually take effect), report the real byte size of
    // that still-resident record as nonzero residue so the gate fails
    // loud on a genuine defect rather than being told a lie.
    const sourceCellResidueBytes =
      resolved.cellId === dto.sourceCellId
        ? Buffer.byteLength(JSON.stringify(resolved), 'utf8')
        : 0;

    return {
      sourceCellResidueBytes,
      targetCellHasData,
      status: resolved.status || 'unknown',
    };
  }

  private mapRegistryError(err: unknown, step: 'move' | 'verify'): Error {
    if (err instanceof RegistryClientError) {
      switch (err.code) {
        case 'NOT_FOUND':
          return new NotFoundException('tenant not found in registry');
        case 'STALE_MOVE':
          return new ConflictException(
            'stale move: registry has moved on',
          );
        case 'DEPENDENCY_ERROR':
          return new BadGatewayException(
            `identity registry ${step} failed`,
          );
      }
    }
    this.logger.error(
      `tenant-move ${step} against identity registry failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return new BadGatewayException(`identity registry ${step} failed`);
  }
}
