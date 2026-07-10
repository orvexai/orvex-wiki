// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@docmost/db/types/kysely.types';
import { PageVerificationRepo } from './page-verification.repo';
import {
  CreateVerificationDto,
  UpdateVerificationDto,
} from './dto/page-verification.dto';

export type VerificationType = 'expiring' | 'qms';
export type ExpirationMode = 'period' | 'fixed' | 'indefinite';
export type PeriodUnit = 'day' | 'week' | 'month' | 'year';
export type VerificationStatus =
  | 'verified'
  | 'expiring'
  | 'expired'
  | 'draft'
  | 'in_approval'
  | 'approved'
  | 'obsolete'
  | 'none';

export interface IPageVerificationInfo {
  id?: string;
  pageId?: string;
  type?: VerificationType;
  mode?: ExpirationMode | null;
  periodAmount?: number | null;
  periodUnit?: PeriodUnit | null;
  status: VerificationStatus;
  verifiedAt?: Date | null;
  verifiedBy?: { id: string; name: string; avatarUrl: string | null } | null;
  expiresAt?: Date | null;
  requestedAt?: Date | null;
  requestedBy?: { id: string; name: string; avatarUrl: string | null } | null;
  rejectedAt?: Date | null;
  rejectedBy?: { id: string; name: string; avatarUrl: string | null } | null;
  rejectionComment?: string | null;
  verifiers?: Array<{ id: string; name: string; avatarUrl: string | null; email: string }>;
}

/**
 * ENG-1459 — the QMS page-verification domain service (engine-resident
 * half). Thin controller, real logic here (CS §3 "domain-in-handler"
 * guard). No scheduling/reconcile logic lives here (AC5) — that domain is
 * `workflows`; this service only stamps/reads state on request.
 */
