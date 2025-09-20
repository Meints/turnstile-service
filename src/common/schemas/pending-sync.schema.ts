import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PendingSyncDocument = PendingSync & Document;

@Schema({ timestamps: true })
export class PendingSync {
  @Prop({ required: true })
  jti: string; // JWT ID

  @Prop({ required: true })
  gate: string; // ID do portão/catraca

  @Prop({ required: true })
  userId: string; // ID do usuário

  @Prop({ required: true })
  accessType: 'granted' | 'denied'; // Tipo de acesso

  @Prop({ required: true })
  timestamp: Date; // Timestamp do acesso

  @Prop()
  reason?: string; // Motivo da negação (se aplicável)

  @Prop({ type: Object })
  jwtPayload: any; // Payload completo do JWT

  @Prop({ default: 0 })
  retryCount: number; // Número de tentativas de sincronização

  @Prop({ default: Date.now })
  lastRetryAt: Date; // Última tentativa de sincronização

  @Prop({ default: 'pending' })
  status: 'pending' | 'processing' | 'failed' | 'completed'; // Status da sincronização

  @Prop()
  errorMessage?: string; // Mensagem de erro da última tentativa
}

export const PendingSyncSchema = SchemaFactory.createForClass(PendingSync);

// Índices para performance
PendingSyncSchema.index({ status: 1, lastRetryAt: 1 });
PendingSyncSchema.index({ jti: 1 });
PendingSyncSchema.index({ gate: 1, timestamp: -1 });
