import 'dotenv/config';
import cors from 'cors';
import express from 'express';
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

app.use(express.json({ limit: '1mb' }));

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

app.get('/db/health', async (_req, res) => {
  const rows = await prisma.$queryRaw`SELECT 1 AS ok`;
  res.json({ ok: true, db: rows });
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
