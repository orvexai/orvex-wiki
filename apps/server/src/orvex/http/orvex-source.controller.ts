import { Controller, Get, InternalServerErrorException } from '@nestjs/common';

import { OrvexConfigService } from '../config/orvex-config.service';

/**
 * FR-W19 source offer response — `#/components/schemas/SourceOffer`.
 * Non-nullable by contract: an unconfigured offer is a LOUD 500 deploy-config
 * defect (see below), never a null-shaped or fabricated value.
 */
export interface SourceOfferResponse {
  sha: string;
  sourceRepo: string;
}

/**
 * FR-W19 — the AGPL section 13 written-source offer. This is REAL from day one
 * (NOT a 501 stub) and PUBLIC by intent (reachable by any network user of the
 * modified engine, without a session). It returns the exact commit SHA the
 * running binary was built from (ORVEX_GIT_SHA) and the corresponding-source
 * repository URL (ORVEX_SOURCE_REPO).
 *
 * Unconfigured env => HTTP 500 "source offer not configured" (per the
 * contract): a compliance endpoint that silently returned nulls would read as
 * healthy to monitors while offering nothing — a deploy defect must be loud.
 *
 * DELIVERY ITEM (recorded on the foundation handoff): under CLOUD
 * multi-tenancy the upstream main.ts workspace preHandler 404s requests whose
 * Host resolves to no workspace BEFORE this controller runs; exempting
 * /api/orvex/source rides the A-THIN allow-listed main.ts hook at fold-in.
 */
@Controller('orvex/source')
export class OrvexSourceController {
  constructor(private readonly config: OrvexConfigService) {}

  @Get()
  sourceOffer(): SourceOfferResponse {
    const sha = this.config.gitSha;
    const sourceRepo = this.config.sourceRepo;
    if (sha === null || sourceRepo === null) {
      throw new InternalServerErrorException('source offer not configured');
    }
    return { sha, sourceRepo };
  }
}
