import 'dotenv/config';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { z } from 'zod';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import prismaPkg from '@prisma/client';

const { PrismaClient } = prismaPkg;

const app = express();

app.set('trust proxy', 1);

const port = Number(process.env.PORT ?? 3000);
const webOriginsRaw = process.env.WEB_ORIGINS ?? 'http://localhost:5173';
const webOrigins = webOriginsRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const prisma = new PrismaClient({
  adapter: new PrismaPg(pool),
});

const isProd = process.env.NODE_ENV === 'production';
const devAuthEnabled = process.env.DEV_AUTH === 'true';

const CSRF_COOKIE = 'csrf';
const CSRF_HEADER = 'x-csrf-token';
const SESSION_COOKIE = 'session';

function getJwtSecret() {
  const v = process.env.JWT_SECRET;
  if (!v) throw new Error('Missing env: JWT_SECRET');
  return v;
}

function signSession(payload) {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

function verifySessionToken(token) {
  return jwt.verify(token, getJwtSecret());
}

function buildCookieOptions({ httpOnly, maxAgeMs } = {}) {
  const secure = isProd;
  const sameSite = isProd ? 'none' : 'lax';

  const o = { path: '/', secure, sameSite };
  if (httpOnly) o.httpOnly = true;
  if (typeof maxAgeMs === 'number') o.maxAge = maxAgeMs;
  return o;
}

function mintCsrfToken() {
  return crypto.randomBytes(32).toString('hex');
}

function setCsrfCookie(res, token) {
  res.cookie(
    CSRF_COOKIE,
    token,
    buildCookieOptions({ httpOnly: false, maxAgeMs: 1000 * 60 * 60 * 24 }),
  );
}

function requireCsrf(req, res, next) {
  const method = (req.method || 'GET').toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ code: 'CSRF_INVALID', message: 'CSRF invalid' });
  }

  return next();
}

function requireAuth(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];
  if (!token) return res.status(401).json({ code: 'NO_SESSION', message: 'Unauthorized' });

  try {
    req.user = verifySessionToken(token);
    return next();
  } catch {
    return res.status(401).json({ code: 'SESSION_INVALID', message: 'Unauthorized' });
  }
}

app.use(helmet());
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (webOrigins.includes(origin)) return cb(null, true);
      return cb(new Error('CORS_NOT_ALLOWED'));
    },
    credentials: true,
  }),
);

app.get('/', (_req, res) => {
  res.type('text/plain').send('OK');
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

app.get('/db/health', async (_req, res, next) => {
  try {
    const rows = await prisma.$queryRaw`SELECT 1 AS ok`;
    res.json({ ok: true, db: rows });
  } catch (e) {
    next(e);
  }
});

app.get('/auth/csrf', (_req, res) => {
  const token = mintCsrfToken();
  setCsrfCookie(res, token);
  res.json({ ok: true });
});

app.use(requireCsrf);

const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

const registerBodySchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(8).max(72),
});

const loginBodySchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(72),
});

const devLoginBodySchema = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().min(1).max(80).optional(),
});

app.post('/auth/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = registerBodySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });

    const { email, name, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing)
      return res.status(409).json({ code: 'EMAIL_TAKEN', message: 'Email already in use' });

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: { email, name: name ?? null, passwordHash },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = signSession({ sub: user.id, email: user.email, role: user.role });
    res.cookie(
      SESSION_COOKIE,
      token,
      buildCookieOptions({ httpOnly: true, maxAgeMs: 1000 * 60 * 60 * 24 * 7 }),
    );

    res.json({ ok: true, user });
  } catch (e) {
    next(e);
  }
});

app.post('/auth/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = loginBodySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, name: true, role: true, passwordHash: true },
    });

    if (!user || !user.passwordHash)
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
      return res.status(401).json({ code: 'INVALID_CREDENTIALS', message: 'Invalid credentials' });

    const token = signSession({ sub: user.id, email: user.email, role: user.role });
    res.cookie(
      SESSION_COOKIE,
      token,
      buildCookieOptions({ httpOnly: true, maxAgeMs: 1000 * 60 * 60 * 24 * 7 }),
    );

    res.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (e) {
    next(e);
  }
});

app.post('/auth/dev-login', authLimiter, async (req, res, next) => {
  try {
    if (!devAuthEnabled) return res.status(404).json({ code: 'NOT_FOUND', message: 'Not found' });

    const parsed = devLoginBodySchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(422).json({ code: 'VALIDATION_ERROR', message: 'Invalid payload' });

    const { email, name } = parsed.data;

    const user = await prisma.user.upsert({
      where: { email },
      update: { name: name ?? undefined },
      create: { email, name: name ?? null },
      select: { id: true, email: true, name: true, role: true },
    });

    const token = signSession({ sub: user.id, email: user.email, role: user.role });
    res.cookie(
      SESSION_COOKIE,
      token,
      buildCookieOptions({ httpOnly: true, maxAgeMs: 1000 * 60 * 60 * 24 * 7 }),
    );

    res.json({ ok: true, user });
  } catch (e) {
    next(e);
  }
});

app.post('/auth/logout', (_req, res) => {
  res.clearCookie(SESSION_COOKIE, buildCookieOptions({ httpOnly: true }));
  res.json({ ok: true });
});

app.get('/auth/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user?.sub;

    const user = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true },
    });

    if (!user) return res.status(401).json({ code: 'USER_NOT_FOUND', message: 'Unauthorized' });

    res.json({ ok: true, user });
  } catch (e) {
    next(e);
  }
});

app.use((err, _req, res, next) => {
  void next;

  if (err && err.message === 'CORS_NOT_ALLOWED') {
    return res.status(403).json({ code: 'CORS_NOT_ALLOWED', message: 'Origin not allowed' });
  }

  return res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: isProd ? 'Internal error' : err?.message || 'Internal error',
  });
});

const server = app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});

const shutdown = async () => {
  server.close(() => {});
  await prisma.$disconnect().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
