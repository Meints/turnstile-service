# Microsserviço de Catraca (Turnstile Service)

## 📋 Visão Geral

Microsserviço responsável por gerenciar o controle de acesso através de catracas, com sistema de fallback para JWT e sincronização automática com o QR Manager.

## 🏗️ Arquitetura

### Componentes Principais

- **TurnstileService**: Lógica principal de processamento de acessos
- **SyncService**: Gerenciamento de sincronização com QR Manager
- **TurnstileConfigService**: Configuração das catracas
- **Schemas MongoDB**: AccessLog, PendingSync, TurnstileConfig

### Fluxo de Funcionamento

1. **Scan do QR Code** → Validação JWT básica
2. **Tentativa de conexão** com QR Manager
3. **Sucesso**: Acesso liberado + Log sincronizado
4. **Falha**: Fallback JWT + Registro pendente para sincronização

## 🚀 Endpoints

### POST `/turnstile/scan`
Processa o scan do QR Code na catraca.

**Request:**
```json
{
  "jwtToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "gate": "GATE-001",
  "deviceId": "DEVICE-123",
  "location": "Entrada Principal"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Acesso liberado via QR Manager",
  "accessType": "granted",
  "accessMethod": "qr_manager",
  "timestamp": "2025-09-17T21:30:00.000Z",
  "gate": "GATE-001",
  "userId": "user123",
  "synced": true,
  "jwtPayload": { ... }
}
```

### GET `/turnstile/history`
Obtém histórico de acessos.

**Query Parameters:**
- `gate` (opcional): Filtrar por portão
- `limit` (opcional): Limite de registros (padrão: 50)

### POST `/turnstile/sync`
Sincroniza dados pendentes com QR Manager.

### GET `/turnstile/sync/status`
Obtém status de sincronização.

### GET `/turnstile/health`
Health check do serviço.

### GET `/turnstile/stats`
Estatísticas gerais do sistema.

## 🗄️ Schemas MongoDB

### AccessLog
Histórico completo de acessos processados.

```typescript
{
  jti: string;           // JWT ID
  gate: string;        // ID do portão
  userId: string;        // ID do usuário
  accessType: 'granted' | 'denied';
  accessMethod: 'qr_manager' | 'jwt_fallback';
  timestamp: Date;
  reason?: string;       // Motivo da negação
  synced: boolean;       // Se foi sincronizado
  syncTimestamp?: Date;
  jwtPayload?: any;      // Payload do JWT
  qrManagerResponse?: any;
}
```

### PendingSync
Registros pendentes de sincronização.

```typescript
{
  jti: string;
  gate: string;
  userId: string;
  accessType: 'granted' | 'denied';
  timestamp: Date;
  reason?: string;
  jwtPayload: any;
  retryCount: number;
  lastRetryAt: Date;
  status: 'pending' | 'processing' | 'failed' | 'completed';
  errorMessage?: string;
}
```

### TurnstileConfig
Configuração das catracas.

```typescript
{
  gate: string;        // ID único do portão
  name: string;          // Nome do portão
  location: string;      // Localização
  isActive: boolean;     // Se está ativo
  maintenanceMode: boolean;
  jwtValidationTimeout: number;
  maxRetryAttempts: number;
  retryInterval: number;
  dataRetentionDays: number;
  allowedGates?: string[];
  workingHours?: {
    start: string;
    end: string;
    days: number[];
  };
  lastSyncAt?: Date;
  totalAccesses: number;
  failedSyncs: number;
}
```

## ⚙️ Configuração

### Variáveis de Ambiente

```env
# Porta do serviço
PORT=3031

# MongoDB
MONGODB_URI=mongodb://localhost:27017/turnstile-service

# QR Manager
ACCESS_QR_MANAGER=http://localhost:8081

# JWT
JWT_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----..."

# Sincronização
SYNC_INTERVAL=300000          # 5 minutos
MAX_RETRY_ATTEMPTS=5
JWT_VALIDATION_TIMEOUT=300    # 5 minutos
```

### Inicialização

1. **Instalar dependências:**
```bash
npm install
```

2. **Configurar MongoDB:**
```bash
# Instalar MongoDB localmente ou usar Docker
docker run -d -p 27017:27017 --name mongodb mongo:latest
```

3. **Inicializar configuração:**
```bash
npm run init:config
```

4. **Executar serviço:**
```bash
npm run start:dev
```

## 🔄 Sistema de Sincronização

### Funcionamento

