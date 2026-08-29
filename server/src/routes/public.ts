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
