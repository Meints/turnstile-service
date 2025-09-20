import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TurnstileConfigDocument = TurnstileConfig & Document;

@Schema({ timestamps: true })
export class TurnstileConfig {
  @Prop({ required: true, unique: true, index: true })
  gate: string; // ID único do portão/catraca

  @Prop({ required: true })
  name: string; // Nome do portão

  @Prop({ default: true })
  isActive: boolean; // Se o portão está ativo

  @Prop({ default: 300 })
  jwtValidationTimeout: number; // Timeout para validação JWT (segundos)

  @Prop({ default: 5 })
  maxRetryAttempts: number; // Máximo de tentativas de sincronização

  @Prop({ default: 60000 })
  retryInterval: number; // Intervalo entre tentativas (ms)

  @Prop({ default: 24 })
  dataRetentionDays: number; // Dias para manter dados de acesso

  @Prop({ type: Object })
  allowedGates?: string[]; // Portões permitidos para este JWT

  @Prop()
  lastSyncAt?: Date; // Última sincronização bem-sucedida

  @Prop({ default: 0 })
  totalAccesses: number; // Total de acessos processados

  @Prop({ default: 0 })
  failedSyncs: number; // Total de falhas de sincronização
}

export const TurnstileConfigSchema =
  SchemaFactory.createForClass(TurnstileConfig);

// Índices
TurnstileConfigSchema.index({ isActive: 1 });
