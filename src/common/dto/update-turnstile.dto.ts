import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateTurnstileDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}