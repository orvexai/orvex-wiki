import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [ExportService],
  controllers: [ExportController],
  // ENG-1957 — InternalApiModule composes ExportService for the
  // `/internal/pages/{id}/export` route; must be exported to be injectable
  // outside this module.
  exports: [ExportService],
})
export class ExportModule {}
