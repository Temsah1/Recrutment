import type { FastifyPluginAsync } from 'fastify';
import type { AppConfig } from '../../config.js';
import type { Db } from '../../db/connection.js';
import type { FileStorage } from '../../services/storage.js';
import applicationsRoutes from './applications.js';
import settingsRoutes from './settings.js';
import administrationRoutes from './administration.js';
import systemRoutes from './system.js';

interface Deps {
  db: Db;
  storage: FileStorage;
  config: AppConfig;
}

const adminRoutes: FastifyPluginAsync<Deps> = async (app, opts) => {
  const deps = { db: opts.db, storage: opts.storage, config: opts.config };
  await app.register(applicationsRoutes, deps);
  await app.register(settingsRoutes, deps);
  await app.register(administrationRoutes, deps);
  await app.register(systemRoutes, deps);
};

export default adminRoutes;
