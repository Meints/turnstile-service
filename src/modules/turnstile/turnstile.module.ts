import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TurnstileController } from './turnstile.controller';
import { TurnstileService } from './turnstile.service';
import { SyncService } from './sync.service';
import { TurnstileConfigService } from './turnstile-config.service';
import { TurnstileCrudController } from './turnstile-crud.controller';
import { TurnstileCrudService } from './turnstile-crud.service';
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
import {
  Turnstile,
  TurnstileSchema,
} from 'src/common/schemas/turnstile.schema';
import {
  QrCache,
  QrCacheSchema,
} from 'src/common/schemas/qr-cache.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: AccessLog.name, schema: AccessLogSchema },
      { name: PendingSync.name, schema: PendingSyncSchema },
      { name: TurnstileConfig.name, schema: TurnstileConfigSchema },
      { name: Turnstile.name, schema: TurnstileSchema },
      { name: QrCache.name, schema: QrCacheSchema },
    ]),
  ],
  controllers: [TurnstileController, TurnstileCrudController],
  providers: [TurnstileService, SyncService, TurnstileConfigService, TurnstileCrudService],
  exports: [TurnstileService, SyncService, TurnstileConfigService, TurnstileCrudService],
})
export class TurnstileModule {}
