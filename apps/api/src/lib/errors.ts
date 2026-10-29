export type AppErrorCode =
  | 'validation_error'
  | 'invalid_credentials'
  | 'account_locked'
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'conflict'
  | 'recruitment_closed'
  | 'duplicate_application'
  | 'rate_limited'
  | 'payload_too_large'
  | 'unsupported_media_type'
  | 'bad_request'
  | 'internal_error'
  | 'service_unavailable';

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: AppErrorCode;
  readonly details?: { path: string; message: string }[];

  constructor(
    statusCode: number,
    code: AppErrorCode,
    message: string,
    details?: { path: string; message: string }[],
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  static unauthorized(message = 'Authentication required'): AppError {
    return new AppError(401, 'unauthorized', message);
  }

  static forbidden(message = 'You do not have permission to perform this action'): AppError {
    return new AppError(403, 'forbidden', message);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError(404, 'not_found', message);
  }

  static conflict(message: string): AppError {
    return new AppError(409, 'conflict', message);
  }

  static badRequest(message: string): AppError {
    return new AppError(400, 'bad_request', message);
  }
}
