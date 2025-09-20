import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type QrCacheDocument = QrCache & Document;

@Schema({ timestamps: true })
export class QrCache {
  @Prop({ required: true, unique: true })
  jti: string;

  @Prop({ required: true })
  visitId: string;

  @Prop({ required: true })
  visitName: string;

  @Prop({ required: true })
  allowedBuilding: string;

  @Prop({ required: true })
  windowStart: Date;

  @Prop({ required: true })
  windowEnd: Date;

  @Prop({ required: true, default: 1 })
  maxUses: number;

  @Prop({ required: true, default: 0 })
  usedCount: number;

  @Prop({ required: true, enum: ['PENDING', 'ACTIVE', 'EXPIRED', 'REVOKED'], default: 'PENDING' })
  status: string;

  @Prop({ default: Date.now })
  lastSyncAt: Date;
}

export const QrCacheSchema = SchemaFactory.createForClass(QrCache);