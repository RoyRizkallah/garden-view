// Runs at container start (deploy/docker-entrypoint.sh), after migrations. Publishes the building
// documents that ship with the code to the residents' Documents page, so nobody has to upload them
// by hand. They are kept sealed in prisma/data/documents (opened with RESIDENTS_SEED_KEY, as they
// can name people and salaries) and published under a random file name, like an admin's upload.
// Each is published once: a marker in the uploads volume records it, so a document an admin later
// deletes is not brought back by the next deploy.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './db';
import { UPLOADS_DIR } from './listingPhotos';
import { openSealed } from './sealed';

type BundledDocument = { id: string; sealed: string; title: string; category: string; publishedOn: string };

/** To publish another document with a deploy: seal it into prisma/data/documents and add a line here. */
const BUNDLED: BundledDocument[] = [
  {
    id: 'budget-2026',
    sealed: 'budget-2026.pdf.seed',
    title: 'Budget 2026 & leasehold improvements',
    category: 'Budget',
    publishedOn: '2026-11-11',
  },
];

export async function seedDocuments() {
  const key = process.env.RESIDENTS_SEED_KEY?.trim();
  if (!key) {
    console.log('[documents] RESIDENTS_SEED_KEY is not set; bundled documents not published.');
    return;
  }
  const sourceDir = path.join(process.cwd(), 'prisma', 'data', 'documents');
  const targetDir = path.join(UPLOADS_DIR, 'documents');
  await mkdir(targetDir, { recursive: true });

  for (const doc of BUNDLED) {
    const marker = path.join(targetDir, `.published-${doc.id}`);
    if (existsSync(marker)) continue;
    const source = path.join(sourceDir, doc.sealed);
    if (!existsSync(source)) {
      console.warn(`[documents] ${doc.sealed} is missing from the image; not published.`);
      continue;
    }
    if (!(await prisma.document.findFirst({ where: { title: doc.title } }))) {
      const bytes = Buffer.from(openSealed(source, key), 'base64');
      if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error(`${doc.sealed} is not a PDF.`);
      const name = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.pdf`;
      await writeFile(path.join(targetDir, name), bytes);
      await prisma.document.create({
        data: { title: doc.title, category: doc.category, fileUrl: `/uploads/documents/${name}`, createdAt: new Date(doc.publishedOn) },
      });
      console.log(`[documents] published "${doc.title}" under ${doc.category}.`);
    }
    await writeFile(marker, new Date().toISOString());
  }
}

if (require.main === module) {
  seedDocuments()
    .catch((err) => {
      // a document problem must never keep the site from starting
      console.error('[documents]', err instanceof Error ? err.message : err);
    })
    .finally(() => prisma.$disconnect());
}
