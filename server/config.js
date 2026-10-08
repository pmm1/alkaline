import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

const env = process.env;

function required(name) {
  const value = env[name]?.trim();
  if (!value) {
    console.error(`\n  Missing ${name} in .env (see .env.example)\n`);
    process.exit(1);
  }
  return value;
}

if (env.NODE_ENV === 'production' && ['change-me', ''].includes(env.APP_PASSWORD?.trim() ?? '')) {
  console.error('\n  Set a real APP_PASSWORD in .env before running in production.\n');
  process.exit(1);
}

export const config = {
  isProd: env.NODE_ENV === 'production',
  host: env.HOST || '127.0.0.1',
  port: Number(env.PORT) || 3100,

  password: required('APP_PASSWORD'),
  sessionSecret: required('SESSION_SECRET'),
  sessionDays: Number(env.SESSION_DAYS) || 30,
  // Secure cookies need HTTPS. On by default in production; set COOKIE_SECURE=false to test over plain http.
  cookieSecure: env.COOKIE_SECURE ? env.COOKIE_SECURE === 'true' : env.NODE_ENV === 'production',

  zai: {
    apiKey: required('ZAI_API_KEY'),
    baseUrl: (env.ZAI_BASE_URL || 'https://api.z.ai/api/coding/paas/v4').replace(/\/+$/, ''),
    model: env.ZAI_MODEL || 'glm-5.3',
    thinking: env.ZAI_THINKING === 'true',
    temperature: Number(env.ZAI_TEMPERATURE ?? 0.6),
    maxTokens: Number(env.ZAI_MAX_TOKENS) || 4096,
  },

  dbFile: path.resolve(ROOT, env.DB_FILE || 'data/alkaline.db'),
  legacyJsonFile: path.resolve(ROOT, env.LEGACY_JSON_FILE || 'data/db.json'),
  knowledgeDir: path.join(ROOT, 'knowledge'),
  distDir: path.join(ROOT, 'dist'),
};
