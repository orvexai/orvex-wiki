// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import 'reflect-metadata';
import { IsBoolean, IsOptional } from 'class-validator';

/** ENG-1445 AC5 — `POST /api/orvex/settings/ratify-gate` body. */
export class UpdateRatifyGateDto {
  @IsBoolean()
  required: boolean;
}

/** ENG-1445 AC6 — the opt-in, audited forced-self-ratify override. */
export class ForceSelfRatifyDto {
  @IsOptional()
  @IsBoolean()
  forceSelfRatify?: boolean;

  @IsOptional()
  forceReason?: string;
}
