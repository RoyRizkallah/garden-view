import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

// ---------- Overview ----------
adminRouter.get('/overview', async (_req, res) => {
  const [units, openVotes, openRequests, newInquiries, activeProjects] = await Promise.all([
    prisma.unit.count(),
    prisma.vote.count({ where: { status: 'OPEN' } }),
    prisma.request.count({ where: { status: { not: 'RESOLVED' } } }),
    prisma.inquiry.count({ where: { status: 'NEW' } }),
    prisma.project.count({ where: { progressPct: { lt: 100 } } }),
  ]);
  res.json({ units, openVotes, openRequests, newInquiries, activeProjects });
});

// ---------- Projects ----------
adminRouter.get('/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: { milestones: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ projects });
});

const projectSchema = z.object({
  title: z.string().min(1),
  category: z.string().min(1),
  description: z.string().optional(),
  progressPct: z.number().int().min(0).max(100),
  startDate: z.string().optional(),
  eta: z.string().optional(),
  budget: z.number().positive().optional(),
  contractor: z.string().optional(),
  milestones: z.array(z.string().min(1)).optional(),
});

adminRouter.post('/projects', async (req, res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing or invalid project fields' });
    return;
  }
  const { eta, startDate, milestones, ...rest } = parsed.data;
  const project = await prisma.project.create({
    data: {
      ...rest,
      startDate: startDate ? new Date(startDate) : null,
      eta: eta ? new Date(eta) : null,
      milestones: milestones
        ? { create: milestones.map((title, order) => ({ title, order })) }
        : undefined,
    },
    include: { milestones: { orderBy: { order: 'asc' } } },
  });
  res.status(201).json({ project });
});

adminRouter.patch('/projects/:id', async (req, res) => {
  const parsed = projectSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid project fields' });
    return;
  }
  const { eta, startDate, milestones, ...rest } = parsed.data;
  const project = await prisma.project.update({
    where: { id: req.params.id },
    data: {
      ...rest,
      ...(eta !== undefined ? { eta: eta ? new Date(eta) : null } : {}),
      ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
    },
  });
  res.json({ project });
});

adminRouter.delete('/projects/:id', async (req, res) => {
  await prisma.project.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

const milestoneSchema = z.object({ title: z.string().min(1) });

adminRouter.post('/projects/:id/milestones', async (req, res) => {
  const parsed = milestoneSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Milestone title required' });
    return;
  }
  const count = await prisma.projectMilestone.count({ where: { projectId: req.params.id } });
  const milestone = await prisma.projectMilestone.create({
    data: { projectId: req.params.id, title: parsed.data.title, order: count },
  });
  res.status(201).json({ milestone });
});

adminRouter.patch('/milestones/:id', async (req, res) => {
  const parsed = z.object({ done: z.boolean() }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid milestone update' });
    return;
  }
  const milestone = await prisma.projectMilestone.update({
    where: { id: req.params.id },
    data: { done: parsed.data.done, completedAt: parsed.data.done ? new Date() : null },
  });
  res.json({ milestone });
});

// ---------- Votes ----------
adminRouter.get('/votes', async (_req, res) => {
  const votes = await prisma.vote.findMany({
    include: { responses: true },
    orderBy: { createdAt: 'desc' },
  });
  const shaped = votes.map((v) => {
    const tally = { YES: 0, NO: 0, ABSTAIN: 0 } as Record<string, number>;
    for (const r of v.responses) tally[r.choice]++;
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      status: v.status,
      closesAt: v.closesAt,
      tally,
      totalVotes: v.responses.length,
    };
  });
  res.json({ votes: shaped });
});

const voteSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  closesAt: z.string().min(1),
});

adminRouter.post('/votes', async (req, res) => {
  const parsed = voteSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing or invalid proposal fields' });
    return;
  }
  const vote = await prisma.vote.create({
    data: { ...parsed.data, closesAt: new Date(parsed.data.closesAt) },
  });
  res.status(201).json({ vote });
});

adminRouter.patch('/votes/:id/close', async (req, res) => {
  const vote = await prisma.vote.update({
    where: { id: req.params.id },
    data: { status: 'CLOSED' },
  });
  res.json({ vote });
});

// ---------- Requests (all residents) ----------
adminRouter.get('/requests', async (_req, res) => {
  const requests = await prisma.request.findMany({
    include: { unit: true, account: { select: { name: true, email: true } }, photos: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ requests });
});

const requestStatusSchema = z.object({ status: z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED']) });

adminRouter.patch('/requests/:id', async (req, res) => {
  const parsed = requestStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  const request = await prisma.request.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });
  res.json({ request });
});

// ---------- Residents directory ----------
adminRouter.get('/residents', async (_req, res) => {
  const units = await prisma.unit.findMany({
    include: { account: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: [{ block: 'asc' }, { number: 'asc' }],
  });
  res.json({ units });
});

const newAccountSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().optional(),
});

