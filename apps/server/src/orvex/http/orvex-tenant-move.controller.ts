// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Post,
} from '@nestjs/common';

import { OrvexNotImplementedException } from '../not-implemented';
import { TenantMoveManifestDto } from './dto/tenant-move-manifest.dto';

/** Cell-contract rule #11 — the mandatory idempotency header on every step. */
const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';

/**
 * Enforce the day-1 typed contract's mandatory Idempotency-Key header BEFORE the
 * 501 throw (cell-contract rule #11: 421-/Stripe-/Temporal-retries all replay
 * these calls). A missing/blank key is a 400 — the header contract is real today
 * even though the step body is a deliberate 501 stub.
 */
function requireIdempotencyKey(value: string | undefined): void {
  if (value === undefined || value.trim().length === 0) {
    throw new BadRequestException(`${IDEMPOTENCY_KEY_HEADER} header is required`);
  }
}

/**
 * A-MOVE — the non-retrofittable typed tenant-move step contract
 * (quiesce -> export -> import -> activate).
 *
 * Classified noop-501: the typed manifest contract + the mandatory
 * Idempotency-Key header are day-1 (a 501 stub is 5 lines; a typed contract is
 * not), but the step LOGIC is not wired. Each handler validates the header FIRST
 * (400 without it) and only THEN throws the typed sentinel.
 */
@Controller('orvex/tenant-move')
export class OrvexTenantMoveController {
  @Post('quiesce')
  quiesce(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() _manifest: TenantMoveManifestDto,
  ): never {
    requireIdempotencyKey(idempotencyKey);
    // ORVEX_NOT_IMPLEMENTED: orvexTenantMoveQuiesce
    throw new OrvexNotImplementedException('orvexTenantMoveQuiesce');
  }

  @Post('export')
  export(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() _manifest: TenantMoveManifestDto,
  ): never {
    requireIdempotencyKey(idempotencyKey);
    // ORVEX_NOT_IMPLEMENTED: orvexTenantMoveExport
    throw new OrvexNotImplementedException('orvexTenantMoveExport');
  }

  @Post('import')
  import(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() _manifest: TenantMoveManifestDto,
  ): never {
    requireIdempotencyKey(idempotencyKey);
    // ORVEX_NOT_IMPLEMENTED: orvexTenantMoveImport
    throw new OrvexNotImplementedException('orvexTenantMoveImport');
  }

  @Post('activate')
  activate(
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() _manifest: TenantMoveManifestDto,
  ): never {
    requireIdempotencyKey(idempotencyKey);
    // ORVEX_NOT_IMPLEMENTED: orvexTenantMoveActivate
    throw new OrvexNotImplementedException('orvexTenantMoveActivate');
  }
}
