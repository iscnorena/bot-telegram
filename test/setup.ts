// Variables de entorno dummy para que `lib/env.ts` valide sin fallar en tests.
// Ningún test hace llamadas reales de red ni toca una base de datos real.
process.env.DATABASE_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.DIRECT_URL ??= "postgresql://user:pass@localhost:5432/test";
process.env.TELEGRAM_BOT_TOKEN ??= "test-bot-token";
process.env.TELEGRAM_WEBHOOK_SECRET ??= "test-secret";
process.env.PROVEEDOR_TELEGRAM_CHAT_ID ??= "1000";
process.env.ADMIN_TELEGRAM_CHAT_ID ??= "2000";
process.env.AUTH_SECRET ??= "test-auth-secret-0123456789";
