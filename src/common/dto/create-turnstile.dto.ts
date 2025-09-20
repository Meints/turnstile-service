import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class CreateTurnstileDto {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  tenant: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}