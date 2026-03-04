import jwt from 'jsonwebtoken';
import { unauthorized } from './http-errors.js';

export const SESSION_COOKIE = 'session';

export function getJwtSecret() {
  const v = process.env.JWT_SECRET;
  if (!v) throw new Error('Missing env: JWT_SECRET');
  return v;
}

export function signSession(payload, opts = {}) {
  const secret = getJwtSecret();
  const expiresIn = opts.expiresIn ?? '7d';
  return jwt.sign(payload, secret, { expiresIn });
}

export function verifySessionToken(token) {
  try {
    const secret = getJwtSecret();
    return jwt.verify(token, secret);
  } catch {
    throw unauthorized('SESSION_INVALID');
  }
}
