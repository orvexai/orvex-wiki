// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import { WorkspaceCellAssertionService } from './workspace-cell-assertion.service';

/**
 * Nest excludes the unprefixed share SEO route from DomainMiddleware. This
 * global interceptor is still inside Nest's route lifecycle and applies the
 * shared assertion before that controller reads public tenant data.
 */
@Injectable()
export class ShareSeoCellInterceptor implements NestInterceptor {
  constructor(
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly environmentService: EnvironmentService,
    private readonly cellAssertion: WorkspaceCellAssertionService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler) {
    if (context.getType() !== 'http') {
      return next.handle();
    }
    const request = context.switchToHttp().getRequest();
    const pathname = (request.raw?.url ?? request.url ?? '').split('?')[0];
    if (!pathname.startsWith('/share/')) {
      return next.handle();
    }

    const workspace = this.environmentService.isSelfHosted()
      ? await this.workspaceRepo.findFirst()
      : await this.workspaceRepo.findByHostname(
          request.raw?.headers?.host?.split('.')[0],
        );
    if (workspace) {
      this.cellAssertion.assertWorkspace(
        workspace,
        workspace.id,
        'public share SEO request',
      );
    }
    return next.handle();
  }
}
