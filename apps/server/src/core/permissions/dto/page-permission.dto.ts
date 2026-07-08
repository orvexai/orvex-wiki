import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PagePermissionRole } from '../../../common/helpers/types/permission';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';

export class RestrictPageDto {
  @IsString()
  pageId: string;
}

export class RemoveRestrictionDto {
  @IsString()
  pageId: string;
}

export class AddPagePermissionDto {
  @IsString()
  pageId: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsEnum(PagePermissionRole)
  role: PagePermissionRole;
}

export class RemovePagePermissionDto {
  @IsString()
  pageId: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;
}

export class UpdatePagePermissionDto {
  @IsString()
  pageId: string;

  @IsOptional()
  @IsUUID()
  userId?: string;

  @IsOptional()
  @IsUUID()
  groupId?: string;

  @IsEnum(PagePermissionRole)
  role: PagePermissionRole;
}

/**
 * ENG-1596 (AC1) — list-permissions read. Extends the shared pagination
 * DTO so limit/cursor/beforeCursor/query validation is not re-implemented.
 */
export class ListPagePermissionsDto extends PaginationOptions {
  @IsString()
  pageId: string;
}

/**
 * ENG-1596 (AC2-AC4, AC8) — restriction-info read.
 */
export class RestrictionInfoDto {
  @IsString()
  pageId: string;
}
