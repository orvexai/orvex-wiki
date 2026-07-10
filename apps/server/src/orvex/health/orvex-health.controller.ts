// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { Controller, Get } from '@nestjs/common';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { OrvexHealthBody, OrvexHealthService } from './orvex-health.service';

/**
 * OrvexHealthController (ENG-1604 AC8) — `GET /health/orvex`, the
 * FAMILY-HEALTH-RULING liveness contract: HTTP 200 UNCONDITIONALLY, with
 * per-dependency status carried in the body (never a 503 — see
 * {@link OrvexHealthService} for the ADR-0020 rationale). Distinct from the
 * upstream `HealthController` (`/health`, terminus, correctly 503s for its
 * own consumers) — that controller is untouched by this ticket (AC8.3).
 *
 * `@SkipTransform()` — the global response-transform interceptor must not
 * wrap this body (same reason the upstream `/health` and `orvex/llms`
 * controllers skip it).
 */
@Controller('health/orvex')
export class OrvexHealthController {
  constructor(private readonly healthService: OrvexHealthService) {}

  @SkipTransform()
  @Get()
  async check(): Promise<OrvexHealthBody> {
    return this.healthService.check();
  }
}