@Injectable()
export class PageVerificationService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly verificationRepo: PageVerificationRepo,
  ) {}

  private computeExpiresAt(
    mode: ExpirationMode,
    periodAmount: number | undefined,
    periodUnit: PeriodUnit | undefined,
    fixedExpiresAt: string | undefined,
    from: Date,
  ): Date | null {
    if (mode === 'indefinite') {
      return null;
    }
    if (mode === 'fixed') {
      if (!fixedExpiresAt) {
        throw new BadRequestException(
          'fixedExpiresAt is required when mode is "fixed"',
        );
      }
      return new Date(fixedExpiresAt);
    }
    // mode === 'period'
    if (!periodAmount || !periodUnit) {
      throw new BadRequestException(
        'periodAmount and periodUnit are required when mode is "period"',
      );
    }
    const next = new Date(from);
    switch (periodUnit) {
      case 'day':
        next.setUTCDate(next.getUTCDate() + periodAmount);
        break;
      case 'week':
        next.setUTCDate(next.getUTCDate() + periodAmount * 7);
        break;
      case 'month':
        next.setUTCMonth(next.getUTCMonth() + periodAmount);
        break;
      case 'year':
        next.setUTCFullYear(next.getUTCFullYear() + periodAmount);
        break;
    }
    return next;
  }

  private toInfo(
    row:
      | (Awaited<ReturnType<PageVerificationRepo['findByPageId']>> & {})
      | undefined,
  ): IPageVerificationInfo {
    if (!row) {
      return { status: 'none' };
    }

    let status = (row.status as VerificationStatus) ?? 'none';
    // AC honesty (CS §11) — a verified page whose expiry has passed reads
    // as expired even before any background sweep runs; the badge must
    // never show "verified" for an expired page.
    if (
      (status === 'verified' || status === 'approved') &&
      row.expiresAt &&
      new Date(row.expiresAt).getTime() < Date.now()
    ) {
      status = 'expired';
    }

    return {
      id: row.id,
      pageId: row.pageId,
      type: row.type as VerificationType,
      mode: row.mode as ExpirationMode | null,
      periodAmount: row.periodAmount,
      periodUnit: row.periodUnit as PeriodUnit | null,
      status,
      verifiedAt: row.verifiedAt,
      expiresAt: row.expiresAt,
      requestedAt: row.requestedAt,
      rejectedAt: row.rejectedAt,
      rejectionComment: row.rejectionComment,
      verifiers: (row as any).verifiers ?? [],
    };
  }

  async getVerificationInfo(
    pageId: string,
    workspaceId: string,
  ): Promise<IPageVerificationInfo> {
    const row = await this.verificationRepo.findByPageId(pageId, workspaceId);
    return this.toInfo(row);
  }

  async createVerification(
    dto: CreateVerificationDto,
    userId: string,
    workspaceId: string,
    spaceId: string,
  ): Promise<IPageVerificationInfo> {
    const existing = await this.verificationRepo.findByPageId(
      dto.pageId,
      workspaceId,
    );
    if (existing) {
      throw new BadRequestException('Verification already exists for this page');
    }

    const type: VerificationType = dto.type ?? 'expiring';
    const mode: ExpirationMode = dto.mode ?? 'period';
    const now = new Date();

    const expiresAt =
      type === 'qms'
        ? null
        : this.computeExpiresAt(
            mode,
            dto.periodAmount,
            dto.periodUnit,
            dto.fixedExpiresAt,
            now,
          );

    const status: VerificationStatus = type === 'qms' ? 'draft' : 'verified';

    const created = await this.db.transaction().execute(async (trx) => {
      const inserted = await this.verificationRepo.insertVerification(
        {
          pageId: dto.pageId,
          workspaceId,
          spaceId,
          type,
          status,
          mode,
          periodAmount: dto.periodAmount ?? null,
          periodUnit: dto.periodUnit ?? null,
          verifiedAt: type === 'qms' ? null : now,
          verifiedById: type === 'qms' ? null : userId,
          expiresAt,
          creatorId: userId,
        },
        trx,
      );

      if (dto.verifierIds?.length) {
        await this.verificationRepo.replaceVerifiers(
          inserted.id,
          dto.verifierIds,
          userId,
          trx,
        );
      }

      return inserted;
    });

    return this.getVerificationInfo(created.pageId, workspaceId);
  }

  async updateVerification(
    dto: UpdateVerificationDto,
    userId: string,
    workspaceId: string,
  ): Promise<IPageVerificationInfo> {
    const existing = await this.verificationRepo.findByPageId(
      dto.pageId,
      workspaceId,
    );
    if (!existing) {
      throw new NotFoundException('Verification not found for this page');
    }

    const mode: ExpirationMode = dto.mode ?? (existing.mode as ExpirationMode) ?? 'period';
    const expiresAt =
      existing.type === 'qms'
        ? existing.expiresAt
        : this.computeExpiresAt(
            mode,
            dto.periodAmount ?? existing.periodAmount ?? undefined,
            dto.periodUnit ?? (existing.periodUnit as PeriodUnit) ?? undefined,
            dto.fixedExpiresAt,
            existing.verifiedAt ? new Date(existing.verifiedAt) : new Date(),
          );

    await this.db.transaction().execute(async (trx) => {
      await this.verificationRepo.updateVerification(
        existing.id,
        workspaceId,
        {
          mode,
          periodAmount: dto.periodAmount ?? existing.periodAmount,
          periodUnit: dto.periodUnit ?? existing.periodUnit,
          expiresAt,
        },
        trx,
      );

      if (dto.verifierIds) {
        await this.verificationRepo.replaceVerifiers(
          existing.id,
          dto.verifierIds,
          userId,
          trx,
        );
      }
    });

    return this.getVerificationInfo(dto.pageId, workspaceId);
  }

  async removeVerification(pageId: string, workspaceId: string): Promise<void> {
    await this.verificationRepo.deleteByPageId(pageId, workspaceId);
  }

  async verifyPage(
    pageId: string,
    userId: string,
    workspaceId: string,
  ): Promise<IPageVerificationInfo> {
    const existing = await this.verificationRepo.findByPageId(pageId, workspaceId);
    if (!existing) {
      throw new NotFoundException('Verification not found for this page');
    }

    const now = new Date();
    const mode = (existing.mode as ExpirationMode) ?? 'period';
    const expiresAt = this.computeExpiresAt(
      mode,
      existing.periodAmount ?? undefined,
      existing.periodUnit as PeriodUnit | undefined,
      undefined,
      now,
    );

    const nextStatus: VerificationStatus =
      existing.type === 'qms' ? 'approved' : 'verified';

    await this.verificationRepo.updateVerification(existing.id, workspaceId, {
      status: nextStatus,
      verifiedAt: now,
      verifiedById: userId,
      expiresAt: existing.type === 'qms' ? existing.expiresAt : expiresAt,
    });

    return this.getVerificationInfo(pageId, workspaceId);
  }

  async submitForApproval(
    pageId: string,
    userId: string,
    workspaceId: string,
  ): Promise<IPageVerificationInfo> {
    const existing = await this.verificationRepo.findByPageId(pageId, workspaceId);
    if (!existing) {
      throw new NotFoundException('Verification not found for this page');
    }
    if (existing.type !== 'qms') {
      throw new BadRequestException(
        'Only "qms" verifications support the approval workflow',
      );
    }

    await this.verificationRepo.updateVerification(existing.id, workspaceId, {
      status: 'in_approval',
      requestedAt: new Date(),
      requestedById: userId,
    });

    return this.getVerificationInfo(pageId, workspaceId);
  }

  async rejectApproval(
    pageId: string,
    comment: string | undefined,
    userId: string,
    workspaceId: string,
  ): Promise<IPageVerificationInfo> {
    const existing = await this.verificationRepo.findByPageId(pageId, workspaceId);
    if (!existing) {
      throw new NotFoundException('Verification not found for this page');
    }
    if (existing.type !== 'qms') {
      throw new BadRequestException(
        'Only "qms" verifications support the approval workflow',
      );
    }

    await this.verificationRepo.updateVerification(existing.id, workspaceId, {
      status: 'draft',
      rejectedAt: new Date(),
      rejectedById: userId,
      rejectionComment: comment ?? null,
    });

    return this.getVerificationInfo(pageId, workspaceId);
  }

  async markObsolete(
    pageId: string,
    workspaceId: string,
  ): Promise<IPageVerificationInfo> {
    const existing = await this.verificationRepo.findByPageId(pageId, workspaceId);
    if (!existing) {
      throw new NotFoundException('Verification not found for this page');
    }

    await this.verificationRepo.updateVerification(existing.id, workspaceId, {
      status: 'obsolete',
    });

    return this.getVerificationInfo(pageId, workspaceId);
  }
}
