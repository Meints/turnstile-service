import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TurnstileConfigService } from '../modules/turnstile/turnstile-config.service';

async function initializeTurnstileConfig() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const configService = app.get(TurnstileConfigService);

  try {
    // Configuração padrão para o portão principal
    const defaultConfig = {
      gate: 'GATE-001',
      name: 'Portão Principal',
      isActive: true,
      jwtValidationTimeout: 300,
      maxRetryAttempts: 5,
      retryInterval: 60000,
      dataRetentionDays: 30,
      allowedGates: ['GATE-001'],
      totalAccesses: 0,
      failedSyncs: 0,
    };

    await configService.createOrUpdateConfig(defaultConfig);
    console.log('✅ Configuração da catraca inicializada com sucesso!');
  } catch (error) {
    console.error('❌ Erro ao inicializar configuração:', error);
  } finally {
    await app.close();
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  initializeTurnstileConfig();
}
