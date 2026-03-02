import 'dotenv/config';
import cors from 'cors';
import express from 'express';

const app = express();

app.set('trust proxy', 1);

const port = Number(process.env.PORT ?? 3000);
const webOriginsRaw = process.env.WEB_ORIGINS ?? 'http://localhost:5173';
const webOrigins = webOriginsRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

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

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
