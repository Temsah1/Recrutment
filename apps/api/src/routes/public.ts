import type { FastifyPluginAsync } from 'fastify';
import {
  applicationSubmissionSchema,
  DOCUMENT_TYPES,
  IDEMPOTENCY_HEADER,
  type DocumentType,
  type PublicConfig,
  type SubmittedApplicationDTO,
} from '@esme/shared';
import type { AppConfig } from '../config.js';
import type { Db } from '../db/connection.js';
import { AppError } from '../lib/errors.js';
import { createApplication } from '../services/applications.js';
import { listDepartments } from '../services/departments.js';
import { validateUploadedDocument, type ValidatedUpload } from '../services/documents.js';
import { getSettings, resolveRecruitmentState } from '../services/settings.js';
import type { FileStorage } from '../services/storage.js';
import { ACADEMIC_YEARS, DOCUMENT_MIME_LABELS } from '@esme/shared';

interface Deps {
  db: Db;
  storage: FileStorage;
  config: AppConfig;
}

const publicRoutes: FastifyPluginAsync<Deps> = async (app, opts) => {
  const { db, storage, config } = opts;

  app.get('/public/config', async (): Promise<PublicConfig> => {
    const state = resolveRecruitmentState(db);
    const settings = state.settings;
    const departments = listDepartments(db, false);
    const cycle = state.cycle;

    return {
      recruitment: {
        open: state.open,
        title: settings.recruitment.title,
        headline: settings.recruitment.headline,
        description: settings.recruitment.description,
        deadline: state.effectiveClose,
        opensAt: state.openStart,
        closesAt: state.effectiveClose,
        timezone: settings.recruitment.timezone,
        cycleName: cycle?.name ?? 'Recruitment',
        cycleId: cycle?.id ?? null,
        confirmationTitle: settings.recruitment.confirmationTitle,
        confirmationMessage: settings.recruitment.confirmationMessage,
        closedReason: state.open ? null : state.closedReason,
      },
      departments,
      documents: {
        maxSizeBytes: settings.documents.maxSizeBytes,
        nationalId: {
          required: settings.documents.nationalIdRequired,
          allowedTypes: settings.documents.nationalIdTypes,
          label: DOCUMENT_MIME_LABELS.national_id,
        },
        universityId: {
          required: settings.documents.universityIdRequired,
          allowedTypes: settings.documents.universityIdTypes,
          label: DOCUMENT_MIME_LABELS.university_id,
        },
      },
      privacy: { version: settings.privacy.version, text: settings.privacy.text },
      form: {
        allowSecondaryPreference: settings.form.allowSecondaryPreference,
        requireExperience: settings.form.requireExperience,
        additionalInformationEnabled: settings.form.additionalInformationEnabled,
        allowOtherUniversities: settings.form.allowOtherUniversities,
        academicYears: ACADEMIC_YEARS,
      },
      serverTime: new Date().toISOString(),
    };
  });

  app.get('/public/departments', async () => ({ items: listDepartments(db, false) }));

  app.post(
    '/public/applications',
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      if (!request.isMultipart()) {
        throw new AppError(415, 'unsupported_media_type', 'Expected a multipart/form-data request');
      }

      let rawPayload: unknown;
      const fileParts: Partial<
        Record<DocumentType, { data: Buffer; filename: string; mimetype: string }>
      > = {};

      for await (const part of request.parts()) {
        if (part.type === 'file') {
          if (part.fieldname !== 'national_id' && part.fieldname !== 'university_id') {
            await part.toBuffer();
            throw AppError.badRequest(`Unexpected file field: ${part.fieldname}`);
          }
          const key = part.fieldname as DocumentType;
          if (fileParts[key]) {
            await part.toBuffer();
            throw AppError.badRequest('Duplicate file upload');
          }
          const data = await part.toBuffer();
          if (part.file.truncated) {
            throw new AppError(413, 'payload_too_large', 'The uploaded file exceeds the size limit');
          }
          fileParts[key] = {
            data,
            filename: part.filename || 'document',
            mimetype: part.mimetype,
          };
        } else if (part.fieldname === 'payload') {
          // Multipart parsers decode application/json fields into objects.
          rawPayload = part.value;
        }
      }

      if (rawPayload === undefined || rawPayload === null || rawPayload === '') {
        throw AppError.badRequest('Missing application payload');
      }

      let json: unknown = rawPayload;
      if (typeof rawPayload === 'string') {
        try {
          json = JSON.parse(rawPayload);
        } catch {
          throw AppError.badRequest('The application payload is not valid JSON');
        }
      }

      const payload = applicationSubmissionSchema.parse(json);

      const headerKey = request.headers[IDEMPOTENCY_HEADER];
      if (typeof headerKey === 'string' && headerKey.length > 0) {
        if (payload.idempotencyKey && payload.idempotencyKey !== headerKey) {
          throw AppError.badRequest('Conflicting idempotency keys supplied');
        }
        payload.idempotencyKey = headerKey;
      }
      if (payload.idempotencyKey && !/^[0-9a-f-]{36}$/i.test(payload.idempotencyKey)) {
        throw AppError.badRequest('The idempotency key must be a UUID');
      }

      const settings = getSettings(db);
      const uploads: Partial<Record<DocumentType, ValidatedUpload>> = {};
      for (const type of DOCUMENT_TYPES) {
        const file = fileParts[type];
        if (!file) continue;
        uploads[type] = await validateUploadedDocument(file, type, settings, config.maxUploadBytes);
      }

      const result = createApplication(db, storage, {
        payload,
        uploads,
        ip: request.ip,
        requestId: request.id,
      });

      const body: SubmittedApplicationDTO & { replayed: boolean } = {
        reference: result.reference,
        submittedAt: result.submittedAt,
        replayed: result.replayed,
      };
      return reply.code(result.replayed ? 200 : 201).header('Cache-Control', 'no-store').send(body);
    },
  );

  app.get('/health', async (request, reply) => {
    let database = 'ok';
    try {
      db.prepare('SELECT 1').get();
    } catch {
      database = 'error';
    }
    const storageOk = storage.isReady() && storage.checkWritable();
    const ok = database === 'ok' && storageOk;
    return reply.code(ok ? 200 : 503).send({
      status: ok ? 'ok' : 'degraded',
      database,
      storage: storageOk ? 'ok' : 'error',
      time: new Date().toISOString(),
    });
  });
};

export default publicRoutes;
