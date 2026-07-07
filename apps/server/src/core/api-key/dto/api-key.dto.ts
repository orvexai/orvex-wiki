import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

/**
 * ENG-1380 — clean-room AGPL api-key DTOs.
 *
 * Typed boundary crossings only (CS §12: no `any` type-laundering). None of
 * these ever carry `keyHash` — the CWE-200 guard (AC5) starts at the type
 * layer, not just the repo `select` list.
 */
export class CreateApiKeyDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateApiKeyDto {
  @IsUUID()
  apiKeyId: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  name?: string;
}

export class RevokeApiKeyDto {
  @IsUUID()
  apiKeyId: string;
}

export class AdminListApiKeyDto {
  @IsOptional()
  @IsUUID()
  creatorId?: string;
}

/** The exported, keyHash-free shape (AC5, CWE-200). */
export interface ApiKeyPublicView {
  id: string;
  name: string | null;
  creatorId: string;
  workspaceId: string;
  expiresAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

/** The one-time creation response — the ONLY place the raw token appears. */
export interface CreateApiKeyResponse {
  apiKey: ApiKeyPublicView;
  token: string;
}
