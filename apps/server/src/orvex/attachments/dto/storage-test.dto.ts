// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) Orvex, Inc. — part of the orvex-wiki AGPL engine (CS §13).
// See the LICENSE file at the repository root for the full license text.

import { IsBoolean, IsOptional, IsString } from 'class-validator';

/**
 * Probe params for `POST /api/integrations/storage/test`. These are
 * admin-supplied candidate credentials for a driver an admin is considering
 * switching TO — they are used to construct a transient, per-request S3
 * client for a single HeadBucket probe and are never persisted (CS §4f/❌8).
 */
export class StorageTestDto {
  @IsString()
  accessKeyId: string;

  @IsString()
  secretAccessKey: string;

  @IsString()
  region: string;

  @IsString()
  bucket: string;

  @IsOptional()
  @IsString()
  endpoint?: string;

  @IsOptional()
  @IsBoolean()
  forcePathStyle?: boolean;
}
