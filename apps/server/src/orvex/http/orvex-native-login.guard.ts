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
 * login/registration/reset routes. Fires whenever the orvex module tree is
 * active (`ORVEX_MODULES_ENABLED==='true'`, the exact same literal check
 * {@link OrvexRootModule.register} uses — CS §3 one-adapter rule: a single
 * source of truth for the flag). Under the fold-in, identity owns
 * authentication end-to-end (`POST /api/orvex/session/exchange` is the sole
 * session-establishment entry), so native password login is removed in EVERY
 * flag-on mode — the former `workspace.enforceSso` condition (which left
 * native login reachable for any workspace that had not explicitly turned
 * SSO enforcement on, the default state for a fresh workspace) is gone.
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
