// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import 'reflect-metadata';
import { IsIn, IsOptional, IsString, IsUUID } from 'class-validator';
import { PageStatus } from '@orvex/extensions';

/**
 * ENG-1434 AC9 — `POST /api/orvex/pages/status` body. `superseded` is
 * deliberately EXCLUDED from the allowed set: that transition belongs
 * exclusively to `/supersede`/`/unsupersede` (the atomic, paired-page
 * mutation) — a bare status write can never fabricate a one-sided
 * "superseded" page with no canonical counterpart. `@IsIn` rejects it at
 * the DTO validation layer (400), before the request ever reaches the
 * service (AC9's literal "DTO validation error on status" assertion).
 */
const SETTABLE_STATUSES = Object.values(PageStatus).filter(
  (status) => status !== PageStatus.SUPERSEDED,
);

export class StatusPageDto {
  @IsUUID()
  pageId: string;

  @IsIn(SETTABLE_STATUSES)
  status: Exclude<PageStatus, PageStatus.SUPERSEDED>;

  /** AC10 — required when `status === 'archived'`. */
  @IsOptional()
  @IsString()
  archiveReason?: string;
}
