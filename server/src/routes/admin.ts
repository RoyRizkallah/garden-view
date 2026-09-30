import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';
import { AdminFileError, removeAdminFile, saveAdminFile } from '../adminFiles';

export const adminRouter = Router();

adminRouter.use(requireAuth, requireRole('ADMIN'));

// ---------- Overview ----------
adminRouter.get('/overview', async (_req, res) => {
  const now = new Date();
  const [
    units,
    residentAccounts,
    openVotes,
    openRequests,
    inProgressRequests,
    newInquiries,
    activeProjects,
    pendingListings,
    liveListings,
    unpaid,
    latestRequests,
    latestListings,
    latestInquiries,
    closingVotes,
  ] = await Promise.all([
    prisma.unit.count(),
    prisma.account.count({ where: { role: 'RESIDENT' } }),
    prisma.vote.count({ where: { status: 'OPEN' } }),
    prisma.request.count({ where: { status: 'OPEN' } }),
    prisma.request.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.inquiry.count({ where: { status: 'NEW' } }),
    prisma.project.count({ where: { progressPct: { lt: 100 } } }),
    prisma.listingRequest.count({ where: { status: { in: ['PENDING', 'REVIEWING'] } } }),
    prisma.listingRequest.count({ where: { status: 'APPROVED', photos: { some: {} } } }),
    prisma.charge.findMany({ where: { status: { not: 'PAID' } }, select: { amountDue: true, amountPaid: true, dueDate: true } }),
    prisma.request.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 4,
      select: { id: true, type: true, category: true, createdAt: true, unit: { select: { block: true, number: true } } },
    }),
    prisma.listingRequest.findMany({
      where: { status: { in: ['PENDING', 'REVIEWING'] } },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, type: true, status: true, askingPrice: true, createdAt: true, unit: { select: { block: true, number: true } }, _count: { select: { photos: true } } },
    }),
    prisma.inquiry.findMany({
      where: { status: 'NEW' },
      orderBy: { createdAt: 'desc' },
      take: 3,
      select: { id: true, name: true, interest: true, createdAt: true },
    }),
    prisma.vote.findMany({
      where: { status: 'OPEN' },
      orderBy: { closesAt: 'asc' },
      take: 3,
      select: { id: true, title: true, closesAt: true, _count: { select: { responses: true } } },
    }),
  ]);
  const outstanding = unpaid.reduce((sum, c) => sum + Math.max(0, c.amountDue - c.amountPaid), 0);
  const overdueCharges = unpaid.filter((c) => c.dueDate < now).length;
  res.json({
    units,
    residentAccounts,
    openVotes,
    openRequests,
    inProgressRequests,
    newInquiries,
    activeProjects,
    pendingListings,
    liveListings,
    outstanding,
    overdueCharges,
    latestRequests,
    latestListings: latestListings.map(({ _count, ...l }) => ({ ...l, photoCount: _count.photos })),
    latestInquiries,
    closingVotes: closingVotes.map(({ _count, ...v }) => ({ ...v, responses: _count.responses })),
  });
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
    include: { unit: true, account: { select: { name: true, email: true } } },
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

// Give many owners portal access at once. Each row names a home without an account and the email
// to sign in with; the server makes a strong temporary password for each, and returns it once so
// management can send the sign-in details. Rows that cannot be created are reported, not fatal.
const bulkAccountsSchema = z.object({
  accounts: z
    .array(z.object({ unitId: z.string().min(1), email: z.string().email(), name: z.string().max(200).optional() }))
    .min(1)
    .max(100),
});

function temporaryPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(randomBytes(12), (b) => chars[b % chars.length]).join('');
}

