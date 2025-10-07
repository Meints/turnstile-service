import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  UseFilters,
  Logger,
  Put,
  Param,
} from '@nestjs/common';
import { TurnstileService } from './turnstile.service';
import { ScanQrcodeDto } from 'src/common/dto/scan-qrcode.dto';
import {
  AccessResponseDto,
  AccessHistoryDto,
  SyncStatusDto,
} from 'src/common/dto/access-response.dto';
import {
  SyncRequestDto,
  SyncResponseDto,
} from 'src/common/dto/sync-request.dto';
import { TurnstileExceptionFilter } from 'src/common/filters/turnstile-exception.filter';

@Controller('turnstile')
@UseFilters(TurnstileExceptionFilter)
export class TurnstileController {
  private readonly logger = new Logger(TurnstileController.name);

  constructor(private readonly turnstileService: TurnstileService) {}

  /**
   * Endpoint principal para scan do QR Code
   */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  async scan(@Body() scanQrcodeDto: ScanQrcodeDto): Promise<AccessResponseDto> {
    this.logger.log(`Processando scan para portão ${scanQrcodeDto.gate}`);
    return await this.turnstileService.scan(scanQrcodeDto);
  }

  /**
   * Obtém histórico de acessos
   */
  @Get('history')
  async getHistory(
    @Query('gate') gate?: string,
    @Query('limit') limit?: string,
  ): Promise<AccessHistoryDto[]> {
    const limitNumber = limit ? parseInt(limit, 10) : 50;
    return await this.turnstileService.getAccessHistory(gate, limitNumber);
  }

  /**
   * Sincroniza dados pendentes com QR Manager
   */
  @Post('sync')
  async syncPendingData(
    @Body() syncRequest: SyncRequestDto,
  ): Promise<SyncResponseDto> {
    this.logger.log('Iniciando sincronização de dados pendentes');
    return await this.turnstileService.syncPendingData();
  }

  /**
   * Obtém status de sincronização
   */
  @Get('sync/status')
  async getSyncStatus(
    @Query('gate') gate?: string,
  ): Promise<SyncStatusDto> {
    return await this.turnstileService.getSyncStatus(gate);
  }

  /**
   * Health check do serviço
   */
  @Get('health')
  @HttpCode(HttpStatus.OK)
  async healthCheck(): Promise<{
    status: string;
    timestamp: string;
    version: string;
  }> {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.0.0',
    };
  }

  /**
   * Estatísticas gerais do sistema
   */
  @Get('stats')
  async getStats(@Query('gate') gate?: string): Promise<any> {
    const syncStatus = await this.turnstileService.getSyncStatus(gate);
    const history = await this.turnstileService.getAccessHistory(gate, 10);

    return {
      syncStatus,
      recentAccesses: history.length,
      lastAccess: history[0]?.timestamp || null,
    };
  }

  /**
   * Criar configuração de catraca
   */
  @Post('config')
  async createConfig(@Body() configData: any): Promise<any> {
    return await this.turnstileService.createTurnstileConfig(configData);
  }

  /**
   * Atualizar catraca
   */
  @Put(':id')
  async updateTurnstile(@Param('id') id: string, @Body() updateData: any): Promise<any> {
    return await this.turnstileService.updateTurnstileConfig(id, updateData);
  }

  /**
   * Sincronizar cache de QR Codes
   */
  @Post('sync-cache')
  async syncQrCache(): Promise<{ message: string }> {
    await this.turnstileService.syncQrCache();
    return { message: 'Cache sincronizado com sucesso' };
  }

  /**
   * Forçar sincronização manual
   */
  @Post('force-sync')
  async forceSync(): Promise<{ message: string; synced: number }> {
    this.logger.log('🔄 [TURNSTILE] Forçando sincronização manual...');
    const result = await this.turnstileService.syncPendingData();
    return {
      message: 'Sincronização forçada concluída',
      synced: result.syncedCount || 0
    };
  }
}
