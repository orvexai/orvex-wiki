// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import 'reflect-metadata';
import { IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageStatus } from '@orvex/extensions';

const RESTORABLE_STATUSES = Object.values(PageStatus).filter(
  (status) => status !== PageStatus.SUPERSEDED,
);

/** ENG-1434 — `POST /api/orvex/pages/unsupersede` body. */
export class UnsupersedePageDto {
  @IsUUID()
  pageId: string;

  @IsOptional()
  @IsIn(RESTORABLE_STATUSES)
  restoredStatus?: PageStatus;
}
