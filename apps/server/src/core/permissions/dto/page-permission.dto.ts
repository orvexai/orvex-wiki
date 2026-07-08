import { IsEnum, IsString } from 'class-validator';
import { PagePermissionRole } from '../../../common/helpers/types/permission';
import { PaginationOptions } from '@docmost/db/pagination/pagination-options';
import { ExactlyOnePrincipal } from '../../../common/validators/exactly-one-principal.validator';

export class RestrictPageDto {
  @IsString()
  pageId: string;
}

export class RemoveRestrictionDto {
  @IsString()
  pageId: string;
}

/**
 * Principal contract (ENG-1373/ENG-1596 DoD 4d): a permission grant targets
 * EXACTLY ONE principal — a single `userId` XOR a single `groupId`, never
 * both and never neither. This is the decided, singular-principal shape the
 * ENG-1375 client is repointed to (commit 71688b9e). Enforced here via
 * `@ExactlyOnePrincipal` (400 from the global ValidationPipe) with
 * `PagePermissionController.assertSinglePrincipal` kept as defense-in-depth.
 */
export class AddPagePermissionDto {
  @IsString()
  pageId: string;

  @ExactlyOnePrincipal()
  userId?: string;

  @ExactlyOnePrincipal()
  groupId?: string;

  @IsEnum(PagePermissionRole)
  role: PagePermissionRole;
}

/** Principal contract: see `AddPagePermissionDto` header. */
export class RemovePagePermissionDto {
  @IsString()
  pageId: string;

  @ExactlyOnePrincipal()
  userId?: string;

  @ExactlyOnePrincipal()
  groupId?: string;
}

/** Principal contract: see `AddPagePermissionDto` header. */
export class UpdatePagePermissionDto {
  @IsString()
  pageId: string;

  @ExactlyOnePrincipal()
  userId?: string;

  @ExactlyOnePrincipal()
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
