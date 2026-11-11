// Runs at container start (deploy/docker-entrypoint.sh), after migrations. Publishes the building
// documents that ship with the code to the residents' Documents page, so nobody has to upload them
// by hand. Each is in prisma/data/documents as `<id>.pdf` (or a sealed `<id>.pdf.seed` when the
// server has RESIDENTS_SEED_KEY) and is published under a random file name, like an admin's upload;
// /uploads/documents is only served to signed-in residents and management. Each is published once:
// a marker in the uploads volume records it, so a document an admin later deletes is not brought
// back by the next deploy.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { prisma } from './db';
import { UPLOADS_DIR } from './listingPhotos';
import { openSealed } from './sealed';

type BundledDocument = { id: string; title: string; category: string; publishedOn: string };

/** To publish another document with a deploy: add `<id>.pdf` to prisma/data/documents and a line here. */
const BUNDLED: BundledDocument[] = [
  {
    id: 'budget-2026',
    title: 'Budget 2026 & leasehold improvements',
    category: 'Budget',
    publishedOn: '2026-11-11',
  },
];

/** the document's bytes: the sealed copy when there is one and a key, otherwise the plain PDF */
async function readBundled(sourceDir: string, id: string): Promise<Buffer | null> {
  const sealed = path.join(sourceDir, `${id}.pdf.seed`);
  const plain = path.join(sourceDir, `${id}.pdf`);
  const key = process.env.RESIDENTS_SEED_KEY?.trim();
  if (key && existsSync(sealed)) return Buffer.from(openSealed(sealed, key), 'base64');
  if (existsSync(plain)) return readFile(plain);
  return null;
}

export async function seedDocuments() {
  const sourceDir = path.join(process.cwd(), 'prisma', 'data', 'documents');
  const targetDir = path.join(UPLOADS_DIR, 'documents');
  await mkdir(targetDir, { recursive: true });

  for (const doc of BUNDLED) {
    const marker = path.join(targetDir, `.published-${doc.id}`);
    if (existsSync(marker)) continue;
    if (!(await prisma.document.findFirst({ where: { title: doc.title } }))) {
      const bytes = await readBundled(sourceDir, doc.id);
      if (!bytes) {
        console.warn(`[documents] ${doc.id}.pdf is missing from the image; not published.`);
        continue;
      }
      if (bytes.subarray(0, 5).toString('ascii') !== '%PDF-') throw new Error(`${doc.id} is not a PDF.`);
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
