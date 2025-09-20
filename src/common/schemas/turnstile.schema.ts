import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type TurnstileDocument = Turnstile & Document;

@Schema({ timestamps: true })
export class Turnstile {
  @Prop({ required: true, unique: true, index: true })
  id: string;

  @Prop({ required: true })
  name: string;

  @Prop({ required: true })
  tenant: string;

  @Prop({ default: true })
  isActive: boolean;
}

export const TurnstileSchema = SchemaFactory.createForClass(Turnstile);

TurnstileSchema.index({ tenant: 1 });