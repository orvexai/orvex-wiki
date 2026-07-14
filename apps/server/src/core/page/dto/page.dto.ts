import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { Transform } from 'class-transformer';

import { ContentFormat } from './create-page.dto';

export class PageIdDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class SpaceIdDto {
  @IsUUID()
  spaceId: string;
}

export class PageHistoryIdDto {
  @IsUUID()
  historyId: string;
}

// ENG-1369: pageId is required (not just derived from the history row) so
// the controller/service can guard against a historyId that belongs to a
// DIFFERENT page/workspace (AC4 — INVALID_PAGE_HISTORY_REF).
export class RestorePageFromHistoryDto extends PageHistoryIdDto {
  @IsString()
  @IsNotEmpty()
  pageId: string;
}

export class PageInfoDto extends PageIdDto {
  @IsOptional()
  @IsBoolean()
  includeSpace: boolean;

  @IsOptional()
  @IsBoolean()
  includeContent: boolean;

  @IsOptional()
  @Transform(({ value }) => value?.toLowerCase())
  @IsIn(['json', 'markdown', 'html'])
  format?: ContentFormat;
}

export class DeletePageDto extends PageIdDto {
  @IsOptional()
  @IsBoolean()
  permanentlyDelete?: boolean;
}
