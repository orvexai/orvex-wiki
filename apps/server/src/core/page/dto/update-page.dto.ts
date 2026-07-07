import { PartialType } from '@nestjs/mapped-types';
import { CreatePageDto, ContentFormat } from './create-page.dto';
import { IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Transform } from 'class-transformer';

export type ContentOperation = 'append' | 'prepend' | 'replace';

export class UpdatePageDto extends PartialType(CreatePageDto) {
  @IsString()
  pageId: string;

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

  // ENG-1413 — CAS guard on `POST /pages/update`. Accepts either an integer
  // (the atomic primitive, AC1) or a legacy ISO-8601 timestamp (AC2,
  // backward compat) — validated/interpreted by `if-version.util`, not
  // here (class-validator can't cleanly express the "one of two shapes"
  // union).
  @IsOptional()
  ifVersion?: number | string;

  // ENG-1413 (AC3) — body fallback for the idempotency key; the
  // `idempotency-key` HEADER takes precedence when both are supplied (see
  // `PageController.update`).
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
