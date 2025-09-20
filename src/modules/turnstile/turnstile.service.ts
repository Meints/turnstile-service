import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as jwt from 'jsonwebtoken';
import axios from 'axios';
import { env } from 'src/config/env';
import { ScanQrcodeDto } from 'src/common/dto/scan-qrcode.dto';
import {
  AccessResponseDto,
  AccessHistoryDto,
} from 'src/common/dto/access-response.dto';
import { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';
import {
  AccessLog,
  AccessLogDocument,
} from 'src/common/schemas/access-log.schema';
import {
  PendingSync,
  PendingSyncDocument,
} from 'src/common/schemas/pending-sync.schema';
import {
  TurnstileConfig,
  TurnstileConfigDocument,
} from 'src/common/schemas/turnstile-config.schema';
import { InvalidQrCodeException } from 'src/common/exceptions/turnstile.exceptions';
import { SyncService } from './sync.service';

@Injectable()
export class TurnstileService {
  private readonly logger = new Logger(TurnstileService.name);

  constructor(
    @InjectModel(AccessLog.name)
    private accessLogModel: Model<AccessLogDocument>,
    @InjectModel(PendingSync.name)
    private pendingSyncModel: Model<PendingSyncDocument>,
    @InjectModel(TurnstileConfig.name)
    private turnstileConfigModel: Model<TurnstileConfigDocument>,
    private syncService: SyncService,
  ) {}

  /**
   * Processa o scan do QR Code na catraca
   */
  async scan(scanQrcodeDto: ScanQrcodeDto): Promise<AccessResponseDto> {
    const { jwtToken, gateId, deviceId, location } = scanQrcodeDto;
    const timestamp = new Date();

    try {
      // 1. Verificar configuração da catraca
      const config = await this.getTurnstileConfig(gateId);
      if (!config || !config.isActive) {
        throw new Error('Catraca não está ativa ou não configurada');
      }

      if (config.maintenanceMode) {
        throw new Error('Catraca em modo de manutenção');
      }

      // 2. Decodificar JWT
      const decoded = this.decodeJWT(jwtToken);
      if (!decoded) {
        throw new InvalidQrCodeException('Token JWT inválido ou malformado');
      }

      // 3. Validar JWT (verificações básicas)
      this.validateJWT(decoded, gateId);

      // 4. Tentar conectar com QR Manager primeiro
      try {
        const qrManagerResponse = await this.sendToQrManager(decoded, gateId);

        // Sucesso com QR Manager
        const accessLog = await this.createAccessLog({
          jti: decoded.jti,
          gateId,
          userId: decoded.sub || decoded.userId,
          accessType: 'granted',
          accessMethod: 'qr_manager',
          timestamp,
          synced: true,
          syncTimestamp: timestamp,
          jwtPayload: decoded,
          qrManagerResponse: qrManagerResponse.data,
        });

        return {
          success: true,
          message: 'Acesso liberado via QR Manager',
          accessType: 'granted',
          accessMethod: 'qr_manager',
          timestamp: timestamp.toISOString(),
          gateId,
          userId: decoded.sub || decoded.userId,
          synced: true,
          jwtPayload: decoded,
        };
      } catch (qrManagerError) {
        this.logger.warn(
          `QR Manager indisponível, usando fallback JWT: ${qrManagerError.message}`,
        );

        // 5. Fallback: Validar via JWT
        const jwtValidation = this.validateJWTFallback(decoded, config);

        if (jwtValidation.granted) {
          // Criar registro pendente para sincronização posterior
          await this.createPendingSync({
            jti: decoded.jti,
            gateId,
            userId: decoded.sub || decoded.userId,
            accessType: 'granted',
            timestamp,
            jwtPayload: decoded,
          });

          // Criar log de acesso (não sincronizado)
          await this.createAccessLog({
            jti: decoded.jti,
            gateId,
            userId: decoded.sub || decoded.userId,
            accessType: 'granted',
            accessMethod: 'jwt_fallback',
            timestamp,
            synced: false,
            jwtPayload: decoded,
          });

          return {
            success: true,
            message: 'Acesso liberado via JWT (modo offline)',
            accessType: 'granted',
            accessMethod: 'jwt_fallback',
            timestamp: timestamp.toISOString(),
            gateId,
            userId: decoded.sub || decoded.userId,
            synced: false,
            jwtPayload: decoded,
          };
        } else {
          // Acesso negado
          await this.createPendingSync({
            jti: decoded.jti,
            gateId,
            userId: decoded.sub || decoded.userId,
            accessType: 'denied',
            timestamp,
            reason: jwtValidation.reason,
            jwtPayload: decoded,
          });

          await this.createAccessLog({
            jti: decoded.jti,
            gateId,
            userId: decoded.sub || decoded.userId,
            accessType: 'denied',
            accessMethod: 'jwt_fallback',
            timestamp,
            reason: jwtValidation.reason,
            synced: false,
            jwtPayload: decoded,
          });

          return {
            success: false,
            message: jwtValidation.reason,
            accessType: 'denied',
            accessMethod: 'jwt_fallback',
            timestamp: timestamp.toISOString(),
            gateId,
            userId: decoded.sub || decoded.userId,
            reason: jwtValidation.reason,
            synced: false,
            jwtPayload: decoded,
          };
        }
      }
    } catch (error) {
      this.logger.error(`Erro no processamento do scan: ${error.message}`);
      throw error;
    }
  }

  /**
   * Decodifica JWT sem verificar assinatura
   */
  private decodeJWT(jwtToken: string): JwtPayload | null {
    try {
      return jwt.decode(jwtToken) as JwtPayload;
    } catch {
      return null;
    }
  }

  /**
   * Validações básicas do JWT
   */
  private validateJWT(decoded: JwtPayload, gateId: string): void {
    const now = Math.floor(Date.now() / 1000);

    // Verificar expiração
    if (decoded.exp && decoded.exp < now) {
      throw new Error('Token expirado');
    }

    // Verificar se já foi liberado
    if (decoded.nbf && decoded.nbf > now) {
      throw new Error('Acesso ainda não liberado');
    }

    // Verificar portão autorizado
    if (decoded.gate && decoded.gate !== gateId) {
      throw new Error(`Portão ${gateId} não autorizado para este acesso`);
    }
  }

  /**
   * Validação de fallback via JWT
   */
  private validateJWTFallback(
    decoded: JwtPayload,
    config: TurnstileConfig,
  ): { granted: boolean; reason?: string } {
    const now = Math.floor(Date.now() / 1000);

    // Verificar expiração
    if (decoded.exp && decoded.exp < now) {
      return { granted: false, reason: 'Token expirado' };
    }

    // Verificar se já foi liberado
    if (decoded.nbf && decoded.nbf > now) {
      return { granted: false, reason: 'Acesso ainda não liberado' };
    }

    // Verificar horário de funcionamento
    if (config.workingHours) {
      const currentHour = new Date().getHours();
      const currentDay = new Date().getDay();
      const startHour = parseInt(config.workingHours.start.split(':')[0]);
      const endHour = parseInt(config.workingHours.end.split(':')[0]);

      if (!config.workingHours.days.includes(currentDay)) {
        return {
          granted: false,
          reason: 'Acesso não permitido neste dia da semana',
        };
      }

      if (currentHour < startHour || currentHour >= endHour) {
        return {
          granted: false,
          reason: 'Acesso fora do horário de funcionamento',
        };
      }
    }

    // Verificar portões permitidos
    if (config.allowedGates && !config.allowedGates.includes(decoded.gate)) {
      return { granted: false, reason: 'Portão não autorizado' };
    }

    return { granted: true };
  }

  /**
   * Envia dados para QR Manager
   */
  private async sendToQrManager(
    decoded: JwtPayload,
    gateId: string,
  ): Promise<any> {
    const payload = {
      jti: decoded.jti,
      gate: gateId,
      at: new Date().toISOString(),
    };

    const response = await axios.post(
      `${env.ACCESS_QR_MANAGER}/qrcodes/consume`,
      payload,
      { timeout: 5000 },
    );

    if (response.status !== 200) {
      throw new Error('Erro na resposta do QR Manager');
    }

    return response;
  }

  /**
   * Obtém configuração da catraca
   */
  private async getTurnstileConfig(
    gateId: string,
  ): Promise<TurnstileConfig | null> {
    return await this.turnstileConfigModel.findOne({ gateId, isActive: true });
  }

  /**
   * Cria log de acesso
   */
  private async createAccessLog(data: {
    jti: string;
    gateId: string;
    userId: string;
    accessType: 'granted' | 'denied';
    accessMethod: 'qr_manager' | 'jwt_fallback';
    timestamp: Date;
    reason?: string;
    synced: boolean;
    syncTimestamp?: Date;
    jwtPayload: any;
    qrManagerResponse?: any;
  }): Promise<AccessLogDocument> {
    const accessLog = new this.accessLogModel(data);
    return await accessLog.save();
  }

  /**
   * Cria registro pendente para sincronização
   */
  private async createPendingSync(data: {
    jti: string;
    gateId: string;
    userId: string;
    accessType: 'granted' | 'denied';
    timestamp: Date;
    reason?: string;
    jwtPayload: any;
  }): Promise<PendingSyncDocument> {
    const pendingSync = new this.pendingSyncModel({
      ...data,
      status: 'pending',
      retryCount: 0,
      lastRetryAt: new Date(),
    });
    return await pendingSync.save();
  }

  /**
   * Obtém histórico de acessos
   */
  async getAccessHistory(
    gateId?: string,
    limit: number = 50,
  ): Promise<AccessHistoryDto[]> {
    const query = gateId ? { gateId } : {};

    const logs = await this.accessLogModel
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return logs.map((log) => ({
      id: log._id.toString(),
      jti: log.jti,
      gateId: log.gateId,
      userId: log.userId,
      accessType: log.accessType,
      accessMethod: log.accessMethod,
      timestamp: log.timestamp.toISOString(),
      reason: log.reason,
      synced: log.synced,
      syncTimestamp: log.syncTimestamp?.toISOString(),
    }));
  }

  /**
   * Sincroniza dados pendentes
   */
  async syncPendingData(): Promise<any> {
    return await this.syncService.syncPendingData({});
  }

  /**
   * Obtém status de sincronização
   */
  async getSyncStatus(gateId?: string): Promise<any> {
    return await this.syncService.getSyncStatus(gateId);
  }
}
