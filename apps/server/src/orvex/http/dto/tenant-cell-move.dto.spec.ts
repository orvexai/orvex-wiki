// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { v4 as uuid4 } from 'uuid';
import { TenantCellMoveRequestDto } from './tenant-cell-move.dto';

/**
 * The cell-token conformance table for this seam, mirroring identity's own
 * TestShortCellID_AZSuffixConformance (`internal/registry/registry.go` is the
 * authority; this DTO carries a hand-copy because the public AGPL engine
 * cannot import the private Go substrate).
 *
 * It exists because the copy silently went stale: it kept the pre-AZ
 * `^[a-z]{2}[0-9]+$` across the eu1 -> eu1a catalog migration (ENG-3268) and
 * began rejecting the very cell the registry now assigns, so lib's M14
 * tenant-move rehearsal 400ed HERE with `sourceCellId must be a short registry
 * cell token` while identity — which would have accepted it — was never
 * reached. A regex that only ever gets NARROWER than its authority fails
 * closed on VALID input, which is why the AZ-suffix cases below are the
 * load-bearing ones.
 */
describe('TenantCellMoveRequestDto cell-token validation', () => {
  const cellErrors = async (cell: string) => {
    const dto = plainToInstance(TenantCellMoveRequestDto, {
      tenantId: uuid4(),
      sourceCellId: cell,
      targetCellId: cell,
    });
    return validate(dto);
  };

  // The canonical <region><ordinal><az> form the registry assigns today, plus
  // the legacy bare-ordinal form (eu9 is M14's own rehearsal target).
  it.each(['eu1a', 'eu1', 'eu9', 'us1a', 'eu10b', 'ap2'])(
    'accepts the canonical cell token %s',
    async (cell) => {
      expect(await cellErrors(cell)).toHaveLength(0);
    },
  );

  // Hyphens, uppercase, a multi-letter AZ and the long-form AWS-mirror region
  // all fail the anchored pattern — the seam must not widen into those.
  it.each(['eu-central-1a', 'eu1-a', 'EU1A', 'eu1ab', 'e1a', 'eu', 'eua', ''])(
    'rejects the non-conforming cell token %p',
    async (cell) => {
      const errors = await cellErrors(cell);
      expect(errors.length).toBeGreaterThan(0);
    },
  );

  it('rejects a non-UUID tenantId', async () => {
    const dto = plainToInstance(TenantCellMoveRequestDto, {
      tenantId: 'not-a-uuid',
      sourceCellId: 'eu1a',
      targetCellId: 'eu9',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toContain('tenantId');
  });

  // The two cell fields are validated independently — a bad target must not be
  // masked by a good source.
  it('reports the offending cell field by name', async () => {
    const dto = plainToInstance(TenantCellMoveRequestDto, {
      tenantId: uuid4(),
      sourceCellId: 'eu1a',
      targetCellId: 'eu-central-1a',
    });
    const errors = await validate(dto);
    expect(errors.map((e) => e.property)).toEqual(['targetCellId']);
  });
});
