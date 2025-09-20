import { config } from 'dotenv';

config();

export const env = {
  JWT_PUBLIC_KEY_PEM: process.env.JWT_PUBLIC_KEY_PEM,
  PORT: process.env.PORT || '3031',
  ACCESS_QR_MANAGER: process.env.ACCESS_QR_MANAGER || 'http://localhost:3000',
  MONGODB_URI:
    process.env.MONGODB_URI || 'mongodb://localhost:27017/turnstile-service',
  SYNC_INTERVAL: parseInt(process.env.SYNC_INTERVAL || '300000'), // 5 minutos
  MAX_RETRY_ATTEMPTS: parseInt(process.env.MAX_RETRY_ATTEMPTS || '5'),
  JWT_VALIDATION_TIMEOUT: parseInt(process.env.JWT_VALIDATION_TIMEOUT || '300'), // 5 minutos
};
