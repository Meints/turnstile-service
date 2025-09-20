import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AccessLogDocument = AccessLog & Document;

@Schema({ timestamps: true })
export class AccessLog {
  @Prop({ required: true })
  jti: string; // JWT ID

  @Prop({ required: true })
  gate: string; // ID do portão/catraca

  @Prop({ required: true })
  userId: string; // ID do usuário (extraído do JWT)

  @Prop({ required: true })
  accessType: 'granted' | 'denied'; // Tipo de acesso

  @Prop({ required: true })
  accessMethod: 'qr_manager' | 'jwt_fallback'; // Método de validação

  @Prop({ required: true })
  timestamp: Date; // Timestamp do acesso

  @Prop()
  reason?: string; // Motivo da negação (se aplicável)

  @Prop({ default: false })
  synced: boolean; // Se foi sincronizado com o QR Manager

  @Prop()
  syncTimestamp?: Date; // Quando foi sincronizado

  @Prop({ type: Object })
  jwtPayload?: any; // Payload completo do JWT (para auditoria)

  @Prop({ type: Object })
  qrManagerResponse?: any; // Resposta do QR Manager (se aplicável)
}

export const AccessLogSchema = SchemaFactory.createForClass(AccessLog);

// Índices para performance
AccessLogSchema.index({ gate: 1, timestamp: -1 });
AccessLogSchema.index({ jti: 1 });
AccessLogSchema.index({ synced: 1 });
AccessLogSchema.index({ userId: 1, timestamp: -1 });
