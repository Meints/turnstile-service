import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TurnstileController } from './turnstile.controller';
import { TurnstileService } from './turnstile.service';
import { SyncService } from './sync.service';
import { TurnstileConfigService } from './turnstile-config.service';
import {
  AccessLog,
  AccessLogSchema,
} from 'src/common/schemas/access-log.schema';
import {
  PendingSync,
  PendingSyncSchema,
} from 'src/common/schemas/pending-sync.schema';
import {
  TurnstileConfig,
  TurnstileConfigSchema,
} from 'src/common/schemas/turnstile-config.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: PendingSync.name, schema: PendingSyncSchema },
      { name: TurnstileConfig.name, schema: TurnstileConfigSchema },
    ]),
  ],
  controllers: [TurnstileController],
  providers: [TurnstileService, SyncService, TurnstileConfigService],
  exports: [TurnstileService, SyncService, TurnstileConfigService],
})
export class TurnstileModule {}
