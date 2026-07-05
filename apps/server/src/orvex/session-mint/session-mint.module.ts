import { Module } from '@nestjs/common';
import { SessionMintService } from './session-mint.service';

@Module({
  providers: [SessionMintService],
  exports: [SessionMintService],
})
export class SessionMintModule {}
