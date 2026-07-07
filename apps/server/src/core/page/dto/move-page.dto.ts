import {
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  IsNotEmpty,
} from 'class-validator';

export class MovePageDto {
  @IsString()
  pageId: string;

  // ENG-1372: position may be a concrete fractional-index key OR a keyword
  // form ("child", "before:<id>", "after:<id>") resolved by
  // PageService.resolvePositionKey — the max length must accommodate
  // "before:"/"after:" + a UUID.
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  position: string;

  @IsOptional()
  @IsString()
  parentPageId?: string | null;
}

export class MovePageToSpaceDto {
  @IsNotEmpty()
  @IsString()
  pageId: string;

  @IsNotEmpty()
  @IsString()
  spaceId: string;
}
