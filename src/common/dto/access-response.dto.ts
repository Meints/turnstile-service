export class AccessResponseDto {
  success: boolean;
  message: string;
  accessType: 'granted' | 'denied';
  accessMethod: 'qr_manager' | 'jwt_fallback';
  timestamp: string;
  gateId: string;
  userId?: string;
  reason?: string;
  synced: boolean;
  jwtPayload?: any;
}

export class AccessHistoryDto {
  id: string;
  jti: string;
  gateId: string;
  userId: string;
  accessType: 'granted' | 'denied';
  accessMethod: 'qr_manager' | 'jwt_fallback';
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
