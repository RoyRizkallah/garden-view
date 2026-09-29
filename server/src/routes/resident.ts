import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAuth, requireRole } from '../auth/middleware';
import {
  MAX_LISTING_PHOTOS,
  PhotoError,
  checkListingPhotos,
  listingPhotoSchema,
  removeListingPhotos,
  saveListingPhotos,
} from '../listingPhotos';

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

  const now = new Date();
  const [charges, openVotes, requests, projects, listing, documents] = await Promise.all([
    prisma.charge.findMany({ where: { unitId }, orderBy: { dueDate: 'asc' } }),
    prisma.vote.findMany({
      where: { status: 'OPEN' },
      orderBy: { closesAt: 'asc' },
      select: { id: true, title: true, closesAt: true, responses: { where: { unitId }, select: { id: true } } },
    }),
    prisma.request.findMany({
      where: { unitId, status: { not: 'RESOLVED' } },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, type: true, category: true, status: true, updatedAt: true },
    }),
    prisma.project.findMany({ where: { progressPct: { lt: 100 } }, orderBy: { createdAt: 'desc' }, take: 3 }),
    prisma.listingRequest.findFirst({
      where: { unitId, status: { in: ['PENDING', 'REVIEWING', 'APPROVED'] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, type: true, status: true },
    }),
    prisma.document.findMany({ orderBy: { createdAt: 'desc' }, take: 3, select: { id: true, title: true, category: true, fileUrl: true, createdAt: true } }),
  ]);

  const unpaid = charges.filter((c) => c.amountDue - c.amountPaid > 0.004);
  const balance = unpaid.reduce((sum, c) => sum + (c.amountDue - c.amountPaid), 0);
  const next = unpaid[0];
  const awaiting = openVotes.filter((v) => v.responses.length === 0);

  res.json({
    balance,
    overdueCount: unpaid.filter((c) => c.dueDate < now).length,
    nextCharge: next ? { period: next.period, amount: next.amountDue - next.amountPaid, dueDate: next.dueDate } : null,
    openVotesCount: openVotes.length,
    awaitingVotes: awaiting.slice(0, 3).map(({ responses: _r, ...v }) => v),
    awaitingVotesCount: awaiting.length,
    activeRequestsCount: requests.length,
    activeRequests: requests.slice(0, 3),
    recentProjects: projects,
    listing,
    latestDocuments: documents,
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
      include: { photos: { orderBy: { order: 'asc' } } },
    }),
  ]);

  res.json({ unit, blockImages, listingRequests });
});

const listingRequestSchema = z.object({
  type: z.enum(['SALE', 'RENT']),
  askingPrice: z.number().positive().optional(),
  availableFrom: z.string().optional(),
  leaseDuration: z.string().max(40).optional(),
  furnished: z.enum(['FURNISHED', 'SEMI_FURNISHED', 'UNFURNISHED']).optional(),
  description: z.string().max(1200).optional(),
  notes: z.string().max(2000).optional(),
  photos: z.array(listingPhotoSchema).min(1).max(MAX_LISTING_PHOTOS),
});

/** A listing still in play: waiting for review, being reviewed, or live on the website. */
const OPEN_STATUSES = ['PENDING', 'REVIEWING', 'APPROVED'] as const;

residentRouter.post('/listing-requests', async (req, res) => {
  const unitId = await getUnitId(req.user!.accountId);
  if (!unitId) {
    res.status(400).json({ error: 'No unit linked to this account' });
    return;
  }
  const parsed = listingRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const photosIssue = parsed.error.issues.some((i) => i.path[0] === 'photos');
    res.status(400).json({
      error: photosIssue
        ? `Add between 1 and ${MAX_LISTING_PHOTOS} photos of your home.`
        : 'Some listing details are missing or invalid.',
    });
    return;
  }
  // one listing at a time per home: withdraw the current one before listing again
  const open = await prisma.listingRequest.findFirst({ where: { unitId, status: { in: [...OPEN_STATUSES] } } });
  if (open) {
    res.status(409).json({ error: 'Your home already has a listing in progress. Take it down first to list it again.' });
    return;
  }
  const { availableFrom, photos, ...rest } = parsed.data;
  try {
    checkListingPhotos(photos);
  } catch (err) {
    res.status(400).json({ error: err instanceof PhotoError ? err.message : 'Could not read the photos.' });
    return;
  }
  const listingRequest = await prisma.listingRequest.create({
    data: {
      ...rest,
      unitId,
      accountId: req.user!.accountId,
      availableFrom: availableFrom ? new Date(availableFrom) : null,
    },
  });
  try {
    const saved = await saveListingPhotos(listingRequest.id, photos);
    await prisma.listingPhoto.createMany({ data: saved.map((p) => ({ ...p, listingRequestId: listingRequest.id })) });
  } catch (err) {
    // never leave a listing behind without the photos it was submitted with
    await prisma.listingRequest.delete({ where: { id: listingRequest.id } });
    await removeListingPhotos(listingRequest.id);
    throw err;
  }
  const withPhotos = await prisma.listingRequest.findUnique({
    where: { id: listingRequest.id },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  res.status(201).json({ listingRequest: withPhotos });
});

// The owner can take their listing down at any time (sold, let, or changed their mind); it leaves
// the public page immediately.
residentRouter.post('/listing-requests/:id/withdraw', async (req, res) => {
  const listing = await prisma.listingRequest.findUnique({ where: { id: req.params.id } });
  if (!listing || listing.accountId !== req.user!.accountId) {
    res.status(404).json({ error: 'Listing not found' });
    return;
  }
  if (!(OPEN_STATUSES as readonly string[]).includes(listing.status)) {
    res.status(400).json({ error: 'This listing is already closed.' });
    return;
  }
  const listingRequest = await prisma.listingRequest.update({
    where: { id: listing.id },
    data: { status: 'WITHDRAWN' },
    include: { photos: { orderBy: { order: 'asc' } } },
  });
  res.json({ listingRequest });
});
