// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsIn, IsString, IsNotEmpty } from 'class-validator';
import { TransclusionOperation } from '../transclusion-safeguard.types';

const OPERATIONS: TransclusionOperation[] = [
  'delete',
  'permanent-delete',
  'archive',
  'supersede',
];

export class TransclusionImpactRequestDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;

  @IsIn(OPERATIONS)
  operation: TransclusionOperation;
}
