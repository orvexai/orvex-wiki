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
 * OrvexNativeLoginGuard — ENG-1490 (native-login removal leg).
 *
 * Fail-closed gate on the engine's native Docmost email/password
 * login/registration/reset routes. Fires ONLY when BOTH:
 *
 *   1. the orvex module tree is active (`ORVEX_MODULES_ENABLED==='true'`,
 *      the exact same literal check {@link OrvexRootModule.register} uses —
 *      CS §3 one-adapter rule: a single source of truth for the flag), AND
 *   2. the resolved workspace enforces SSO (`workspace.enforceSso===true`).
 *
 * Any other combination (vanilla/flag-off — AC5; flag-on but SSO not
 * enforced — AC6; workspace not yet resolvable) passes through unchanged,
 * so native login continues to work byte-for-byte in every mode this
 * ticket does not target. When it does fire, it throws BEFORE any
 * credential/DB/mailer work — AC1/AC2/AC3 (zero password-hash bytes, zero
 * DB row, zero mailer call, because the guarded handler body never runs).
 *
 * Deep module (CS §3.1): deleting this guard silently re-opens the native
 * password backdoor under enforced SSO — it is not a pass-through. No
 * constructor collaborators to mock (CS §5): the only inputs are the
 * process-level module flag and the request's own resolved workspace.
 */
@Injectable()
export class OrvexNativeLoginGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    if (process.env.ORVEX_MODULES_ENABLED !== 'true') {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const workspace = request?.raw?.workspace ?? request?.user?.workspace;
    const enforceSso = workspace?.enforceSso === true;

    if (!enforceSso) {
      return true;
    }

    throw new ForbiddenException({
      success: false,
      message:
        'SSO enforced: native login disabled for this workspace.',
    });
  }
}
