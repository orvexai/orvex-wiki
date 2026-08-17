// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { HttpException, Injectable, Logger } from '@nestjs/common';
import { WorkspaceRepo } from '@docmost/db/repos/workspace/workspace.repo';
import { EnvironmentService } from '../../integrations/environment/environment.service';
import {
  CELL_SOLO,
  OrvexConfigService,
} from '../../orvex/config/orvex-config.service';

export type WorkspaceCellMismatchReason =
  | 'WORKSPACE_CELL_MISMATCH'
  | 'WORKSPACE_CELL_ABSENT'
  | 'WORKSPACE_RECORD_ABSENT'
  | 'DEPLOYMENT_CELL_ABSENT';

/** Internal diagnostics. Tenant identifiers stay in logs, never on the wire. */
export interface WorkspaceCellMismatch {
  reason: WorkspaceCellMismatchReason;
  workspaceCellId: string;
  podCellId: string;
}

/** The chassis `contracts.Error` wire envelope for the frozen 421 code. */
export interface CellMismatchEnvelope {
  errorCode: 'CELL_MISMATCH';
  message: string;
  details: {
    cell?: string;
    reResolve: { action: 'rediscover' };
  };
}

function mismatchMessage(reason: WorkspaceCellMismatchReason): string {
  switch (reason) {
    case 'DEPLOYMENT_CELL_ABSENT':
      return 'This deployment cannot confirm its cell; re-discover.';
    case 'WORKSPACE_CELL_ABSENT':
    case 'WORKSPACE_RECORD_ABSENT':
      return 'This host cannot confirm that the requested workspace belongs to its cell; re-discover.';
    default:
      return 'This host does not serve the requested workspace; re-discover.';
  }
}

export function cellMismatchEnvelope(
  mismatch: WorkspaceCellMismatch,
): CellMismatchEnvelope {
  const cell =
    mismatch.podCellId !== '' && mismatch.podCellId !== CELL_SOLO
      ? { cell: mismatch.podCellId }
      : {};
  return {
    errorCode: 'CELL_MISMATCH',
    message: mismatchMessage(mismatch.reason),
    details: {
      ...cell,
      reResolve: { action: 'rediscover' },
    },
  };
}

export class WorkspaceCellMismatchException extends HttpException {
  constructor(readonly mismatch: WorkspaceCellMismatch) {
    super(cellMismatchEnvelope(mismatch), 421);
  }
}

@Injectable()
export class WorkspaceCellAssertionService {
  private readonly logger = new Logger(WorkspaceCellAssertionService.name);

  constructor(
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly environmentService: EnvironmentService,
    private readonly orvexConfigService: OrvexConfigService,
  ) {}

  /**
   * Self-hosted deployments are intentionally cell-agnostic. Every CLOUD
   * deployment is a fleet deployment, so a missing or `solo` CELL_ID is an
   * invalid deployment state that fails closed instead of disabling the gate.
   */
  enforcementActive(): boolean {
    return this.environmentService.isCloud();
  }

  assertWorkspace(
    workspace: { cellId?: string | null },
    workspaceId: string,
    surface: string,
  ): void {
    const mismatch = this.evaluateWorkspace(workspace);
    if (mismatch) {
      this.reject(mismatch, workspaceId, surface);
    }
  }

  async assertWorkspaceId(
    workspaceId: string,
    surface: string,
    options: { allowMissingWorkspace?: boolean } = {},
  ): Promise<void> {
    if (!this.enforcementActive()) {
      return;
    }

    const deploymentMismatch = this.evaluateDeploymentCell();
    if (deploymentMismatch) {
      this.reject(deploymentMismatch, workspaceId, surface);
    }

    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      if (options.allowMissingWorkspace) {
        return;
      }
      this.reject(
        {
          reason: 'WORKSPACE_RECORD_ABSENT',
          workspaceCellId: '',
          podCellId: this.orvexConfigService.cellId ?? '',
        },
        workspaceId,
        surface,
      );
    }

    this.assertWorkspace(workspace, workspaceId, surface);
  }

  private evaluateWorkspace(workspace: {
    cellId?: string | null;
  }): WorkspaceCellMismatch | null {
    if (!this.enforcementActive()) {
      return null;
    }

    const deploymentMismatch = this.evaluateDeploymentCell();
    if (deploymentMismatch) {
      return deploymentMismatch;
    }

    const podCellId = this.orvexConfigService.cellId as string;
    const workspaceCellId = workspace.cellId;
    if (workspaceCellId === podCellId) {
      return null;
    }
    if (
      workspaceCellId === undefined ||
      workspaceCellId === null ||
      workspaceCellId.trim() === ''
    ) {
      return {
        reason: 'WORKSPACE_CELL_ABSENT',
        workspaceCellId: workspaceCellId ?? '',
        podCellId,
      };
    }
    return {
      reason: 'WORKSPACE_CELL_MISMATCH',
      workspaceCellId,
      podCellId,
    };
  }

  private evaluateDeploymentCell(): WorkspaceCellMismatch | null {
    const podCellId = this.orvexConfigService.cellId;
    if (podCellId !== null && podCellId !== CELL_SOLO) {
      return null;
    }
    return {
      reason: 'DEPLOYMENT_CELL_ABSENT',
      workspaceCellId: '',
      podCellId: podCellId ?? '',
    };
  }

  private reject(
    mismatch: WorkspaceCellMismatch,
    workspaceId: string,
    surface: string,
  ): never {
    this.logger.warn(
      `cell assertion rejected ${surface}: reason=${mismatch.reason} workspaceId=${workspaceId} workspaceCellId=${mismatch.workspaceCellId} podCellId=${mismatch.podCellId}`,
    );
    throw new WorkspaceCellMismatchException(mismatch);
  }
}
