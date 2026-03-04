import { ApiError } from '../lib/http-errors.js';

export function errorHandler(err, _req, res, next) {
  void next;
  const isProd = process.env.NODE_ENV === 'production';

  if (err instanceof ApiError) {
    const body = { code: err.code, message: err.message };
    if (err.details) body.details = err.details;
    return res.status(err.status).json(body);
  }

  if (err && typeof err.message === 'string' && err.message === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({ code: 'CORS_NOT_ALLOWED', message: 'Origin not allowed' });
  }

  const body = {
    code: 'INTERNAL_ERROR',
    message: isProd ? 'Internal error' : err?.message || 'Internal error',
  };

  return res.status(500).json(body);
}
