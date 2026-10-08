// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipTransform } from '../../common/decorators/skip-transform.decorator';
import { WorkspaceCellAssertionService } from '../../common/cell-isolation/workspace-cell-assertion.service';
import { EDGE_ASSERTION_VERIFIER } from '../../orvex/edge-auth/edge-auth.module';
import type { EdgeAssertionVerifier } from '../../orvex/edge-auth/edge-assertion-verifier';
import { EdgeAssertionVerificationError } from '../../orvex/edge-auth/edge-assertion.types';
import { AccountDeletionPreflightService } from './account-deletion-preflight.service';

type EdgeAssertionVerifierPort = Pick<EdgeAssertionVerifier, 'verify'>;

/**
 * User-context account-deletion preflight. This route deliberately does not
 * use InternalApiAuthGuard: the caller must present Identity's ADR-0049
 * user assertion, and the verified sub/tenant are its only identity inputs.
 */
@Controller('internal/account-deletion')
export class AccountDeletionPreflightController {
  constructor(
    @Inject(EDGE_ASSERTION_VERIFIER)
    private readonly edgeVerifier: EdgeAssertionVerifierPort,
    private readonly cellAssertion: WorkspaceCellAssertionService,
    private readonly preflight: AccountDeletionPreflightService,
  ) {}

  @SkipTransform()
  @HttpCode(HttpStatus.OK)
  @Post('preflight')
  async check(
    @Headers('x-orvex-assertion') assertionHeader: string | undefined,
  ) {
    const assertion = assertionHeader?.trim();
    if (!assertion) {
      throw new UnauthorizedException('user assertion required');
    }

    let claims;
    try {
      claims = await this.edgeVerifier.verify(assertion);
    } catch (err: unknown) {
      if (err instanceof EdgeAssertionVerificationError) {
        throw new UnauthorizedException('user assertion rejected');
      }
      throw err;
    }

    await this.cellAssertion.assertWorkspaceId(
      claims.tenant,
      'internal account-deletion/preflight',
    );
    return this.preflight.check(claims.sub, claims.tenant);
  }
}