adminRouter.post('/units/:id/account', async (req, res) => {
  const parsed = newAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a valid email and a password of at least 8 characters' });
    return;
  }

  const unit = await prisma.unit.findUnique({ where: { id: req.params.id }, include: { account: true } });
  if (!unit) {
    res.status(404).json({ error: 'Unit not found' });
    return;
  }
  if (unit.account) {
    res.status(409).json({ error: 'This unit already has a portal account' });
    return;
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.account.findUnique({ where: { email } });
  if (existing) {
    res.status(409).json({ error: 'An account with this email already exists' });
    return;
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const account = await prisma.account.create({
    data: {
      email,
      passwordHash,
      name: parsed.data.name?.trim() || unit.ownerName || `Unit ${unit.block}-${unit.number} Resident`,
      role: 'RESIDENT',
      unitId: unit.id,
    },
  });

  res.status(201).json({ account: { id: account.id, name: account.name, email: account.email } });
});

const unitUpdateSchema = z.object({ floorPlanUrl: z.string().url().or(z.literal('')).optional() });

adminRouter.patch('/units/:id', async (req, res) => {
  const parsed = unitUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid unit fields' });
    return;
  }
  const unit = await prisma.unit.update({
    where: { id: req.params.id },
    data: { floorPlanUrl: parsed.data.floorPlanUrl || null },
  });
  res.json({ unit });
});

// ---------- Block images ----------
adminRouter.get('/block-images', async (_req, res) => {
  const blockImages = await prisma.blockImage.findMany({ orderBy: [{ block: 'asc' }, { order: 'asc' }] });
  res.json({ blockImages });
});

const blockImageSchema = z.object({
  block: z.string().min(1),
  url: z.string().url(),
  caption: z.string().optional(),
});

adminRouter.post('/block-images', async (req, res) => {
  const parsed = blockImageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing or invalid image fields' });
    return;
  }
  const count = await prisma.blockImage.count({ where: { block: parsed.data.block } });
  const blockImage = await prisma.blockImage.create({ data: { ...parsed.data, order: count } });
  res.status(201).json({ blockImage });
});

adminRouter.delete('/block-images/:id', async (req, res) => {
  await prisma.blockImage.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---------- Listing requests (sell / rent) ----------
adminRouter.get('/listing-requests', async (_req, res) => {
  const listingRequests = await prisma.listingRequest.findMany({
    include: { unit: true, account: { select: { name: true, email: true } }, photos: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ listingRequests });
});

const listingStatusSchema = z.object({ status: z.enum(['PENDING', 'REVIEWING', 'APPROVED', 'DECLINED', 'WITHDRAWN']) });

adminRouter.patch('/listing-requests/:id', async (req, res) => {
  const parsed = listingStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  const listingRequest = await prisma.listingRequest.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });
  res.json({ listingRequest });
});

// ---------- Charges ----------
adminRouter.get('/charges', async (_req, res) => {
  const charges = await prisma.charge.findMany({
    include: { unit: { select: { block: true, number: true } } },
    orderBy: [{ period: 'desc' }, { unit: { block: 'asc' } }, { unit: { number: 'asc' } }],
  });
  res.json({ charges });
});

const bulkChargeSchema = z.object({
  period: z.string().min(1),
  amountDue: z.number().positive(),
  dueDate: z.string().min(1),
  block: z.enum(['ALL', 'A', 'B', 'C']).default('ALL'),
});

adminRouter.post('/charges/bulk', async (req, res) => {
  const parsed = bulkChargeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing or invalid charge fields' });
    return;
  }
  const { period, amountDue, dueDate, block } = parsed.data;
  const units = await prisma.unit.findMany({ where: block === 'ALL' ? {} : { block } });
  const existing = await prisma.charge.findMany({
    where: { period, unitId: { in: units.map((u) => u.id) } },
    select: { unitId: true },
  });
  const existingIds = new Set(existing.map((c) => c.unitId));
  const toCreate = units.filter((u) => !existingIds.has(u.id));

  await prisma.charge.createMany({
    data: toCreate.map((u) => ({
      unitId: u.id,
      period,
      amountDue,
      dueDate: new Date(dueDate),
      status: 'DUE' as const,
    })),
  });

  res.status(201).json({ created: toCreate.length, skipped: units.length - toCreate.length });
});

const chargeUpdateSchema = z.object({
  amountPaid: z.number().min(0).optional(),
  amountDue: z.number().positive().optional(),
  status: z.enum(['DUE', 'PAID', 'OVERDUE']).optional(),
});

adminRouter.patch('/charges/:id', async (req, res) => {
  const parsed = chargeUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid charge update' });
    return;
  }
  const charge = await prisma.charge.update({ where: { id: req.params.id }, data: parsed.data });
  res.json({ charge });
});

adminRouter.delete('/charges/:id', async (req, res) => {
  await prisma.charge.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---------- Inquiries ----------
adminRouter.get('/inquiries', async (_req, res) => {
  const inquiries = await prisma.inquiry.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ inquiries });
});

const inquiryStatusSchema = z.object({ status: z.enum(['NEW', 'CONTACTED', 'CLOSED']) });

adminRouter.patch('/inquiries/:id', async (req, res) => {
  const parsed = inquiryStatusSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  const inquiry = await prisma.inquiry.update({
    where: { id: req.params.id },
    data: { status: parsed.data.status },
  });
  res.json({ inquiry });
});
