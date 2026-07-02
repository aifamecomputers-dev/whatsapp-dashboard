// Populates process.env with valid dummy values before any test file imports
// config/env.ts (which validates eagerly at module load time).
process.env.NODE_ENV = "test";
process.env.PUBLIC_BASE_URL = "https://test.example.com";
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgres://whatsapp_dashboard:whatsapp_dashboard@localhost:5432/whatsapp_dashboard_test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.JWT_SECRET = "test-jwt-secret-that-is-at-least-32-characters-long";
process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
process.env.META_APP_SECRET = "test-meta-app-secret";
process.env.META_WEBHOOK_VERIFY_TOKEN = "test-verify-token";
