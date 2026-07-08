// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { OrvexTransclusionSafeguardService } from './orvex-transclusion-safeguard.service';
import { TransclusionImpactRequestDto } from './dto/transclusion-impact-request.dto';
import { TransclusionImpactReport } from './transclusion-safeguard.types';

/**
 * AC6 — `POST /api/pages/transclusion/impact`. Thin (CS §12 ❌1):
 * guard -> parse DTO -> one service call -> return. Read-only — never
 * mutates (no delete/unsync side effect), so it can be safely polled by
 * the `transclusion-wiki-modal` client leg before it decides how to
 * resolve a conflict.
 */
@Controller('pages/transclusion')
@UseGuards(JwtAuthGuard)
export class OrvexTransclusionImpactController {
  constructor(
    private readonly transclusionSafeguardService: OrvexTransclusionSafeguardService,
  ) {}

  @Post('impact')
  @HttpCode(HttpStatus.OK)
  async impact(
    @Body() dto: TransclusionImpactRequestDto,
  ): Promise<TransclusionImpactReport> {
    return this.transclusionSafeguardService.computeImpact(
      dto.pageId,
      dto.operation,
    );
  }
}
