import { Module } from '@nestjs/common';
import { PageMetaService } from './page-meta.service';

@Module({
  providers: [PageMetaService],
  exports: [PageMetaService],
})
export class PageMetaModule {}
