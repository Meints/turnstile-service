import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { TurnstileConfigService } from '../modules/turnstile/turnstile-config.service';

async function initializeTurnstileConfig() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const configService = app.get(TurnstileConfigService);

  try {
    // Configuração padrão para o portão principal
    const defaultConfig = {
      gateId: 'GATE-001',
      name: 'Portão Principal',
      location: 'Entrada Principal',
      isActive: true,
      maintenanceMode: false,
      jwtValidationTimeout: 300,
      maxRetryAttempts: 5,
      retryInterval: 60000,
      dataRetentionDays: 30,
      allowedGates: ['GATE-001'],
      workingHours: {
        start: '06:00',
        end: '22:00',
        days: [1, 2, 3, 4, 5, 6, 0], // Segunda a domingo
      },
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
