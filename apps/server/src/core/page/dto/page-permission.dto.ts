import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { PagePermissionRole } from '../../../common/helpers/types/permission';

export class PageIdOnlyDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

/**
 * Shared principal shape for every permission-mutating endpoint: exactly one
 * of userId / groupId must be present (never both, never neither).
 */
export class PagePermissionPrincipalDto extends PageIdOnlyDto {
  @ValidateIf((o) => !o.groupId)
  @IsUUID()
  userId?: string;

  @ValidateIf((o) => !o.userId)
  @IsUUID()
  groupId?: string;
}

export class AddPagePermissionDto extends PagePermissionPrincipalDto {
  @IsIn([PagePermissionRole.READER, PagePermissionRole.WRITER])
  role: string;
}

export class UpdatePagePermissionRoleDto extends PagePermissionPrincipalDto {
  @IsIn([PagePermissionRole.READER, PagePermissionRole.WRITER])
  role: string;
}

export class RemovePagePermissionDto extends PagePermissionPrincipalDto {}

export class PagePermissionsListDto extends PageIdOnlyDto {
  @IsOptional()
  @IsString()
  cursor?: string;

  @IsOptional()
  @IsString()
  query?: string;
}
