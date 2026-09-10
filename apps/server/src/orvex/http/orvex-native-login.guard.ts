// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

/**
 * OrvexNativeLoginGuard — ENG-1490 (native-login removal leg), tightened by
 * ENG-2499 (FR-W6 AC3: native login removed FULLY, no break-glass).
 *
 * Fail-closed gate on the engine's native Docmost email/password
 * login/registration/reset routes when those legacy routes are registered.
 * It fires whenever the orvex module tree is active
 * (`ORVEX_MODULES_ENABLED==='true'`, the exact same literal check
 * {@link OrvexRootModule.register} uses). The separate
 * `NATIVE_LOGIN_REMOVED` registration flag removes these routes entirely;
 * this guard preserves the existing flag-on/flag-off behavior while the
 * reversible removal rollout is held.
 *
 * Vanilla/flag-off deployments (standalone Docmost) pass through unchanged,
 * so native login continues to work byte-for-byte when the orvex module tree
 * is off. When the guard fires, it throws BEFORE any credential/DB/mailer
 * work — zero password-hash bytes, zero DB row, zero mailer call, because
 * the guarded handler body never runs.
 *
 * Deep module (CS §3.1): deleting this guard silently re-opens the native
 * password backdoor on the hosted platform — it is not a pass-through. No
 * constructor collaborators (CS §5): the only input is the process-level
 * module flag.
 */
@Injectable()
export class OrvexNativeLoginGuard implements CanActivate {
  canActivate(_context: ExecutionContext): boolean {
    if (process.env.ORVEX_MODULES_ENABLED !== 'true') {
      return true;
    }

    // ENG-2499 AC3 — unconditional under the fold-in: no enforceSso
    // condition, no workspace lookup, no break-glass in any mode.
    throw new ForbiddenException({
      success: false,
      message:
        'Native login disabled: this deployment authenticates via Orvex identity (SSO).',
    });
  }
}
