import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { signToken } from '../auth/jwt';
import { requireAuth } from '../auth/middleware';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

function serializeAccount(account: {
  id: string;
  name: string;
  email: string;
  role: string;
  unit: { block: string; number: string } | null;
}) {
  return {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.role,
    unit: account.unit ? { block: account.unit.block, number: account.unit.number } : null,
  };
}

authRouter.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a valid email and password' });
    return;
  }
  const { email, password } = parsed.data;

  const account = await prisma.account.findUnique({
    where: { email: email.toLowerCase() },
    include: { unit: true },
  });
  if (!account) {
    res.status(401).json({ error: 'Incorrect email or password' });
    return;
  }

  const valid = await bcrypt.compare(password, account.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Incorrect email or password' });
    return;
  }

  const token = signToken({ accountId: account.id, role: account.role, unitId: account.unitId });
  res.cookie('gv_session', token, COOKIE_OPTS);
  res.json({ account: serializeAccount(account) });
});

authRouter.post('/logout', (_req, res) => {
  res.clearCookie('gv_session');
  res.json({ ok: true });
});

authRouter.get('/me', requireAuth, async (req, res) => {
  const account = await prisma.account.findUnique({
    where: { id: req.user!.accountId },
    include: { unit: true },
  });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }
  res.json({ account: serializeAccount(account) });
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.patch('/password', requireAuth, async (req, res) => {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'New password must be at least 8 characters' });
    return;
  }

  const account = await prisma.account.findUnique({ where: { id: req.user!.accountId } });
  if (!account) {
    res.status(404).json({ error: 'Account not found' });
    return;
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, account.passwordHash);
  if (!valid) {
    res.status(401).json({ error: 'Current password is incorrect' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.account.update({ where: { id: account.id }, data: { passwordHash } });
  res.json({ ok: true });
});
