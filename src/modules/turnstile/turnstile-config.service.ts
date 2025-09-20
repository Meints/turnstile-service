import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TurnstileConfig,
  TurnstileConfigDocument,
} from 'src/common/schemas/turnstile-config.schema';

@Injectable()
export class TurnstileConfigService {
  private readonly logger = new Logger(TurnstileConfigService.name);

  constructor(
    @InjectModel(TurnstileConfig.name)
    private turnstileConfigModel: Model<TurnstileConfigDocument>,
  ) {}

  /**
   * Cria ou atualiza configuração da catraca
   */
  async createOrUpdateConfig(
    configData: Partial<TurnstileConfig>,
  ): Promise<TurnstileConfig> {
    const { gateId } = configData;

    const existingConfig = await this.turnstileConfigModel.findOne({ gateId });

    if (existingConfig) {
      // Atualizar configuração existente
      Object.assign(existingConfig, configData);
      await existingConfig.save();
      this.logger.log(`Configuração atualizada para portão ${gateId}`);
      return existingConfig;
    } else {
      // Criar nova configuração
      const newConfig = new this.turnstileConfigModel(configData);
      await newConfig.save();
      this.logger.log(`Nova configuração criada para portão ${gateId}`);
      return newConfig;
    }
  }

  /**
   * Obtém configuração por ID do portão
   */
  async getConfigByGateId(gateId: string): Promise<TurnstileConfig | null> {
    return await this.turnstileConfigModel.findOne({ gateId });
  }

  /**
   * Lista todas as configurações
   */
  async getAllConfigs(): Promise<TurnstileConfig[]> {
    return await this.turnstileConfigModel.find().sort({ gateId: 1 });
  }

  /**
   * Ativa/desativa catraca
   */
  async toggleActive(
    gateId: string,
    isActive: boolean,
  ): Promise<TurnstileConfig | null> {
    const config = await this.turnstileConfigModel.findOneAndUpdate(
      { gateId },
      { isActive },
      { new: true },
    );

    if (config) {
      this.logger.log(
        `Portão ${gateId} ${isActive ? 'ativado' : 'desativado'}`,
      );
    }

    return config;
  }

  /**
   * Ativa/desativa modo de manutenção
   */
  async toggleMaintenanceMode(
    gateId: string,
    maintenanceMode: boolean,
  ): Promise<TurnstileConfig | null> {
    const config = await this.turnstileConfigModel.findOneAndUpdate(
      { gateId },
      { maintenanceMode },
      { new: true },
    );

    if (config) {
      this.logger.log(
        `Modo de manutenção ${maintenanceMode ? 'ativado' : 'desativado'} para portão ${gateId}`,
      );
    }

    return config;
  }

  /**
   * Atualiza estatísticas
   */
  async updateStats(
    gateId: string,
    stats: { totalAccesses?: number; failedSyncs?: number },
  ): Promise<void> {
    await this.turnstileConfigModel.updateOne(
      { gateId },
      {
        $inc: stats,
        lastSyncAt: new Date(),
      },
    );
  }

  /**
   * Remove configuração
   */
  async deleteConfig(gateId: string): Promise<boolean> {
    const result = await this.turnstileConfigModel.deleteOne({ gateId });
    this.logger.log(`Configuração removida para portão ${gateId}`);
    return result.deletedCount > 0;
  }
}
