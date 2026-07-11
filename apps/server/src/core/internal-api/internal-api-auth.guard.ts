// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';
import {
  INTERNAL_API_AUTH_CONFIG,
  InternalApiAuthConfig,
  isInternalApiRequestAuthorized,
} from './internal-api-auth';

/**
 * InternalApiAuthGuard (ENG-1957, AC1/AC5) — the single choke point every
 * `/internal/*` route resolves auth through, BEFORE any ACL/export/resolve
 * logic runs. Fail-closed: denies when the shared bearer token is unset or
 * the caller's `Authorization` header does not match it.
 */
@Injectable()
export class InternalApiAuthGuard implements CanActivate {
  constructor(
    @Inject(INTERNAL_API_AUTH_CONFIG)
    private readonly authConfig: InternalApiAuthConfig,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<FastifyRequest>();
    if (
      !isInternalApiRequestAuthorized(
        this.authConfig,
        req.headers.authorization,
      )
    ) {
      throw new UnauthorizedException();
    }
    return true;
  }
}
