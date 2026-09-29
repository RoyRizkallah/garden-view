import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db';

export const publicRouter = Router();

const inquirySchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  interest: z.string().optional(),
  message: z.string().min(1),
});

publicRouter.post('/inquiries', async (req, res) => {
  const parsed = inquirySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please fill in your name, email, and message.' });
    return;
  }
  const inquiry = await prisma.inquiry.create({ data: parsed.data });
  res.status(201).json({ inquiry: { id: inquiry.id } });
});

// ---------- Residences for sale / rent ----------
// A listing is public only while building management has it APPROVED *and* it carries the owner's
// own photos; the owner taking it down (WITHDRAWN) or management moving it to any other status
// removes it at once. Only the terms, the public description, the photos and the unit's registered
// code are returned: never the owner, the account, or the private notes meant for management.
const PUBLIC_LISTING = {
  where: { status: 'APPROVED', photos: { some: {} } },
  select: {
    id: true,
    type: true,
    askingPrice: true,
    availableFrom: true,
    leaseDuration: true,
    furnished: true,
    description: true,
    updatedAt: true,
    photos: { orderBy: { order: 'asc' }, select: { url: true, width: true, height: true } },
    unit: { select: { block: true, number: true } },
  },
} as const;

type PublicRow = Awaited<ReturnType<typeof prisma.listingRequest.findMany<{ select: typeof PUBLIC_LISTING.select }>>>[number];
const toPublic = ({ unit, updatedAt, ...terms }: PublicRow) => ({
  ...terms,
  publishedAt: updatedAt,
  block: unit.block,
  unit: unit.number,
});

publicRouter.get('/listings', async (_req, res) => {
  const rows = await prisma.listingRequest.findMany({ ...PUBLIC_LISTING, orderBy: { updatedAt: 'desc' } });
  res.set('Cache-Control', 'no-cache'); // revalidate: a taken-down listing must vanish at once
  res.json({ listings: rows.map(toPublic) });
});

// One listing's page. A listing that has been taken down (or was never approved) is simply not
// found, so an old shared link can never show a home that is no longer on the market.
publicRouter.get('/listings/:id', async (req, res) => {
  const row = await prisma.listingRequest.findFirst({ where: { ...PUBLIC_LISTING.where, id: req.params.id }, select: PUBLIC_LISTING.select });
  if (!row) {
    res.status(404).json({ error: 'This listing is no longer available.' });
    return;
  }
  res.set('Cache-Control', 'no-cache'); // revalidate: a taken-down listing must vanish at once
  res.json({ listing: toPublic(row) });
});
