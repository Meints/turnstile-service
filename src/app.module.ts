import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TurnstileModule } from './modules/turnstile/turnstile.module';
import { env } from './config/env';

@Module({
  imports: [
    MongooseModule.forRoot(
      env.MONGODB_URI || 'mongodb://localhost:27017/turnstile-service',
    ),
    TurnstileModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
