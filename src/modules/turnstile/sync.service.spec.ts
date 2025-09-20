import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { SyncService } from './sync.service';
import { PendingSync } from '../../common/schemas/pending-sync.schema';
import { AccessLog } from '../../common/schemas/access-log.schema';

describe('SyncService', () => {
  let service: SyncService;

  const mockModel = {
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
    countDocuments: jest.fn(),
    save: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncService,
        {
          provide: getModelToken(PendingSync.name),
          useValue: mockModel,
        },
        {
          provide: getModelToken(AccessLog.name),
          useValue: mockModel,
        },
      ],
    }).compile();

    service = module.get<SyncService>(SyncService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should get sync status', async () => {
    mockModel.countDocuments
      .mockResolvedValueOnce(5) // pending
      .mockResolvedValueOnce(10) // synced
      .mockResolvedValueOnce(1); // failed

    mockModel.findOne = jest.fn().mockResolvedValue({
      syncTimestamp: new Date(),
    });

    const result = await service.getSyncStatus('GATE-A');
    
    expect(result).toEqual({
      totalPending: 5,
      totalSynced: 10,
      totalFailed: 1,
      lastSyncAt: expect.any(Date),
    });
  });

  it('should handle empty sync request', async () => {
    mockModel.find = jest.fn().mockReturnValue({
      limit: jest.fn().mockReturnValue({
        sort: jest.fn().mockResolvedValue([]),
      }),
    });

    const result = await service.syncPendingData({});
    
    expect(result).toEqual({
      success: true,
      message: 'Nenhum registro pendente encontrado',
      syncedCount: 0,
      failedCount: 0,
      totalProcessed: 0,
    });
  });
});