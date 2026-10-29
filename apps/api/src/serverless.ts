import type { IncomingMessage, ServerResponse } from 'node:http';
import type { FastifyInstance } from 'fastify';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDatabase, runMigrations } from './db/connection.js';
import { seedDefaults } from './db/seed.js';
import { FileStorage } from './services/storage.js';

let appPromise: Promise<FastifyInstance> | null = null;

async function createApp(): Promise<FastifyInstance> {
  const config = loadConfig();
  const db = openDatabase(config.databasePath);
  runMigrations(db, config.migrationsDir);
  seedDefaults(db);

  const storage = new FileStorage(config.uploadsDir);
  storage.init();
  storage.cleanupTemporaryFiles();

  const app = await buildApp({ config, db, storage, closeDbOnShutdown: false });
  await app.ready();
  return app;
}

function getApp(): Promise<FastifyInstance> {
  if (!appPromise) {
    appPromise = createApp().catch((error: unknown) => {
      appPromise = null;
      throw error;
    });
  }
  return appPromise;
}

export default async function handler(
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  let app: FastifyInstance;
  try {
    app = await getApp();
  } catch (error) {
    console.error(
      '[api] initialization failed:',
      error instanceof Error ? `${error.name}: ${error.message}` : 'Unknown error',
    );
    if (!response.headersSent) {
      response.statusCode = 500;
      response.setHeader('content-type', 'application/json; charset=utf-8');
      response.setHeader('cache-control', 'no-store');
    }
    response.end(
      JSON.stringify({
        error: { code: 'internal_error', message: 'The API failed to initialize' },
      }),
    );
    return;
  }

  await new Promise<void>((resolve) => {
    response.once('finish', resolve);
    response.once('close', resolve);
    app.server.emit('request', request, response);
  });
}
