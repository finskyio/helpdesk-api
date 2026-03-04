export function buildCookieOptions({ httpOnly, maxAgeMs }) {
  const isProd = process.env.NODE_ENV === 'production';
  const secure = isProd;
  const sameSite = isProd ? 'none' : 'lax';

  const base = {
    path: '/',
    secure,
    sameSite,
  };

  if (typeof maxAgeMs === 'number') base.maxAge = maxAgeMs;
  if (httpOnly) base.httpOnly = true;

  return base;
}
