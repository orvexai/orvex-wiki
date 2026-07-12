// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  BadGatewayException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';

import { OrvexTenantCellMoveService } from './orvex-tenant-cell-move.service';
import { TenantCellMoveRequestDto } from './dto/tenant-cell-move.dto';
import {
  IdentityRegistryClient,
  RegistryClientError,
  RegistryMoveRequest,
  RegistryMoveResult,
  RegistryTenantCell,
} from './identity-registry-client';
import { IdentityIntrospector } from '../../core/session-mint/identity-introspector';

// ── Test doubles — the load-bearing collaborators (network seams). ──────────

class FakeIntrospector implements IdentityIntrospector {
  public lastToken: string | undefined;
  constructor(
    private readonly result:
      | { subject: string; workspaceId: string }
      | null,
  ) {}
  introspect(
    token: string,
  ): Promise<{ subject: string; workspaceId: string } | null> {
    this.lastToken = token;
    return Promise.resolve(this.result);
  }
}

class FakeRegistryClient implements IdentityRegistryClient {
  public moveCalls: RegistryMoveRequest[] = [];
  public resolveCalls: string[] = [];
  constructor(
    private readonly moveResult:
      | RegistryMoveResult
      | (() => Promise<never>),
    private readonly resolveResult:
      | RegistryTenantCell
      | (() => Promise<never>),
  ) {}

  moveTenantCell(req: RegistryMoveRequest): Promise<RegistryMoveResult> {
    this.moveCalls.push(req);
    if (typeof this.moveResult === 'function') return this.moveResult();
    return Promise.resolve(this.moveResult);
  }

  resolveTenantCell(tenantId: string): Promise<RegistryTenantCell> {
    this.resolveCalls.push(tenantId);
    if (typeof this.resolveResult === 'function') return this.resolveResult();
    return Promise.resolve(this.resolveResult);
  }
}

const DTO: TenantCellMoveRequestDto = Object.assign(
  new TenantCellMoveRequestDto(),
  {
    tenantId: '57b13b69-33ab-49fa-8c82-c77d277e3e46',
    sourceCellId: 'eu1',
    targetCellId: 'eu9',
  },
);

const MACHINE_PRINCIPAL = { subject: 'svc:m14-rehearsal', workspaceId: 'x' };
const USER_PRINCIPAL = { subject: 'user-abc-123', workspaceId: 'x' };

function makeService(opts: {
  principal: { subject: string; workspaceId: string } | null;
  moveResult?: RegistryMoveResult | (() => Promise<never>);
  resolveResult?: RegistryTenantCell | (() => Promise<never>);
}) {
  const introspector = new FakeIntrospector(opts.principal);
  const registryClient = new FakeRegistryClient(
    opts.moveResult ?? { tenantId: DTO.tenantId, cellId: DTO.targetCellId },
    opts.resolveResult ?? {
      tenantId: DTO.tenantId,
      cellId: DTO.targetCellId,
      residencyPin: '',
      cellEpoch: 1,
      status: 'active',
    },
  );
  const service = new OrvexTenantCellMoveService(introspector, registryClient);
  return { service, introspector, registryClient };
}

