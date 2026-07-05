import { Module } from '@nestjs/common';
import { CellEnvelopeBuilder } from './cell-envelope';

@Module({
  providers: [CellEnvelopeBuilder],
  exports: [CellEnvelopeBuilder],
})
export class CellModule {}
