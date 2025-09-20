import { IsJWT, IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class ScanQrcodeDto {
  @IsString()
  @IsNotEmpty()
  @IsJWT()
  jwtToken: string;

  @IsString()
  @IsNotEmpty()
  gate: string;

  @IsOptional()
  @IsString()
  deviceId?: string; // ID do dispositivo que fez o scan


}
