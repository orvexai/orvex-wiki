// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { CanActivate, ExecutionContext, Injectable, NotFoundException } from '@nestjs/common';
import { LicenseCheckService } from '../../integrations/environment/license-check.service';
import { Feature } from '../../common/features';

/**
 * ENG-1459 (AC2) — QMS is D-EE-1-deferred: OFF by default on the
 * open-signup path. Gating happens via the SAME entitlement primitive the
 * rest of the codebase already uses for licensed features
 * (`LicenseCheckService.hasFeature` / `Feature.PAGE_VERIFICATION` —
 * `common/features.ts`), not a boot-time `ee/` require-and-unmount (that
 * pattern doesn't exist for this feature in this repo, and per-workspace
 * entitlement can only be resolved at request time on a shared
 * multi-tenant process anyway — CS §3 design-it-twice).
 *
 * A caller without the entitlement gets a plain 404 — the AC's accepted
 * "404 / provider absent" alternative — never a 403 that would leak the
 * existence of the route/feature to an unentitled workspace.
 */
@Injectable()
export class PageVerificationEntitlementGuard implements CanActivate {
  constructor(private readonly licenseCheckService: LicenseCheckService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const workspace = request.raw?.workspace ?? request?.user?.workspace;

    if (!workspace) {
      throw new NotFoundException('Not found');
    }

    const entitled = this.licenseCheckService.hasFeature(
      workspace.licenseKey,
      Feature.PAGE_VERIFICATION,
      workspace.plan,
    );

    if (!entitled) {
      throw new NotFoundException('Not found');
    }

    return true;
  }
}
