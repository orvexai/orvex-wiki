// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import {
  ArrayMaxSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';
import { PageIdDto } from './page.dto';

const VERIFICATION_TYPES = ['expiring', 'qms'] as const;
const EXPIRATION_MODES = ['period', 'fixed', 'indefinite'] as const;
const PERIOD_UNITS = ['day', 'week', 'month', 'year'] as const;

export class CreateVerificationDto extends PageIdDto {
  @IsOptional()
  @IsIn(VERIFICATION_TYPES)
  type?: (typeof VERIFICATION_TYPES)[number];

  @IsOptional()
  @IsIn(EXPIRATION_MODES)
  mode?: (typeof EXPIRATION_MODES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  periodAmount?: number;

  @IsOptional()
  @IsIn(PERIOD_UNITS)
  periodUnit?: (typeof PERIOD_UNITS)[number];

  @IsOptional()
  @IsDateString()
  fixedExpiresAt?: string;

  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  verifierIds: string[];
}

export class UpdateVerificationDto extends PageIdDto {
  @IsOptional()
  @IsIn(EXPIRATION_MODES)
  mode?: (typeof EXPIRATION_MODES)[number];

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  periodAmount?: number;

  @IsOptional()
  @IsIn(PERIOD_UNITS)
  periodUnit?: (typeof PERIOD_UNITS)[number];

  @IsOptional()
  @IsDateString()
  fixedExpiresAt?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsUUID(undefined, { each: true })
  verifierIds?: string[];
}

export class RejectApprovalDto extends PageIdDto {
  @IsOptional()
  @IsString()
  comment?: string;
}
