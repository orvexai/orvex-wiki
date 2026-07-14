// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Controller, Get, Inject, Req, Res, UnauthorizedException } from '@nestjs/common';
import { OrvexMetricsService } from '@orvexai/metrics';
import { FastifyReply, FastifyRequest } from 'fastify';

import { Public } from '../../common/decorators/public.decorator';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import {
  isMetricsRequestAuthorized,
  METRICS_AUTH_CONFIG,
  MetricsAuthConfig,
} from './metrics-auth';

/**
 * MetricsController (ENG-1360, T3/T4) — the engine-resident Prometheus
 * scrape surface. THIN HANDLER (CS §6): authz (CIDR/bearer) → read the
 * shared registry → send. No business logic, no store access (§4c).
 *
 * Ported from the fork pin `050187676624f2395c55b36ec60e365f87fd4a9f`
 * (`apps/server/src/orvex/metrics/metrics.controller.ts#L20-L57`); the
 * registry itself now lives in the `@orvexai/metrics` npm package
 * (`orvex-studio-lib`, PD-4d ruling — see ENG-1360 §1) instead of being
 * re-declared locally.
 *
 * Route sits OUTSIDE the `/api` global prefix (`main.ts`'s
 * `setGlobalPrefix` exclude list) — AC6.
 */
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: OrvexMetricsService,
    @Inject(METRICS_AUTH_CONFIG)
    private readonly authConfig: MetricsAuthConfig,
  ) {}

  @Public()
  @SkipTransform()
  @Get()
  async getMetrics(
    @Req() req: FastifyRequest,
    @Res({ passthrough: false }) reply: FastifyReply,
  ): Promise<void> {
    if (
      !isMetricsRequestAuthorized(
        this.authConfig,
        req.ip,
        req.headers.authorization,
      )
    ) {
      throw new UnauthorizedException();
    }
    const body = await this.metrics.getMetrics();
    reply.header('Content-Type', this.metrics.getContentType());
    reply.send(body);
  }
}
