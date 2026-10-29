import { Readable } from 'node:stream';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import {
  STATUS_LABELS,
  applicationListQuerySchema,
  assignmentSchema,
  bulkStatusSchema,
  escapeCsvField,
  noteSchema,
  statusUpdateSchema,
  type ApplicationListDTO,
  type DashboardDTO,
  type NoteDTO,
} from '@esme/shared';
import type { AppConfig } from '../../config.js';
import type { Db } from '../../db/connection.js';
import type { DocumentRow } from '../../db/rows.js';
import { AppError } from '../../lib/errors.js';
import { requireAdmin } from '../../plugins/auth.js';
import {
  addApplicationNote,
  assignReviewer,
  documentTypeLabel,
  getApplicationDetail,
  getDashboard,
  iterateExportRows,
  listActiveDocuments,
  listApplications,
  listReviewers,
  scopeForAdmin,
  updateApplicationStatus,
} from '../../services/applications.js';
import { recordAudit } from '../../services/audit.js';
import type { FileStorage } from '../../services/storage.js';

interface Deps {
  db: Db;
  storage: FileStorage;
  config: AppConfig;
}

const idParams = z.object({ id: z.coerce.number().int().positive() });
const queryIdSchema = z.object({ id: z.coerce.number().int().positive() });

function contentDisposition(disposition: 'attachment' | 'inline', filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename).replace(/['()]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}

const applicationsRoutes: FastifyPluginAsync<Deps> = async (app, opts) => {
  const { db, storage } = opts;

  app.get(
    '/dashboard',
    { preHandler: [app.authenticate, app.authorize('applications.view')] },
    async (request): Promise<DashboardDTO> => {
      const admin = requireAdmin(request);
      return getDashboard(db, admin, scopeForAdmin(admin.role, admin.id));
    },
  );

  app.get(
    '/applications',
    { preHandler: [app.authenticate, app.authorize('applications.view')] },
    async (request): Promise<ApplicationListDTO> => {
      const admin = requireAdmin(request);
      const query = applicationListQuerySchema.parse(request.query);
      return listApplications(db, query, scopeForAdmin(admin.role, admin.id));
    },
  );

  app.get(
    '/reviewers',
    { preHandler: [app.authenticate, app.authorize('applications.view')] },
    async () => ({ items: listReviewers(db) }),
  );

  app.get(
    '/applications/:id',
    { preHandler: [app.authenticate, app.authorize('applications.view')] },
    async (request) => {
      const admin = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      return getApplicationDetail(db, id, scopeForAdmin(admin.role, admin.id));
    },
  );

  app.get(
    '/applications/:id/documents',
    { preHandler: [app.authenticate, app.authorize('applications.view')] },
    async (request) => {
      const admin = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      getApplicationDetail(db, id, scopeForAdmin(admin.role, admin.id));
      return {
        items: listActiveDocuments(db, id).map((document) => ({
          ...document,
          typeLabel: documentTypeLabel(document.type),
        })),
      };
    },
  );

  app.patch(
    '/applications/:id/status',
    {
      preHandler: [
        app.authenticate,
        app.csrfProtect,
        app.authorize('applications.status'),
      ],
    },
    async (request) => {
      const admin = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      const body = statusUpdateSchema.parse(request.body);
      const scope = scopeForAdmin(admin.role, admin.id);
      updateApplicationStatus(db, {
        applicationId: id,
        admin,
        scope,
        status: body.status,
        reason: body.reason ?? null,
        expectedVersion: body.expectedVersion,
        requestId: request.id,
      });
      return getApplicationDetail(db, id, scope);
    },
  );

  app.patch(
    '/applications/:id/assignee',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('applications.assign')] },
    async (request) => {
      const admin = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      const body = assignmentSchema.parse(request.body);
      assignReviewer(db, {
        applicationId: id,
        reviewerId: body.reviewerId,
        admin,
        requestId: request.id,
      });
      return getApplicationDetail(db, id, scopeForAdmin(admin.role, admin.id));
    },
  );

  app.post(
    '/applications/:id/notes',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('applications.notes')] },
    async (request, reply): Promise<NoteDTO> => {
      const admin = requireAdmin(request);
      const { id } = idParams.parse(request.params);
      const body = noteSchema.parse(request.body);
      const note = addApplicationNote(db, {
        applicationId: id,
        admin,
        scope: scopeForAdmin(admin.role, admin.id),
        body: body.body,
        requestId: request.id,
      });
      reply.code(201);
      return note;
    },
  );

  app.post(
    '/applications/bulk-status',
    { preHandler: [app.authenticate, app.csrfProtect, app.authorize('applications.status')] },
    async (request) => {
      const admin = requireAdmin(request);
      const body = bulkStatusSchema.parse(request.body);
      const scope = scopeForAdmin(admin.role, admin.id);
      const results: { id: number; ok: boolean; message?: string }[] = [];
      for (const id of body.ids) {
        try {
          updateApplicationStatus(db, {
            applicationId: id,
            admin,
            scope,
            status: body.status,
            reason: body.reason ?? 'Bulk status update',
            requestId: request.id,
          });
          results.push({ id, ok: true });
        } catch (error) {
          results.push({
            id,
            ok: false,
            message: error instanceof AppError ? error.message : 'Unexpected error',
          });
        }
      }
      return { results, succeeded: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length };
    },
  );

  app.get(
    '/documents/:id/download',
    { preHandler: [app.authenticate, app.authorize('documents.download')] },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const { id } = queryIdSchema.parse(request.params);
      const disposition =
        (request.query as { disposition?: string })?.disposition === 'inline' ? 'inline' : 'attachment';

      const row = db
        .prepare(
          `SELECT d.*, a.assigned_reviewer_id, a.public_reference
             FROM application_documents d
             JOIN applications a ON a.id = d.application_id
            WHERE d.id = ? AND d.deleted_at IS NULL`,
        )
        .get(id) as (DocumentRow & { assigned_reviewer_id: number | null; public_reference: string }) | undefined;

      if (!row) throw AppError.notFound('Document not found');
      if (scopeForAdmin(admin.role, admin.id).kind === 'assigned' && row.assigned_reviewer_id !== admin.id) {
        throw AppError.forbidden('This application is not assigned to you');
      }
      if (!storage.exists(row.storage_name)) {
        throw AppError.notFound('The stored document file is missing. Ask a Super Admin to run storage reconciliation.');
      }

      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'document.accessed',
        entityType: 'application_document',
        entityId: row.id,
        metadata: {
          applicationId: row.application_id,
          reference: row.public_reference,
          type: row.document_type,
        },
        requestId: request.id,
      });

      reply.header('Content-Type', row.detected_content_type);
      reply.header('Content-Length', String(row.file_size));
      reply.header('Content-Disposition', contentDisposition(disposition, row.original_filename));
      reply.header('Cache-Control', 'no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('Content-Security-Policy', "sandbox; default-src 'none'");
      reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
      return reply.send(storage.createStream(row.storage_name));
    },
  );

  app.get(
    '/exports/applications.csv',
    { preHandler: [app.authenticate, app.authorize('exports.create')] },
    async (request, reply) => {
      const admin = requireAdmin(request);
      const query = applicationListQuerySchema.parse(request.query);
      const scope = scopeForAdmin(admin.role, admin.id);

      recordAudit(db, {
        actorAdminId: admin.id,
        action: 'export.created',
        entityType: 'application',
        entityId: null,
        metadata: {
          format: 'csv',
          filters: {
            q: query.q ?? null,
            status: query.status ?? null,
            departmentSlug: query.departmentSlug ?? null,
            academicYear: query.academicYear ?? null,
            cycleId: query.cycleId ?? null,
            from: query.from ?? null,
            to: query.to ?? null,
          },
        },
        requestId: request.id,
      });

      const headers = [
        'Application reference',
        'Applicant name',
        'Email',
        'Phone',
        'University',
        'Faculty',
        'Academic department',
        'Academic year',
        'Primary department',
        'Secondary department',
        'Status',
        'Submitted at (UTC)',
        'Assigned reviewer',
      ];

      const rows = iterateExportRows(db, query, scope);
      const headerLine = headers.map(escapeCsvField).join(',');
      function* chunks(): Generator<string> {
        yield `\uFEFF${headerLine}\r\n`;
        let buffer: string[] = [];
        for (const row of rows) {
          buffer.push(
            [
              row.reference,
              row.full_name,
              row.email,
              row.phone,
              row.university,
              row.faculty,
              row.academic_department,
              row.academic_year,
              row.primary_department,
              row.secondary_department,
              STATUS_LABELS[row.status],
              row.submitted_at,
              row.reviewer,
            ]
              .map(escapeCsvField)
              .join(','),
          );
          if (buffer.length >= 200) {
            yield `${buffer.join('\r\n')}\r\n`;
            buffer = [];
          }
        }
        if (buffer.length > 0) yield `${buffer.join('\r\n')}\r\n`;
      }

      const filename = `esme-applications-${new Date().toISOString().slice(0, 10)}.csv`;
      reply.header('Content-Type', 'text/csv; charset=utf-8');
      reply.header('Content-Disposition', contentDisposition('attachment', filename));
      reply.header('Cache-Control', 'no-store');
      reply.header('X-Content-Type-Options', 'nosniff');
      return reply.send(Readable.from(chunks()));
    },
  );
};

export default applicationsRoutes;
