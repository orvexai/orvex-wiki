// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

import { IntrospectedPrincipal } from '../../core/session-mint/identity-introspector';
import { OrvexTenantCellMoveService } from './orvex-tenant-cell-move.service';

export type TenantMoveRequest = FastifyRequest & {
  tenantMovePrincipal?: IntrospectedPrincipal;
};

/** One machine-principal gate for every tenant-move operation. */
@Injectable()
export class TenantMoveMachinePrincipalGuard implements CanActivate {
  constructor(private readonly cellMoveService: OrvexTenantCellMoveService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<TenantMoveRequest>();
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;
    const match = header && /^Bearer\s+(.+)$/i.exec(header.trim());
    const bearer = match?.[1].trim();
    if (!bearer) {
      throw new UnauthorizedException('bearer token required');
    }

    request.tenantMovePrincipal =
      await this.cellMoveService.assertMachinePrincipal(bearer);
    return true;
  }
}
