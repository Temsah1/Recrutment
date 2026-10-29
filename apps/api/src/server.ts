import { loadConfig } from './config.js';
import { openDatabase, runMigrations } from './db/connection.js';
import { seedDefaults } from './db/seed.js';
import { buildApp } from './app.js';
import { FileStorage } from './services/storage.js';
import { cleanupExpiredSessions } from './services/auth.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  const applied = runMigrations(db, config.migrationsDir);
  seedDefaults(db);

  const storage = new FileStorage(config.uploadsDir);
  storage.init();
  storage.cleanupTemporaryFiles();

  const app = await buildApp({ config, db, storage });

  const maintenance = setInterval(() => {
    try {
      cleanupExpiredSessions(db);
      storage.cleanupTemporaryFiles();
    } catch (error) {
      app.log.warn({ err: error }, 'Maintenance task failed');
    }
  }, 15 * 60 * 1000);
  maintenance.unref();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    clearInterval(maintenance);
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, 'Error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled promise rejection');
  });
  process.on('uncaughtException', (error) => {
    app.log.error({ err: error }, 'Uncaught exception');
    void shutdown('uncaughtException');
  });

  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    app.log.error({ err: error }, 'Failed to start server');
    await app.close();
    process.exit(1);
  }

  app.log.info(
    {
      env: config.env,
      port: config.port,
      migrationsApplied: applied.length,
      uploadsConfigured: Boolean(config.uploadsDir),
    },
    'ESME Recruitment OS API ready',
  );
  if (applied.length > 0) {
    app.log.info({ migrations: applied.map((m) => m.version) }, 'Applied migrations on startup');
  }
}

void main();