describe('OrvexTenantCellMoveService', () => {
  it('DENY — no bearer -> 401, no registry call made', async () => {
    const t = makeService({ principal: MACHINE_PRINCIPAL });
    await expect(
      t.service.moveCell(null, DTO, null),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.registryClient.moveCalls).toHaveLength(0);
  });

  it('DENY — introspection rejects the bearer (null principal) -> 401', async () => {
    const t = makeService({ principal: null });
    await expect(
      t.service.moveCell('some-token', DTO, null),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.registryClient.moveCalls).toHaveLength(0);
  });

  it('DENY (isolation-critical) — a non-machine (Clerk user) principal is rejected, not just any active bearer', async () => {
    const t = makeService({ principal: USER_PRINCIPAL });
    await expect(
      t.service.moveCell('user-session-token', DTO, null),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(t.registryClient.moveCalls).toHaveLength(0);
  });

  it('HAPPY PATH — machine bearer, move + independent verify both show the target cell', async () => {
    const t = makeService({ principal: MACHINE_PRINCIPAL });
    const result = await t.service.moveCell('svc-token', DTO, null);
    expect(result).toEqual({
      sourceCellResidueBytes: 0,
      targetCellHasData: true,
      status: 'active',
    });
    expect(t.registryClient.moveCalls).toHaveLength(1);
    expect(t.registryClient.moveCalls[0]).toMatchObject({
      tenantId: DTO.tenantId,
      fromCell: DTO.sourceCellId,
      toCell: DTO.targetCellId,
    });
    expect(t.registryClient.moveCalls[0].moveId).toBeTruthy();
    expect(t.registryClient.resolveCalls).toEqual([DTO.tenantId]);
  });

  it('a caller-supplied Idempotency-Key becomes the registry moveId (real per-caller idempotency)', async () => {
    const t = makeService({ principal: MACHINE_PRINCIPAL });
    await t.service.moveCell('svc-token', DTO, 'my-stable-key');
    expect(t.registryClient.moveCalls[0].moveId).toBe('my-stable-key');
  });

  it('an absent Idempotency-Key mints a fresh moveId per call (never empty, never reused across calls)', async () => {
    const t = makeService({ principal: MACHINE_PRINCIPAL });
    await t.service.moveCell('svc-token', DTO, null);
    await t.service.moveCell('svc-token', DTO, null);
    const [first, second] = t.registryClient.moveCalls;
    expect(first.moveId).toBeTruthy();
    expect(second.moveId).toBeTruthy();
    expect(first.moveId).not.toBe(second.moveId);
  });

  // ── NON-TAUTOLOGY: the isolation guarantee must be a REAL computed value,
  // never a hardcoded 0/true. A move that leaves the tenant still resident
  // at the SOURCE cell (a genuine cross-cell-residue defect) MUST surface as
  // a real, nonzero residue and a FALSE targetCellHasData — never silently
  // reported as a clean move. ─────────────────────────────────────────────
  it('LEAK CAUGHT — independent verify still shows the SOURCE cell -> nonzero real residue, targetCellHasData=false', async () => {
    const stillAtSource: RegistryTenantCell = {
      tenantId: DTO.tenantId,
      cellId: DTO.sourceCellId,
      residencyPin: '',
      cellEpoch: 0,
      status: 'active',
    };
    const t = makeService({
      principal: MACHINE_PRINCIPAL,
      resolveResult: stillAtSource,
    });
    const result = await t.service.moveCell('svc-token', DTO, null);
    expect(result.targetCellHasData).toBe(false);
    expect(result.sourceCellResidueBytes).toBeGreaterThan(0);
    // The residue is a REAL measurement of the still-resident record, not a
    // magic constant.
    expect(result.sourceCellResidueBytes).toBe(
      Buffer.byteLength(JSON.stringify(stillAtSource), 'utf8'),
    );
  });

  it('neither source nor target after verify -> honest false/0 (never a fabricated pass)', async () => {
    const elsewhere: RegistryTenantCell = {
      tenantId: DTO.tenantId,
      cellId: 'us1',
      residencyPin: '',
      cellEpoch: 2,
      status: 'active',
    };
    const t = makeService({
      principal: MACHINE_PRINCIPAL,
      resolveResult: elsewhere,
    });
    const result = await t.service.moveCell('svc-token', DTO, null);
    expect(result.targetCellHasData).toBe(false);
    expect(result.sourceCellResidueBytes).toBe(0);
  });

  it('MOVE dependency: NOT_FOUND maps to 404', async () => {
    const t = makeService({
      principal: MACHINE_PRINCIPAL,
      moveResult: () =>
        Promise.reject(new RegistryClientError('NOT_FOUND', 'no tenant')),
    });
    await expect(
      t.service.moveCell('svc-token', DTO, null),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(t.registryClient.resolveCalls).toHaveLength(0);
  });

  it('MOVE dependency: STALE_MOVE maps to 409 (fail closed, never applies a stale precondition)', async () => {
    const t = makeService({
      principal: MACHINE_PRINCIPAL,
      moveResult: () =>
        Promise.reject(new RegistryClientError('STALE_MOVE', 'stale')),
    });
    await expect(
      t.service.moveCell('svc-token', DTO, null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('MOVE dependency: a transport/5xx failure maps to 502 (never a fabricated success)', async () => {
    const t = makeService({
      principal: MACHINE_PRINCIPAL,
      moveResult: () => Promise.reject(new Error('ECONNREFUSED')),
    });
    await expect(
      t.service.moveCell('svc-token', DTO, null),
    ).rejects.toBeInstanceOf(BadGatewayException);
  });

  it('VERIFY dependency failure (post-move read-back) maps to 502, not a fabricated targetCellHasData', async () => {
    const t = makeService({
      principal: MACHINE_PRINCIPAL,
      resolveResult: () =>
        Promise.reject(new RegistryClientError('DEPENDENCY_ERROR', 'down')),
    });
    await expect(
      t.service.moveCell('svc-token', DTO, null),
    ).rejects.toBeInstanceOf(BadGatewayException);
    // The mutation itself was still attempted (real) — only the honest
    // verification step failed.
    expect(t.registryClient.moveCalls).toHaveLength(1);
  });
});
