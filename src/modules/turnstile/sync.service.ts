import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import axios from 'axios';
import { env } from 'src/config/env';
import {
  PendingSync,
  PendingSyncDocument,
} from 'src/common/schemas/pending-sync.schema';
import {
  AccessLog,
  AccessLogDocument,
} from 'src/common/schemas/access-log.schema';
import {
  SyncRequestDto,
  SyncResponseDto,
} from 'src/common/dto/sync-request.dto';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    @InjectModel(PendingSync.name)
    private pendingSyncModel: Model<PendingSyncDocument>,
    @InjectModel(AccessLog.name)
    private accessLogModel: Model<AccessLogDocument>,
  ) {}

  /**
   * Sincroniza dados pendentes com o QR Manager
   */
  async syncPendingData(syncRequest: SyncRequestDto): Promise<SyncResponseDto> {
    const {
      gate,
      limit = 100,
      fromDate,
      toDate,
      status = 'pending',
    } = syncRequest;

    try {
      // Buscar registros pendentes
      const query: any = { status };
      if (gate) query.gate = gate;
      if (fromDate) query.timestamp = { $gte: new Date(fromDate) };
      if (toDate) {
        query.timestamp = { ...query.timestamp, $lte: new Date(toDate) };
      }

      const pendingRecords = await this.pendingSyncModel
        .find(query)
        .limit(limit)
        .sort({ timestamp: 1 });

      if (pendingRecords.length === 0) {
        return {
          success: true,
          message: 'Nenhum registro pendente encontrado',
          syncedCount: 0,
          failedCount: 0,
          totalProcessed: 0,
        };
      }

      let syncedCount = 0;
      let failedCount = 0;
      const errors: string[] = [];

      // Processar cada registro
      for (const record of pendingRecords) {
        try {
          // Marcar como processando
          await this.pendingSyncModel.updateOne(
            { _id: record._id },
            { status: 'processing', lastRetryAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
          );

          // Enviar para QR Manager
          const response = await this.sendToQrManager(record);

          if (response.success) {
            // Criar log de acesso
            await this.createAccessLog(record, response.data);

            // REMOVER do pendingsyncs (sucesso)
            await this.pendingSyncModel.deleteOne({ _id: record._id });

            syncedCount++;
            this.logger.log(`✅ [SYNC] Registro ${record.jti} sincronizado e removido`);
          } else {
            throw new Error(
              response.message || 'Erro na resposta do QR Manager',
            );
          }
        } catch (error) {
          const errorMessage = String(error);
          const isHttpError = error.response?.status;
          
          // Verificar se é erro definitivo (não precisa tentar novamente)
          const definitiveErrors = [
            409, // QR esgotou usos
            410, // QR foi revogado
            404, // QR não encontrado
            400  // QR inválido
          ];
          
          if (isHttpError && definitiveErrors.includes(error.response.status)) {
            // REMOVER do pendingsyncs (erro definitivo)
            await this.pendingSyncModel.deleteOne({ _id: record._id });
            
            // Criar log de acesso negado
            await this.createAccessLog(record, null, error.response.data?.message || errorMessage);
            
            syncedCount++; // Contar como "processado"
            this.logger.log(`🗑️ [SYNC] Registro ${record.jti} removido (erro definitivo: ${error.response.status})`);
          } else {
            // Erro temporário - manter para retry
            failedCount++;
            errors.push(`Registro ${record.jti}: ${errorMessage}`);

            const retryCount = record.retryCount + 1;
            const status = retryCount >= env.MAX_RETRY_ATTEMPTS ? 'failed' : 'pending';

            if (status === 'failed') {
              // REMOVER se excedeu tentativas
              await this.pendingSyncModel.deleteOne({ _id: record._id });
              this.logger.log(`🗑️ [SYNC] Registro ${record.jti} removido (excedeu tentativas)`);
            } else {
              // Atualizar para nova tentativa
              await this.pendingSyncModel.updateOne(
                { _id: record._id },
                {
                  retryCount,
                  status,
                  lastRetryAt: new Date(Date.now() - 3 * 60 * 60 * 1000),
                  errorMessage,
                },
              );
            }

            this.logger.error(`❌ [SYNC] Erro ao sincronizar ${record.jti}: ${errorMessage}`);
          }
        }
      }

      return {
        success: failedCount === 0,
        message: `Sincronização concluída: ${syncedCount} sucessos, ${failedCount} falhas`,
        syncedCount,
        failedCount,
        totalProcessed: pendingRecords.length,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      this.logger.error('Erro durante sincronização:', error);
      throw new Error(`Erro na sincronização: ${error}`);
    }
  }

  /**
   * Envia dados para o QR Manager
   */
  private async sendToQrManager(record: PendingSync): Promise<any> {
    // Payload correto para o QR Manager (apenas os campos esperados)
    const payload = {
      jti: record.jti,
      gate: record.gate,
      at: record.timestamp.toISOString(), // Campo correto esperado pelo QR Manager
    };

    this.logger.log(`📤 [SYNC] Enviando para QR Manager: ${JSON.stringify(payload)}`);

    const response = await axios.post(
      `${env.ACCESS_QR_MANAGER}/qrcodes/consume`,
      payload,
      { timeout: 10000 },
    );

    return {
      success: response.status === 200,
      data: response.data,
    };
  }

  /**
   * Cria log de acesso após sincronização
   */
  private async createAccessLog(
    record: PendingSync,
    qrManagerResponse: any,
    errorReason?: string,
  ): Promise<void> {
    const accessLog = new this.accessLogModel({
      jti: record.jti,
      gate: record.gate,
      userId: record.userId,
      accessType: errorReason ? 'denied' : record.accessType,
      accessMethod: 'qr_manager',
      timestamp: record.timestamp,
      reason: errorReason || record.reason,
      synced: true,
      syncTimestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
      jwtPayload: record.jwtPayload,
      qrManagerResponse,
    });

    await accessLog.save();
  }

  /**
   * Obtém estatísticas de sincronização
   */
  async getSyncStatus(gate?: string): Promise<any> {
    const query = gate ? { gate } : {};

    const [pending, synced, failed] = await Promise.all([
      this.pendingSyncModel.countDocuments({ ...query, status: 'pending' }),
      this.accessLogModel.countDocuments({ ...query, synced: true }),
      this.pendingSyncModel.countDocuments({ ...query, status: 'failed' }),
    ]);

    const lastSync = await this.accessLogModel
      .findOne({ ...query, synced: true })
      .sort({ syncTimestamp: -1 })
      .select('syncTimestamp');

    return {
      totalPending: pending,
      totalSynced: synced,
      totalFailed: failed,
      lastSyncAt: lastSync?.syncTimestamp,
    };
  }

  /**
   * Limpa registros antigos (manutenção)
   */
  async cleanupOldRecords(daysToKeep: number = 30): Promise<void> {
    const cutoffDate = new Date(Date.now() - 3 * 60 * 60 * 1000);
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    await Promise.all([
      this.pendingSyncModel.deleteMany({
        status: 'completed',
        syncTimestamp: { $lt: cutoffDate },
      }),
      this.accessLogModel.deleteMany({
        timestamp: { $lt: cutoffDate },
      }),
    ]);

    this.logger.log(
      `Limpeza concluída: registros anteriores a ${cutoffDate.toISOString()}`,
    );
  }
}
