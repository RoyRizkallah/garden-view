import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { authRouter } from './routes/auth';
import { residentRouter } from './routes/resident';
import { adminRouter } from './routes/admin';
import { publicRouter } from './routes/public';

const app = express();

const isProd = process.env.NODE_ENV === 'production';
const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/;

app.use(
  cors({
    // Vite's dev port shifts (5173, 5174, 5175...) depending on what's free when it starts,
    // so in dev we allow any localhost origin rather than hardcoding one port.
    origin: isProd ? process.env.CLIENT_ORIGIN : (origin, callback) => {
      if (!origin || localhostPattern.test(origin)) callback(null, true);
      else callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api/resident', residentRouter);
app.use('/api/admin', adminRouter);
app.use('/api/public', publicRouter);

app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = process.env.PORT ?? 4000;
app.listen(PORT, () => {
  console.log(`Garden View API listening on http://localhost:${PORT}`);
});
