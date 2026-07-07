import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { PagePermissionRole } from '../../../common/helpers/types/permission';

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
