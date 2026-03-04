import crypto from 'crypto';
import { forbidden } from './http-errors.js';
import { buildCookieOptions } from './cookies.js';

export const CSRF_COOKIE = 'csrf';
export const CSRF_HEADER = 'x-csrf-token';

export function mintCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function setCsrfCookie(res, token) {
  res.cookie(
    CSRF_COOKIE,
    token,
    buildCookieOptions({ httpOnly: false, maxAgeMs: 1000 * 60 * 60 * 24 }),
  );
}

export function requireCsrf(req, _res, next) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return next(forbidden('CSRF_INVALID'));
  }

  return next();
}
