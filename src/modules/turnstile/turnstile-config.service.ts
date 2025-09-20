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
    const { gate } = configData;

    const existingConfig = await this.turnstileConfigModel.findOne({ gate });

    if (existingConfig) {
      // Atualizar configuração existente
      Object.assign(existingConfig, configData);
      await existingConfig.save();
      this.logger.log(`Configuração atualizada para portão ${gate}`);
      return existingConfig;
    } else {
      // Criar nova configuração
      const newConfig = new this.turnstileConfigModel(configData);
      await newConfig.save();
      this.logger.log(`Nova configuração criada para portão ${gate}`);
      return newConfig;
    }
  }

  /**
   * Obtém configuração por ID do portão
   */
  async getConfigBygate(gate: string): Promise<TurnstileConfig | null> {
    return await this.turnstileConfigModel.findOne({ gate });
  }

  /**
   * Lista todas as configurações
   */
  async getAllConfigs(): Promise<TurnstileConfig[]> {
    return await this.turnstileConfigModel.find().sort({ gate: 1 });
  }

  /**
   * Ativa/desativa catraca
   */
  async toggleActive(
    gate: string,
    isActive: boolean,
  ): Promise<TurnstileConfig | null> {
    const config = await this.turnstileConfigModel.findOneAndUpdate(
      { gate },
      { isActive },
      { new: true },
    );

    if (config) {
      this.logger.log(
        `Portão ${gate} ${isActive ? 'ativado' : 'desativado'}`,
      );
    }

    return config;
  }



  /**
   * Atualiza estatísticas
   */
  async updateStats(
    gate: string,
    stats: { totalAccesses?: number; failedSyncs?: number },
  ): Promise<void> {
    await this.turnstileConfigModel.updateOne(
      { gate },
      {
        $inc: stats,
        lastSyncAt: new Date(),
      },
    );
  }

  /**
   * Remove configuração
   */
  async deleteConfig(gate: string): Promise<boolean> {
    const result = await this.turnstileConfigModel.deleteOne({ gate });
    this.logger.log(`Configuração removida para portão ${gate}`);
    return result.deletedCount > 0;
  }
}
