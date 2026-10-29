import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { SystemDiagnosticsDTO } from '@esme/shared';
import type { AppConfig } from '../../config.js';
import type { Db } from '../../db/connection.js';
import { requireAdmin } from '../../plugins/auth.js';
import { recordAudit } from '../../services/audit.js';
import { createBackup } from '../../services/backup.js';
import { getDiagnostics } from '../../services/diagnostics.js';
import {
  cleanupRetention,
  previewRetention,
  recordRetentionPreview,
} from '../../services/retention.js';
import { getSettings } from '../../services/settings.js';
import type { FileStorage } from '../../services/storage.js';

interface Deps {
  db: Db;
  storage: FileStorage;
  config: AppConfig;
}

const cleanupSchema = z.object({
  confirm: z.literal('DELETE', {
    errorMap: () => ({ message: 'Type DELETE to confirm' }),
  }),
});

const systemRoutes: FastifyPluginAsync<Deps> = async (app, opts) => {
  const { db, storage, config } = opts;

  app.get(
    '/system',
    { preHandler: [app.authenticate, app.authorize('backups.run')] },
    async (): Promise<SystemDiagnosticsDTO> => getDiagnostics(db, storage, config),
  );

  app.post(
    '/system/retention/preview',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('retention.manage')] },
    async (request) => {
      const admin = requireAdmin(request);
      const settings = getSettings(db);
      const preview = previewRetention(db, settings);
      recordRetentionPreview(db, preview, admin.id, request.id);
      return preview;
    },
  );

  app.post(
    '/system/retention/cleanup',
    {
      preHandler: [app.authenticate, app.csrfProtect, app.authorize('retention.manage')],
      config: { rateLimit: { max: 3, timeWindow: '1 hour' } },
    },
    async (request) => {
      const admin = requireAdmin(request);
      const body = cleanupSchema.parse(request.body);
      const settings = getSettings(db);
      const result = cleanupRetention(db, storage, settings, {
        confirmation: body.confirm,
        actorAdminId: admin.id,
        requestId: request.id,
      });
      return {
        deletedApplications: result.applicationsDeleted,
        deletedDocuments: result.documentsDeleted,
        deletedApplicants: result.applicantsDeleted,
        deletedFiles: result.filesDeleted,
      };
    },
  );

  app.post(
    '/backups',
    {
      preHandler: [app.authenticate, app.csrfProtect, app.authorize('backups.run')],
      config: { rateLimit: { max: 4, timeWindow: '1 hour' } },
    },
    async (request) => {
      const admin = requireAdmin(request);
      const result = await createBackup(db, config);
      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'backup.created',
        entityType: 'system',
        entityId: null,
        metadata: {
          createdAt: result.createdAt,
          databaseBytes: result.databaseBytes,
          documentRows: result.documentRows,
          uploadFiles: result.uploadFiles,
          integrity: result.integrity,
        },
        requestId: request.id,
      });
      return {
        createdAt: result.createdAt,
        databaseBytes: result.databaseBytes,
        documentRows: result.documentRows,
        uploadFiles: result.uploadFiles,
        integrity: result.integrity,
      };
    },
  );
};

export default systemRoutes;
