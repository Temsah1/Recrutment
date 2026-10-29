import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const e2eDataDir = path.join(repoRoot, 'var', 'e2e');
const API_PORT = 4100;
const WEB_PORT = 5273;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const WEB_URL = `http://localhost:${WEB_PORT}`;

const e2eEnv = {
  NODE_ENV: 'development',
  APP_DATA_DIR: e2eDataDir,
  DATABASE_PATH: path.join(e2eDataDir, 'db', 'e2e.sqlite'),
  PRIVATE_UPLOADS_DIR: path.join(e2eDataDir, 'uploads'),
  BACKUP_DIR: path.join(e2eDataDir, 'backups'),
  HOST: '127.0.0.1',
  PORT: String(API_PORT),
  PUBLIC_APP_URL: WEB_URL,
  SESSION_SECRET: 'e2e-only-session-secret-do-not-use-outside-tests-0123456789',
  ADMIN_BOOTSTRAP_TOKEN: 'e2e-only-bootstrap-token-0123456789abcdef',
  ADMIN_BOOTSTRAP_PASSWORD: 'E2E-only-Passphrase-2026',
  ADMIN_NAME: 'E2E Admin',
  LOG_LEVEL: 'warn',
};

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  outputDir: 'test-results',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    reducedMotion: 'reduce',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command:
        'node scripts/e2e-reset.mjs && npm run build:shared && ' +
        'npm run admin:bootstrap -w @esme/api -- --email e2e-admin@esme.test && ' +
        'npx --no-install tsx apps/api/src/server.ts',
      url: `${API_URL}/api/v1/health`,
      timeout: 180_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: e2eEnv,
    },
    {
      command: `npm run dev -w @esme/web -- --port ${WEB_PORT}`,
      url: WEB_URL,
      timeout: 120_000,
      reuseExistingServer: false,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        ...e2eEnv,
        VITE_DEV_API_TARGET: API_URL,
      },
    },
  ],
});
