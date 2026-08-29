import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';

export const residentRouter = Router();

residentRouter.use(requireAuth, requireRole('RESIDENT'));

async function getUnitId(accountId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  return account?.unitId ?? null;
}

residentRouter.get('/overview', async (req, res) => {
  const unitId = await getUnitId(req.user!.accountId);
  if (!unitId) {
    res.status(400).json({ error: 'No unit linked to this account' });
    return;
  }

  const [charges, openVotes, activeRequests, projects] = await Promise.all([
    prisma.charge.findMany({ where: { unitId } }),
    prisma.vote.count({ where: { status: 'OPEN' } }),
    prisma.request.count({ where: { unitId, status: { not: 'RESOLVED' } } }),
    prisma.project.findMany({ orderBy: { createdAt: 'desc' }, take: 3 }),
  ]);

  const balance = charges.reduce((sum, c) => sum + (c.amountDue - c.amountPaid), 0);

  res.json({
    balance,
    openVotesCount: openVotes,
    activeRequestsCount: activeRequests,
    recentProjects: projects,
  });
});

residentRouter.get('/charges', async (req, res) => {
  const unitId = await getUnitId(req.user!.accountId);
  if (!unitId) {
    res.status(400).json({ error: 'No unit linked to this account' });
    return;
  }
  const charges = await prisma.charge.findMany({
    where: { unitId },
    orderBy: { dueDate: 'desc' },
  });
  res.json({ charges });
});

residentRouter.get('/projects', async (_req, res) => {
  const projects = await prisma.project.findMany({
    include: { milestones: { orderBy: { order: 'asc' } } },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ projects });
});

residentRouter.get('/votes', async (req, res) => {
  const unitId = await getUnitId(req.user!.accountId);
  const votes = await prisma.vote.findMany({
    include: { responses: true },
    orderBy: { createdAt: 'desc' },
  });

  const shaped = votes.map((v) => {
    const tally = { YES: 0, NO: 0, ABSTAIN: 0 } as Record<string, number>;
    for (const r of v.responses) tally[r.choice]++;
    const myResponse = unitId ? v.responses.find((r) => r.unitId === unitId) : undefined;
    return {
      id: v.id,
      title: v.title,
      description: v.description,
      status: v.status,
      closesAt: v.closesAt,
      tally,
      totalVotes: v.responses.length,
      myChoice: myResponse?.choice ?? null,
    };
  });

  res.json({ votes: shaped });
});

const voteChoiceSchema = z.object({ choice: z.enum(['YES', 'NO', 'ABSTAIN']) });

residentRouter.post('/votes/:voteId', async (req, res) => {
  const unitId = await getUnitId(req.user!.accountId);
  if (!unitId) {
    res.status(400).json({ error: 'No unit linked to this account' });
    return;
  }
  const parsed = voteChoiceSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Choice must be YES, NO, or ABSTAIN' });
    return;
  }

  const vote = await prisma.vote.findUnique({ where: { id: req.params.voteId } });
  if (!vote) {
    res.status(404).json({ error: 'Vote not found' });
    return;
  }
  if (vote.status !== 'OPEN') {
    res.status(400).json({ error: 'This vote is closed' });
    return;
  }

  try {
    await prisma.voteResponse.create({
      data: {
        voteId: vote.id,
        accountId: req.user!.accountId,
        unitId,
        choice: parsed.data.choice,
      },
    });
    res.json({ ok: true });
  } catch {
    res.status(409).json({ error: 'This unit has already voted' });
  }
});

residentRouter.get('/requests', async (req, res) => {
  const requests = await prisma.request.findMany({
    where: { accountId: req.user!.accountId },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ requests });
});

const newRequestSchema = z.object({
  type: z.enum(['ISSUE', 'RENOVATION']),
  category: z.string().min(1),
  description: z.string().min(1),
});

residentRouter.post('/requests', async (req, res) => {
  const unitId = await getUnitId(req.user!.accountId);
  if (!unitId) {
    res.status(400).json({ error: 'No unit linked to this account' });
    return;
  }
  const parsed = newRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing or invalid request fields' });
    return;
  }
  const request = await prisma.request.create({
    data: { ...parsed.data, unitId, accountId: req.user!.accountId },
  });
  res.status(201).json({ request });
});

residentRouter.get('/documents', async (_req, res) => {
  const documents = await prisma.document.findMany({ orderBy: { createdAt: 'desc' } });
  res.json({ documents });
});

// ---------- My Residence ----------
residentRouter.get('/residence', async (req, res) => {
  const unitId = await getUnitId(req.user!.accountId);
  if (!unitId) {
    res.status(400).json({ error: 'No unit linked to this account' });
    return;
  }
  const unit = await prisma.unit.findUnique({ where: { id: unitId } });
  if (!unit) {
    res.status(400).json({ error: 'No unit linked to this account' });
    return;
  }

  const [blockImages, listingRequests] = await Promise.all([
    prisma.blockImage.findMany({ where: { block: unit.block }, orderBy: { order: 'asc' } }),
    prisma.listingRequest.findMany({
      where: { accountId: req.user!.accountId },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  res.json({ unit, blockImages, listingRequests });
});

const listingRequestSchema = z.object({
  type: z.enum(['SALE', 'RENT']),
  askingPrice: z.number().positive().optional(),
  availableFrom: z.string().optional(),
  leaseDuration: z.string().optional(),
  furnished: z.enum(['FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED']).optional(),
  notes: z.string().optional(),
});

residentRouter.post('/listing-requests', async (req, res) => {
  const unitId = await getUnitId(req.user!.accountId);
  if (!unitId) {
    res.status(400).json({ error: 'No unit linked to this account' });
    return;
  }
  const parsed = listingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Missing or invalid listing fields' });
    return;
  }
  const { availableFrom, ...rest } = parsed.data;
  const listingRequest = await prisma.listingRequest.create({
    data: {
      ...rest,
      unitId,
      accountId: req.user!.accountId,
      availableFrom: availableFrom ? new Date(availableFrom) : null,
    },
  });
  res.status(201).json({ listingRequest });
});