adminRouter.post('/accounts/bulk', async (req, res) => {
  const parsed = bulkAccountsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Each row needs a home and a valid email' });
    return;
  }
  const results: Array<{ unitId: string; email: string; status: 'created' | 'skipped'; reason?: string; password?: string }> = [];
  const seen = new Set<string>();
  for (const row of parsed.data.accounts) {
    const email = row.email.trim().toLowerCase();
    const skip = (reason: string) => results.push({ unitId: row.unitId, email, status: 'skipped', reason });
    if (seen.has(email)) {
      skip('This email is already used for another home in this batch');
      continue;
    }
    const unit = await prisma.unit.findUnique({ where: { id: row.unitId }, include: { account: true } });
    if (!unit) {
      skip('Home not found');
      continue;
    }
    if (unit.account) {
      skip('This home already has an account');
      continue;
    }
    if (await prisma.account.findUnique({ where: { email } })) {
      skip('An account with this email already exists');
      continue;
    }
    const password = temporaryPassword();
    await prisma.account.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name: row.name?.trim() || unit.ownerName || `Residence ${unit.number}`,
        role: 'RESIDENT',
        unitId: unit.id,
      },
    });
    seen.add(email);
    results.push({ unitId: unit.id, email, status: 'created', password });
  }
  res.status(201).json({ results });
});

// A resident forgot their password: management sets a new temporary one and sends it to them.
const resetPasswordSchema = z.object({ password: z.string().min(8).max(200) });

adminRouter.post('/units/:id/account/password', async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'The new password must be at least 8 characters' });
    return;
  }
  const account = await prisma.account.findFirst({ where: { unitId: req.params.id } });
  if (!account) {
    res.status(404).json({ error: 'This home has no portal account' });
    return;
  }
  await prisma.account.update({ where: { id: account.id }, data: { passwordHash: await bcrypt.hash(parsed.data.password, 10) } });
  res.json({ ok: true, email: account.email });
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

const blockImageSchema = z
  .object({
    block: z.enum(['A', 'B', 'C']),
    url: z.string().url().optional(),
    /** an uploaded photo, resized in the browser */
    dataUrl: z.string().max(6 * 1024 * 1024).optional(),
    caption: z.string().max(140).optional(),
  })
  .refine((d) => d.url || d.dataUrl, { message: 'Add a photo or a link' });

adminRouter.post('/block-images', async (req, res) => {
  const parsed = blockImageSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing or invalid image fields' });
    return;
  }
  const { dataUrl, url, ...rest } = parsed.data;
  let stored = url ?? '';
  if (dataUrl) {
    try {
      stored = await saveAdminFile('block-photos', dataUrl);
    } catch (err) {
      res.status(400).json({ error: err instanceof AdminFileError ? err.message : 'Could not save the photo.' });
      return;
    }
  }
  const count = await prisma.blockImage.count({ where: { block: parsed.data.block } });
  const blockImage = await prisma.blockImage.create({ data: { ...rest, url: stored, order: count } });
  res.status(201).json({ blockImage });
});

adminRouter.delete('/block-images/:id', async (req, res) => {
  const image = await prisma.blockImage.delete({ where: { id: req.params.id } });
  await removeAdminFile(image.url);
  res.json({ ok: true });
});

// ---------- Building documents (bylaws, minutes, financial summaries...) ----------
adminRouter.get('/documents', async (_req, res) => {
  const documents = await prisma.document.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ documents });
});

const documentSchema = z.object({
  title: z.string().trim().min(1).max(140),
  category: z.string().trim().min(1).max(40),
  dataUrl: z.string().max(28 * 1024 * 1024),
});

adminRouter.post('/documents', async (req, res) => {
  const parsed = documentSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Add a title, a category and a file.' });
    return;
  }
  let fileUrl: string;
  try {
    fileUrl = await saveAdminFile('documents', parsed.data.dataUrl);
  } catch (err) {
    res.status(400).json({ error: err instanceof AdminFileError ? err.message : 'Could not save the file.' });
    return;
  }
  const document = await prisma.document.create({ data: { title: parsed.data.title, category: parsed.data.category, fileUrl } });
  res.status(201).json({ document });
});

adminRouter.delete('/documents/:id', async (req, res) => {
  const document = await prisma.document.findUnique({ where: { id: req.params.id } });
  if (!document) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }
  await prisma.document.delete({ where: { id: document.id } });
  await removeAdminFile(document.fileUrl);
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
