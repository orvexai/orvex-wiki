import { Controller, Get } from '@nestjs/common';

import { OrvexNotImplementedException } from '../not-implemented';

/**
 * FR-W15 — the F-QUOTA usage-vs-caps readout that backs the 402 QUOTA_EXCEEDED
 * guard on the write surfaces.
 *
 * Classified noop-501: emitting fabricated zero-usage readings would be a mock,
 * so this throws the typed sentinel until the real entitlement read is wired.
 */
@Controller('orvex/quota')
export class OrvexQuotaController {
  @Get()
  getQuota(): never {
    // ORVEX_NOT_IMPLEMENTED: orvexGetQuota
    throw new OrvexNotImplementedException('orvexGetQuota');
  }
}
