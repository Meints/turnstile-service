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
      gateId,
      limit = 100,
      fromDate,
      toDate,
      status = 'pending',
    } = syncRequest;

    try {
      // Buscar registros pendentes
      const query: any = { status };
      if (gateId) query.gateId = gateId;
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
            { status: 'processing', lastRetryAt: new Date() },
          );

          // Enviar para QR Manager
          const response = await this.sendToQrManager(record);

          if (response.success) {
            // Criar log de acesso
            await this.createAccessLog(record, response.data);

            // Marcar como sincronizado
            await this.pendingSyncModel.updateOne(
              { _id: record._id },
              {
                status: 'completed',
                syncTimestamp: new Date(),
                errorMessage: null,
              },
            );

            syncedCount++;
            this.logger.log(`Registro ${record.jti} sincronizado com sucesso`);
          } else {
            throw new Error(
              response.message || 'Erro na resposta do QR Manager',
            );
          }
        } catch (error) {
          failedCount++;
          const errorMessage = String(error);
          errors.push(`Registro ${record.jti}: ${errorMessage}`);

          // Atualizar contador de tentativas
          const retryCount = record.retryCount + 1;
          const status =
            retryCount >= env.MAX_RETRY_ATTEMPTS ? 'failed' : 'pending';

          await this.pendingSyncModel.updateOne(
            { _id: record._id },
            {
              retryCount,
              status,
              lastRetryAt: new Date(),
              errorMessage,
            },
          );

          this.logger.error(
            `Erro ao sincronizar registro ${record.jti}:`,
            error,
          );
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
    const payload = {
      jti: record.jti,
      gate: record.gateId,
      userId: record.userId,
      accessType: record.accessType,
      timestamp: record.timestamp,
      reason: record.reason,
      jwtPayload: record.jwtPayload,
    };

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
   * Cria log de acesso após sincronização bem-sucedida
   */
  private async createAccessLog(
    record: PendingSync,
    qrManagerResponse: any,
  ): Promise<void> {
    const accessLog = new this.accessLogModel({
      jti: record.jti,
      gateId: record.gateId,
      userId: record.userId,
      accessType: record.accessType,
      accessMethod: 'qr_manager',
      timestamp: record.timestamp,
      reason: record.reason,
      synced: true,
      syncTimestamp: new Date(),
      jwtPayload: record.jwtPayload,
      qrManagerResponse,
    });

    await accessLog.save();
  }

  /**
   * Obtém estatísticas de sincronização
   */
  async getSyncStatus(gateId?: string): Promise<any> {
    const query = gateId ? { gateId } : {};

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
    const cutoffDate = new Date();
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
