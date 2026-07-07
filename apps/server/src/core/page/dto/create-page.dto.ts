import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';
import { Transform } from 'class-transformer';

// ENG-1397 AC6 — 'dfm' is a valid TS-level format (the DfM→ProseMirror
// resolution happens upstream, in the `dfm-contracts-ts-serializer` leg,
// blocked-by); it is intentionally NOT in the `@IsIn` validators below, so
// it can never be submitted over the public HTTP API yet. Reaching the
// `parseProsemirrorContent` chokepoint with `format: 'dfm'` un-resolved is a
// server-bug guard (`DFM_NOT_PRE_RESOLVED`), not a client-facing option.
export type ContentFormat = 'json' | 'markdown' | 'html' | 'dfm';

export class CreatePageDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  icon?: string;

  @IsOptional()
  @IsString()
  parentPageId?: string;

  @IsUUID()
  spaceId: string;

  @IsOptional()
  content?: string | object;

  @ValidateIf((o) => o.content !== undefined)
  @Transform(({ value }) => value?.toLowerCase() ?? 'json')
  @IsIn(['json', 'markdown', 'html'])
  format?: ContentFormat;
}
