// Mock environment variables for tests
process.env.MONGODB_URI = 'mongodb://localhost:27017/test';
process.env.ACCESS_QR_MANAGER = 'http://localhost:8000';
process.env.MAX_RETRY_ATTEMPTS = '3';
process.env.NODE_ENV = 'test';