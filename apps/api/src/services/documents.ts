import { fileTypeFromBuffer } from 'file-type';
import type { AppSettings, DocumentType } from '@esme/shared';
import { AppError } from '../lib/errors.js';
import { sanitizeFilename } from '@esme/shared';

const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'png', 'webp']);

export interface ValidatedUpload {
  buffer: Buffer;
  originalFilename: string;
  contentType: string;
  extension: string;
  size: number;
  checksum?: string;
}

export async function validateUploadedDocument(
  part: { data: Buffer; filename: string; mimetype: string },
  documentType: DocumentType,
  settings: AppSettings,
  hardMaxBytes: number,
): Promise<ValidatedUpload> {
  const { data } = part;
  const effectiveMax = Math.min(settings.documents.maxSizeBytes, hardMaxBytes);

  if (data.length === 0) {
    throw new AppError(400, 'bad_request', 'The uploaded file is empty');
  }
  if (data.length > effectiveMax) {
    throw new AppError(
      413,
      'payload_too_large',
      `File exceeds the ${Math.round(effectiveMax / (1024 * 1024))} MB limit`,
    );
  }
  if (data.length < 10) {
    throw new AppError(400, 'bad_request', 'The uploaded file is not a valid document');
  }

  // Content-based detection: never trust the extension or browser-declared MIME type.
  const detected = await fileTypeFromBuffer(data);
  if (!detected || !ALLOWED_EXTENSIONS.has(detected.ext)) {
    throw new AppError(
      415,
      'unsupported_media_type',
      'Unsupported file type. Upload a PDF or a JPEG, PNG or WebP image.',
    );
  }

  const allowed =
    documentType === 'national_id'
      ? settings.documents.nationalIdTypes
      : settings.documents.universityIdTypes;

  if (!allowed.includes(detected.mime)) {
    throw new AppError(
      415,
      'unsupported_media_type',
      documentType === 'national_id'
        ? 'The national ID must be uploaded as a PDF'
        : 'The university ID must be uploaded as a JPEG, PNG or WebP image',
    );
  }

  return {
    buffer: data,
    originalFilename: sanitizeFilename(part.filename || 'document'),
    contentType: detected.mime,
    extension: `.${detected.ext}`,
    size: data.length,
  };
}
