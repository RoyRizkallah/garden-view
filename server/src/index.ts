import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { authRouter } from './routes/auth';
import { residentRouter } from './routes/resident';
import { adminRouter } from './routes/admin';
import { publicRouter } from './routes/public';
import { UPLOADS_DIR } from './listingPhotos';

const app = express();
// behind the Caddy reverse proxy in production: trust its X-Forwarded-* headers
app.set('trust proxy', 1);
app.disable('x-powered-by');

const isProd = process.env.NODE_ENV === 'production';
const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(
  cors({
    // In production the site and the API share one origin, so no cross-origin access is needed
    // at all (CLIENT_ORIGIN can open it to one extra origin). Vite's dev port shifts (5173,
    // 5174, 5175...), so in dev we allow any localhost origin rather than hardcoding one port.
    origin: isProd ? process.env.CLIENT_ORIGIN || false : (origin, callback) => {
      if (!origin || localhostPattern.test(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);
// a listing arrives with its photos (resized in the browser to a few hundred KB each)
app.use('/api/resident/listing-requests', express.json({ limit: '40mb' }));
// building documents (PDFs up to 20 MB) and block photos, as data URLs
app.use(['/api/admin/documents', '/api/admin/block-images'], express.json({ limit: '30mb' }));
app.use(express.json());
app.use(cookieParser());

// owner-uploaded listing photos; names are random and never reused, so they can be cached hard
app.use(
  '/uploads',
  express.static(UPLOADS_DIR, {
    fallthrough: false, // a missing photo is a 404, not the app shell
    immutable: true,
    maxAge: '365d',
    setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
  }),
);

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/resident', residentRouter);
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// In production the same process serves the built website (web/dist), so the site and the API
// share one origin. Hashed build assets are immutable; photos and films change only on a
// rebuild; index.html is always revalidated so a deploy is picked up at once. Any other path is
// a client-side route and gets the app shell.
const WEB_DIST = process.env.WEB_DIST;
if (WEB_DIST && existsSync(path.join(WEB_DIST, 'index.html'))) {
  app.use('/assets', express.static(path.join(WEB_DIST, 'assets'), { immutable: true, maxAge: '365d', fallthrough: false }));
  app.use(express.static(WEB_DIST, {
    index: false,
    maxAge: '30d',
    setHeaders: (res, file) => {
      if (file.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache');
    },
  }));
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(WEB_DIST, 'index.html'));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Garden View API listening on http://localhost:${PORT}`);
});