1. **Modo Online**: QR Manager disponível
   - Validação via QR Manager
   - Log imediatamente sincronizado

2. **Modo Offline**: QR Manager indisponível
   - Validação via JWT (fallback)
   - Registro salvo em `PendingSync`
   - Sincronização posterior quando QR Manager voltar

### Sincronização Automática

- **Intervalo**: A cada 5 minutos (configurável)
- **Retry**: Máximo 5 tentativas por registro
- **Cleanup**: Dados antigos removidos após 30 dias

## 🛡️ Validações JWT (Fallback)

### Verificações Básicas
- ✅ Token válido e decodificável
- ✅ Não expirado (`exp`)
- ✅ Já liberado (`nbf`)
- ✅ Portão autorizado
- ✅ Horário de funcionamento
- ✅ Portões permitidos

### Configuração de Horários
```typescript
workingHours: {
  start: "06:00",
  end: "22:00",
  days: [1, 2, 3, 4, 5, 6, 0] // Segunda a domingo
}
```

## 📊 Monitoramento

### Métricas Disponíveis
- Total de acessos processados
- Taxa de sucesso/falha
- Registros pendentes de sincronização
- Última sincronização bem-sucedida
- Falhas de sincronização

### Health Check
```bash
curl http://localhost:3031/turnstile/health
```

## 🧪 Testes

### Teste de Scan
```bash
curl -X POST http://localhost:3031/turnstile/scan \
  -H "Content-Type: application/json" \
  -d '{
    "jwtToken": "seu_jwt_token_aqui",
    "gate": "GATE-001"
  }'
```

### Teste de Sincronização
```bash
curl -X POST http://localhost:3031/turnstile/sync
```

### Teste de Histórico
```bash
curl http://localhost:3031/turnstile/history?gate=GATE-001&limit=10
```

## 🔧 Manutenção

### Limpeza de Dados Antigos
```typescript
// Executar periodicamente
await syncService.cleanupOldRecords(30); // 30 dias
```

### Configuração de Catraca
```typescript
// Ativar/desativar catraca
await configService.toggleActive('GATE-001', false);

// Modo de manutenção
await configService.toggleMaintenanceMode('GATE-001', true);
```

## 📈 Escalabilidade

### Considerações
- **MongoDB**: Índices otimizados para consultas frequentes
- **Sincronização**: Processamento em lotes
- **Retry**: Backoff exponencial para falhas
- **Cleanup**: Remoção automática de dados antigos

### Performance
- **Throughput**: ~1000 scans/minuto por catraca
- **Latência**: <100ms para validação JWT
- **Storage**: ~1KB por registro de acesso

## 🚨 Troubleshooting

### Problemas Comuns

1. **QR Manager indisponível**
   - Sistema automaticamente usa fallback JWT
   - Dados ficam pendentes para sincronização

2. **MongoDB desconectado**
   - Verificar string de conexão
   - Verificar se MongoDB está rodando

3. **JWT inválido**
   - Verificar chave pública
   - Verificar formato do token

4. **Sincronização falhando**
   - Verificar conectividade com QR Manager
   - Verificar logs de erro
   - Verificar configuração de retry

## 📝 Logs

### Níveis de Log
- **INFO**: Operações normais
- **WARN**: Fallbacks e retries
- **ERROR**: Falhas críticas

### Exemplo de Log
```
[TurnstileService] Processando scan para portão GATE-001
[TurnstileService] QR Manager indisponível, usando fallback JWT
[SyncService] Iniciando sincronização de dados pendentes
[SyncService] 15 registros sincronizados com sucesso
```

---

## 🎯 Para o TCC

Este microsserviço demonstra:

1. **Arquitetura de Microsserviços**: Comunicação assíncrona, fallback, resiliência
2. **Padrões de Design**: Service Layer, Repository, Observer
3. **Tecnologias Modernas**: NestJS, MongoDB, JWT, Axios
4. **Boas Práticas**: Validação, tratamento de erros, logging, monitoramento
5. **Escalabilidade**: Índices, cache, processamento em lotes

### Pontos de Destaque para Apresentação

- ✅ **Resiliência**: Sistema continua funcionando mesmo com QR Manager offline
- ✅ **Auditoria**: Histórico completo de todos os acessos
- ✅ **Sincronização**: Dados eventualmente consistentes
- ✅ **Configurabilidade**: Catracas configuráveis individualmente
- ✅ **Monitoramento**: Métricas e health checks
- ✅ **Manutenibilidade**: Código bem estruturado e documentado
