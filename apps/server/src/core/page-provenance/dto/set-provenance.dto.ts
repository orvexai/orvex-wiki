import { IsUUID } from 'class-validator';

export class SetProvenanceDto {
  @IsUUID()
  pageId: string;
}
