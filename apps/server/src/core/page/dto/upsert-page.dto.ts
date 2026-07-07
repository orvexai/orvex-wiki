import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ContentFormat } from './create-page.dto';
import { ContentOperation } from './update-page.dto';

/**
 * ENG-1471 — the idempotent-write DTO consumed by `POST /pages/upsert`.
 *
 * Resolution is three-tier (in this order): `slugId` -> `externalId` ->
 * `(spaceId, parentPageId, title)`. A create requires `spaceId`.
 */
export class UpsertPageDto {
  @IsOptional()
  @IsString()
  slugId?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsUUID()
  spaceId?: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  content?: string | object;

  @ValidateIf((o) => o.content !== undefined)
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['append', 'prepend', 'replace'])
  operation?: ContentOperation;

  @ValidateIf((o) => o.content !== undefined)
  @Transform(({ value }) => value?.toLowerCase() ?? 'json')
  @IsIn(['json', 'markdown', 'html'])
  format?: ContentFormat;

  // CAS guard on the update branch (E-S1) — a stale version is rejected 409.
  @IsOptional()
  @IsInt()
  @Min(1)
  ifVersion?: number;
}
