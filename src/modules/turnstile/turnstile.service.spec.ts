import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TurnstileService } from './turnstile.service';
import { SyncService } from './sync.service';
import { AccessLog } from '../../common/schemas/access-log.schema';
import { PendingSync } from '../../common/schemas/pending-sync.schema';
import { TurnstileConfig } from '../../common/schemas/turnstile-config.schema';
import { QrCache } from '../../common/schemas/qr-cache.schema';

describe('TurnstileService', () => {
  let service: TurnstileService;

  const mockModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
    save: jest.fn(),
  };

  const mockSyncService = {
    syncPendingData: jest.fn(),
    getSyncStatus: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TurnstileService,
        {
          provide: getModelToken(AccessLog.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(PendingSync.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(TurnstileConfig.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(QrCache.name),
          useValue: mockModel,
        },
        {
          provide: SyncService,
          useValue: mockSyncService,
        },
      ],
    }).compile();

    service = module.get<TurnstileService>(TurnstileService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should create turnstile config', async () => {
    const configData = {
      gate: 'GATE-A',
      name: 'Test Gate',
      isActive: true,
    };

    mockModel.save = jest.fn().mockResolvedValue(configData);
    
    // Mock constructor
    const mockConstructor = jest.fn().mockImplementation(() => ({
      save: mockModel.save,
    }));
    
    // Replace the model constructor
    (service as any).turnstileConfigModel = mockConstructor;

    const result = await service.createTurnstileConfig(configData);
    
    expect(mockConstructor).toHaveBeenCalledWith(expect.objectContaining({
      gate: 'GATE-A',
      name: 'Test Gate',
      isActive: true,
    }));
  });

  it('should get sync status', async () => {
    const mockStatus = {
      totalPending: 5,
      totalSynced: 10,
      totalFailed: 1,
    };

    mockSyncService.getSyncStatus.mockResolvedValue(mockStatus);

    const result = await service.getSyncStatus('GATE-A');
    
    expect(mockSyncService.getSyncStatus).toHaveBeenCalledWith('GATE-A');
    expect(result).toEqual(mockStatus);
  });
});