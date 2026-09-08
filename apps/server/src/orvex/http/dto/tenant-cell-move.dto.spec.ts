// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { v4 as uuid4 } from 'uuid';

import { TenantCellMoveRequestDto } from './tenant-cell-move.dto';

/**
 * The registry's short-cell conformance table. The AZ-suffixed cases are
 * load-bearing: the old hand-copy rejected the live registry's `eu1a` value.
 */
describe('TenantCellMoveRequestDto cell-token validation', () => {
  const errorsFor = async (cell: string) => {
    const dto = plainToInstance(TenantCellMoveRequestDto, {
      tenantId: uuid4(),
      sourceCellId: cell,
      targetCellId: cell,
    });
    return validate(dto);
  };

  it.each(['eu1a', 'us1a', 'eu9'])(
    'accepts the registry cell token %s',
    async (cell) => {
      expect(await errorsFor(cell)).toHaveLength(0);
    },
  );

  it.each(['eu-central-1a', 'EU1A', 'eu', '1a', 'eu1ab'])(
    'rejects the non-conforming cell token %p',
    async (cell) => {
      expect((await errorsFor(cell)).length).toBeGreaterThan(0);
    },
  );
});
