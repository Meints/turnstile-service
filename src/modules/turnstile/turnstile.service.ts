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
import {
  QrCache,
  QrCacheDocument,
} from 'src/common/schemas/qr-cache.schema';
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
    @InjectModel(QrCache.name)
    private qrCacheModel: Model<QrCacheDocument>,
    private syncService: SyncService,
  ) {
    // Sync automático na inicialização (após 10 segundos)
    setTimeout(() => {
      this.syncOnStartup();
    }, 10000);
  }

  /**
   * Sincronização automática na inicialização
   */
  private async syncOnStartup(): Promise<void> {
    this.logger.log('🚀 [TURNSTILE] Verificando sincronização pendente na inicialização...');
    
    try {
      const pendingCount = await this.pendingSyncModel.countDocuments({ status: 'pending' });
      
      if (pendingCount > 0) {
        this.logger.log(`📋 [TURNSTILE] Encontradas ${pendingCount} validações pendentes para sincronizar`);
        await this.syncService.syncPendingData({});
      } else {
        this.logger.log('✅ [TURNSTILE] Nenhuma sincronização pendente');
      }
    } catch (error) {
      this.logger.warn(`⚠️ [TURNSTILE] Erro na sincronização inicial: ${error.message}`);
    }
  }

  /**
   * Processa o scan do QR Code na catraca
   */
  async scan(scanQrcodeDto: ScanQrcodeDto): Promise<AccessResponseDto> {
    const { jwtToken, gate, deviceId } = scanQrcodeDto;
    const timestamp = new Date(Date.now() - 3 * 60 * 60 * 1000);
    
    this.logger.log(`🚀 [TURNSTILE] Processando scan na catraca: ${gate}`);

    try {
      // 1. Verificar configuração da catraca
      const config = await this.getTurnstileConfig(gate);
      if (!config || !config.isActive) {
        throw new Error('Catraca não está ativa ou não configurada');
      }

      // 2. Decodificar JWT
      const decoded = this.decodeJWT(jwtToken);
      if (!decoded) {
        throw new InvalidQrCodeException('Token JWT inválido ou malformado');
      }

      // 3. Validar JWT (verificações básicas)
      this.validateJWT(decoded, gate);

      // 4. Tentar conectar com QR Manager primeiro
      this.logger.log(`🌐 [TURNSTILE] Conectando com QR Manager...`);
      try {
        const qrManagerResponse = await this.sendToQrManager(decoded, gate);
        this.logger.log(`✅ [TURNSTILE] QR Manager validou - ACESSO LIBERADO!`);

        // Sucesso com QR Manager
        const accessLog = await this.createAccessLog({
          jti: decoded.jti,
          gate,
          userId: decoded.sub || 'unknown',
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
          gate,
          userId: decoded.sub || 'unknown',
          synced: true,
          jwtPayload: decoded,
        };
      } catch (qrManagerError) {
        // Verificar se é erro de conectividade ou erro de validação
        const isConnectivityError = !qrManagerError.response || 
          qrManagerError.code === 'ECONNREFUSED' || 
          qrManagerError.code === 'ETIMEDOUT' ||
          qrManagerError.response?.status >= 500;
        
        if (isConnectivityError) {
          this.logger.warn(`⚠️ [TURNSTILE] QR Manager offline: ${qrManagerError.message}`);
          this.logger.log(`🔄 [TURNSTILE] Usando modo OFFLINE (JWT Fallback)...`);
        } else {
          // Erro de validação (400, 409, etc.) - não usar fallback
          this.logger.error(`❌ [TURNSTILE] QR Manager rejeitou: ${qrManagerError.response?.data?.message || qrManagerError.message}`);
          
          await this.createAccessLog({
            jti: decoded.jti,
            gate,
            userId: decoded.sub || 'unknown',
            accessType: 'denied',
            accessMethod: 'qr_manager',
            timestamp,
            reason: qrManagerError.response?.data?.message || 'QR Code inválido',
            synced: true,
            syncTimestamp: timestamp,
            jwtPayload: decoded,
          });
          
          return {
            success: false,
            message: qrManagerError.response?.data?.message || 'Acesso negado',
            accessType: 'denied',
            accessMethod: 'qr_manager',
            timestamp: timestamp.toISOString(),
            gate,
            userId: decoded.sub || 'unknown',
            reason: qrManagerError.response?.data?.message || 'QR Code inválido',
            synced: true,
            jwtPayload: decoded,
          };
        }

        // 5. Fallback: Validação offline completa
        const offlineValidation = await this.validateOfflineComplete(decoded, gate, timestamp);

        if (offlineValidation.granted) {
          this.logger.log(`✅ [TURNSTILE] JWT válido - ACESSO LIBERADO (OFFLINE)!`);
          
          // Criar registro pendente para sincronização posterior
          await this.createPendingSync({
            jti: decoded.jti,
            gate,
            userId: decoded.sub || 'unknown',
            accessType: 'granted',
            timestamp,
            jwtPayload: decoded,
          });

          // Criar log de acesso (não sincronizado)
          await this.createAccessLog({
            jti: decoded.jti,
            gate,
            userId: decoded.sub || 'unknown',
            accessType: 'granted',
            accessMethod: 'offline_validation',
            timestamp,
            synced: false,
            jwtPayload: decoded,
          });

          return {
            success: true,
            message: 'Acesso liberado via validação offline completa',
            accessType: 'granted',
            accessMethod: 'offline_validation',
            timestamp: timestamp.toISOString(),
            gate,
            userId: decoded.sub || 'unknown',
            synced: false,
            jwtPayload: decoded,
          };
        } else {
          this.logger.error(`❌ [TURNSTILE] Validação offline falhou - ACESSO NEGADO: ${offlineValidation.reason}`);
          
          // Acesso negado
          await this.createPendingSync({
            jti: decoded.jti,
            gate,
            userId: decoded.sub || 'unknown',
            accessType: 'denied',
            timestamp,
            reason: offlineValidation.reason,
            jwtPayload: decoded,
          });

          await this.createAccessLog({
            jti: decoded.jti,
            gate,
            userId: decoded.sub || 'unknown',
            accessType: 'denied',
            accessMethod: 'offline_validation',
            timestamp,
            reason: offlineValidation.reason,
            synced: false,
            jwtPayload: decoded,
          });

          return {
            success: false,
            message: offlineValidation.reason || 'Acesso negado',
            accessType: 'denied',
            accessMethod: 'offline_validation',
            timestamp: timestamp.toISOString(),
            gate,
            userId: decoded.sub || 'unknown',
            reason: offlineValidation.reason,
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
  private validateJWT(decoded: JwtPayload, turnstileId: string): void {
    const now = Math.floor((Date.now() - 3 * 60 * 60 * 1000) / 1000);

    // Verificar expiração
    if (decoded.exp && decoded.exp < now) {
      throw new Error('QR Code expirado');
    }

    // Verificar se já foi liberado
    if (decoded.nbf && decoded.nbf > now) {
      throw new Error('QR Code ainda não válido - fora da janela de tempo');
    }

    // Verificar catraca autorizada
    if (decoded.gate && decoded.gate !== turnstileId) {
      throw new Error('QR Code não autorizado para esta catraca');
    }
  }

  /**
   * Validação offline completa com cache local
   */
  private async validateOfflineComplete(
    decoded: JwtPayload,
    gate: string,
    timestamp: Date,
  ): Promise<{ granted: boolean; reason?: string }> {
    const now = Math.floor((Date.now() - 3 * 60 * 60 * 1000) / 1000);
    const scanTime = Math.floor(timestamp.getTime() / 1000);

    this.logger.log(`🔍 [TURNSTILE] Iniciando validação offline completa...`);

    // 1. Verificar expiração JWT
    if (decoded.exp && decoded.exp < now) {
      return { granted: false, reason: 'QR Code expirado' };
    }

    // 2. Verificar janela de tempo JWT
    if (decoded.nbf && decoded.nbf > now) {
      return { granted: false, reason: 'QR Code ainda não válido - fora da janela de tempo' };
    }

    // 3. Verificar catraca autorizada
    if (decoded.gate && decoded.gate !== gate) {
      return { granted: false, reason: 'QR Code não autorizado para esta catraca' };
    }

    // 4. Buscar ou criar cache do QR Code
    let qrCache = await this.qrCacheModel.findOne({ jti: decoded.jti });
    
    if (!qrCache) {
      // Criar cache baseado no JWT
      qrCache = new this.qrCacheModel({
        jti: decoded.jti,
        visitId: decoded.sub,
        visitName: decoded.name,
        allowedBuilding: decoded.gate,
        windowStart: new Date(decoded.nbf * 1000),
        windowEnd: new Date(decoded.exp * 1000),
        maxUses: decoded.max || 1,
        usedCount: 0,
        status: 'PENDING',
        lastSyncAt: timestamp,
      });
      await qrCache.save();
      this.logger.log(`💾 [TURNSTILE] QR Code cacheado para validação offline`);
    }

    // 5. Verificar status
    if (qrCache.status === 'REVOKED') {
      return { granted: false, reason: 'QR Code foi revogado pelo administrador' };
    }

    if (qrCache.status === 'EXPIRED') {
      return { granted: false, reason: 'QR Code expirado' };
    }

    // 6. Verificar janela de tempo detalhada
    const windowStart = Math.floor(qrCache.windowStart.getTime() / 1000);
    const windowEnd = Math.floor(qrCache.windowEnd.getTime() / 1000);
    
    if (scanTime < windowStart) {
      return { granted: false, reason: 'QR Code ainda não válido - antes da janela de tempo' };
    }
    
    if (scanTime > windowEnd) {
      // Marcar como expirado
      qrCache.status = 'EXPIRED';
      await qrCache.save();
      return { granted: false, reason: 'QR Code expirado - fora da janela de tempo' };
    }

    // 7. Verificar limite de usos
    if (qrCache.usedCount >= qrCache.maxUses) {
      return { granted: false, reason: `QR Code já foi usado o máximo de vezes (${qrCache.usedCount}/${qrCache.maxUses})` };
    }

    // 8. Incrementar contador de uso
    qrCache.usedCount += 1;
    qrCache.status = 'ACTIVE';
    qrCache.lastSyncAt = timestamp;
    await qrCache.save();

    this.logger.log(`✅ [TURNSTILE] Validação offline aprovada - Usos: ${qrCache.usedCount}/${qrCache.maxUses}`);
    
    return { granted: true };
  }

  /**
   * Envia dados para QR Manager
   */
  private async sendToQrManager(
    decoded: JwtPayload,
    gate: string,
  ): Promise<any> {
    const payload = {
      jti: decoded.jti,
      gate: gate,
      at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    };

    this.logger.log(`📤 [TURNSTILE] Enviando para QR Manager: ${JSON.stringify(payload)}`);

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
    gate: string,
  ): Promise<TurnstileConfig | null> {
    return await this.turnstileConfigModel.findOne({ gate, isActive: true });
  }

  /**
   * Cria log de acesso
   */
  private async createAccessLog(data: {
    jti: string;
    gate: string;
    userId: string;
    accessType: 'granted' | 'denied';
    accessMethod: 'qr_manager' | 'offline_validation';
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
    gate: string;
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
      lastRetryAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
    });
    return await pendingSync.save();
  }

  /**
   * Obtém histórico de acessos
   */
  async getAccessHistory(
    gate?: string,
    limit: number = 50,
  ): Promise<AccessHistoryDto[]> {
    const query = gate ? { gate } : {};

    const logs = await this.accessLogModel
      .find(query)
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    return logs.map((log) => ({
      id: log._id.toString(),
      jti: log.jti,
      gate: log.gate,
      userId: log.userId,
      accessType: log.accessType,
      accessMethod: log.accessMethod === 'jwt_fallback' ? 'offline_validation' : log.accessMethod,
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
  async getSyncStatus(gate?: string): Promise<any> {
    return await this.syncService.getSyncStatus(gate);
  }

  /**
   * Cria configuração de catraca
   */
  async createTurnstileConfig(configData: any): Promise<any> {
    const config = new this.turnstileConfigModel({
      gate: configData.gate,
      name: configData.name,
      isActive: configData.isActive || true,
      jwtValidationTimeout: 300,
      maxRetryAttempts: 5,
      retryInterval: 60000,
      dataRetentionDays: 30,
      totalAccesses: 0,
      failedSyncs: 0,
    });
    
    return await config.save();
  }

  /**
   * Atualiza configuração de catraca
   */
  async updateTurnstileConfig(gate: string, updateData: any): Promise<any> {
    const config = await this.turnstileConfigModel.findOneAndUpdate(
      { gate },
      updateData,
      { new: true }
    );
    
    if (!config) {
      throw new Error('Catraca não encontrada');
    }
    
    return config;
  }

  /**
   * Sincroniza cache de QR Codes com QR Manager
   */
  async syncQrCache(): Promise<void> {
    this.logger.log(`🔄 [TURNSTILE] Sincronizando cache de QR Codes...`);
    
    const cachedQrs = await this.qrCacheModel.find({
      status: { $in: ['ACTIVE', 'PENDING'] },
      lastSyncAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } // Mais de 5 min sem sync
    });

    for (const qrCache of cachedQrs) {
      try {
        // Tentar validar com QR Manager
        const payload = {
          jti: qrCache.jti,
          gate: qrCache.allowedBuilding,
          at: new Date().toISOString(),
        };

        const response = await axios.post(
          `${env.ACCESS_QR_MANAGER}/qrcodes/consume`,
          payload,
          { timeout: 3000 },
        );

        if (response.status === 200) {
          // QR Manager confirmou - manter cache
          qrCache.lastSyncAt = new Date(Date.now() - 3 * 60 * 60 * 1000);
          await qrCache.save();
        }
      } catch (error) {
        if (error.response?.status === 409) {
          // QR esgotou usos - marcar como expirado
          qrCache.status = 'EXPIRED';
          await qrCache.save();
          this.logger.log(`❌ [TURNSTILE] QR Cache expirado: ${qrCache.jti}`);
        } else if (error.response?.status === 410) {
          // QR foi revogado
          qrCache.status = 'REVOKED';
          await qrCache.save();
          this.logger.log(`❌ [TURNSTILE] QR Cache revogado: ${qrCache.jti}`);
        }
      }
    }

    this.logger.log(`✅ [TURNSTILE] Sincronização de cache concluída`);
  }
}