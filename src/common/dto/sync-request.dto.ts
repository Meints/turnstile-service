import { IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

export class SyncRequestDto {
  @IsOptional()
  @IsString()
  gate?: string; // Filtrar por portão específico

  @IsOptional()
  @IsNumber()
  limit?: number; // Limite de registros para sincronizar

  @IsOptional()
  @IsDateString()
  fromDate?: string; // Data inicial

  @IsOptional()
  @IsDateString()
  toDate?: string; // Data final

  @IsOptional()
  @IsString()
  status?: 'pending' | 'processing' | 'failed'; // Status dos registros
}

export class SyncResponseDto {
  success: boolean;
  message: string;
  syncedCount: number;
  failedCount: number;
  totalProcessed: number;
  errors?: string[];
}
