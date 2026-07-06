import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * A-MOVE manifest sub-shapes. Field naming mirrors
 * `../orvex-studio-contracts/schemas/org-move-manifest.schema.json` field-for-field
 * (hence snake_case), so the typed contract is day-1 and non-retrofittable even
 * though the tenant-move step bodies are all 501 today.
 */

/** `#/components/schemas/TenantMoveStore`. */
export class TenantMoveStoreDto {
  @IsString()
  name!: string;

  @IsIn(['postgres', 'redis', 'kafka', 's3', 'external'])
  kind!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  row_estimate?: number;
}

/** `#/components/schemas/TenantMoveS3Prefix`. */
export class TenantMoveS3PrefixDto {
  @IsString()
  bucket!: string;

  @IsString()
  prefix!: string;
}

/** `#/components/schemas/TenantMoveCursor`. */
export class TenantMoveCursorDto {
  @IsString()
  source!: string;

  @IsString()
  position!: string;
}

/**
 * The versioned tenant-move manifest — `#/components/schemas/TenantMoveManifest`.
 * Only the five contract fields (schema_version, tenant_id, stores, s3_prefixes,
 * cursors). The `stores[]` coverage-check against the engine's declared datastore
 * inventory is TBD-at-delivery (OPEN decision, cell-contract rule #10).
 */
export class TenantMoveManifestDto {
  @IsInt()
  @Min(1)
  schema_version!: number;

  @IsUUID()
  tenant_id!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TenantMoveStoreDto)
  stores!: TenantMoveStoreDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TenantMoveS3PrefixDto)
  s3_prefixes!: TenantMoveS3PrefixDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TenantMoveCursorDto)
  cursors!: TenantMoveCursorDto[];
}
