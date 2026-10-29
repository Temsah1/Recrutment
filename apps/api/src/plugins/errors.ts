import type { FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

function zodDetails(error: ZodError): { path: string; message: string }[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.') || 'body',
    message: issue.message,
  }));
}

const errorsPlugin: FastifyPluginAsync = async (app) => {
  app.setErrorHandler((error, request, reply) => {
    if (error instanceof AppError) {
      return reply.code(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      });
    }

    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'validation_error',
          message: 'Some fields need your attention',
          details: zodDetails(error),
        },
      });
    }

    const statusCode = typeof (error as { statusCode?: number }).statusCode === 'number'
      ? (error as { statusCode: number }).statusCode
      : 500;
    const code = (error as { code?: string }).code ?? '';

    if (statusCode === 429 || code === 'FST_ERR_RATE_LIMIT') {
      return reply.code(429).send({
        error: { code: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' },
      });
    }
    if (code === 'FST_REQ_FILE_TOO_LARGE' || statusCode === 413) {
      return reply.code(413).send({
        error: { code: 'payload_too_large', message: 'The uploaded file or request body is too large.' },
      });
    }
    if (code.startsWith('FST_ERR_CTP_') || code === 'FST_ERR_VALIDATION') {
      return reply.code(400).send({
        error: { code: 'bad_request', message: 'The request could not be processed.' },
      });
    }
    if (code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
      return reply.code(415).send({
        error: { code: 'unsupported_media_type', message: 'Expected a multipart/form-data request.' },
      });
    }

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'Unhandled server error');
      return reply.code(500).send({
        error: { code: 'internal_error', message: 'An unexpected error occurred. Please try again.' },
      });
    }

    return reply.code(statusCode).send({
      error: {
        code: 'bad_request',
        message: statusCode === 404 ? 'Not found' : 'The request could not be processed.',
      },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({
      error: { code: 'not_found', message: 'The requested resource does not exist.' },
    });
  });
};

export default fp(errorsPlugin, { name: 'esme-errors' });
