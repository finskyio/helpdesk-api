import { unauthorized, forbidden } from '../lib/http-errors.js';
import { SESSION_COOKIE, verifySessionToken } from '../lib/jwt.js';

export function requireAuth(req, _res, next) {
  const token = req.cookies?.[SESSION_COOKIE];

  if (!token) return next(unauthorized('NO_SESSION'));

  try {
    const decoded = verifySessionToken(token);
    req.user = decoded;
    return next();
  } catch (e) {
    return next(e);
  }
}

export function requireRole(roles) {
  const set = new Set(Array.isArray(roles) ? roles : [roles]);

  return (req, _res, next) => {
    const role = req.user?.role;
    if (!role) return next(unauthorized('NO_USER'));
    if (!set.has(role)) return next(forbidden('INSUFFICIENT_ROLE'));
    return next();
  };
}
