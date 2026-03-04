export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFound() {
  return new ApiError(404, 'NOT_FOUND', 'Not found');
}

export function unauthorized(message = 'Unauthorized') {
  return new ApiError(401, 'UNAUTHORIZED', message);
}

export function forbidden(message = 'Forbidden') {
  return new ApiError(403, 'FORBIDDEN', message);
}

export function validationError(details) {
  return new ApiError(422, 'VALIDATION_ERROR', 'Invalid payload', details);
}
