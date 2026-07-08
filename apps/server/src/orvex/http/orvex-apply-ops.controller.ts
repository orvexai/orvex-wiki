// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Body, Controller, Param, Post } from '@nestjs/common';

import { OrvexNotImplementedException } from '../not-implemented';
import { ApplyOpsRequestDto } from './dto/apply-ops.dto';

/**
 * FR-W1 — the single atomic PM-JSON write primitive (CAS on ifVersion).
 *
 * Classified noop-501: the typed request contract (ApplyOpsRequestDto) is day-1,
 * but the atomic write logic — and its intended 200 receipt / 402 QUOTA_EXCEEDED
 * / 409 VERSION_MISMATCH shapes — is not wired yet, so it throws the typed
 * sentinel rather than any plausible-looking write receipt.
 */
@Controller('orvex/pages')
export class OrvexApplyOpsController {
  @Post(':pageId/apply-ops')
  applyOps(
    @Param('pageId') _pageId: string,
    @Body() _body: ApplyOpsRequestDto,
  ): never {
    // ORVEX_NOT_IMPLEMENTED: orvexApplyOps
    throw new OrvexNotImplementedException('orvexApplyOps');
  }
}
