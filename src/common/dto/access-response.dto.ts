export class AccessResponseDto {
  success: boolean;
  message: string;
  accessType: 'granted' | 'denied';
  accessMethod: 'qr_manager' | 'offline_validation';
  timestamp: string;
  gate: string;
  userId?: string;
  reason?: string;
  synced: boolean;
  jwtPayload?: any;
}

export class AccessHistoryDto {
  id: string;
  jti: string;
  gate: string;
  userId: string;
  accessType: 'granted' | 'denied';
  accessMethod: 'qr_manager' | 'offline_validation';
  timestamp: string;
  reason?: string;
  synced: boolean;
  syncTimestamp?: string;
}

export class SyncStatusDto {
  totalPending: number;
  totalSynced: number;
  lastSyncAt?: string;
  failedSyncs: number;
  nextRetryAt?: string;
}
