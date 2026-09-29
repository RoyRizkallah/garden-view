import { randomBytes } from 'node:crypto';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS_DIR } from './listingPhotos';

// Files building management uploads from the admin portal: block photos (already resized in the
// browser) and building documents (PDFs or images). They arrive as data URLs; the bytes are
// checked against the claimed type and written under a random name — the client never chooses
// a path. Served from /uploads like the owners' listing photos.

export type AdminFileKind = 'block-photos' | 'documents';

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'application/pdf': { ext: 'pdf', magic: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
};

const LIMITS: Record<AdminFileKind, { bytes: number; types: string[] }> = {
  'block-photos': { bytes: 4 * 1024 * 1024, types: ['image/webp', 'image/jpeg', 'image/png'] },
  documents: { bytes: 20 * 1024 * 1024, types: ['application/pdf', 'image/webp', 'image/jpeg', 'image/png'] },
};

export class AdminFileError extends Error {}

/** Validates and stores one file; returns its public URL ("/uploads/<kind>/<name>"). */
export async function saveAdminFile(kind: AdminFileKind, dataUrl: string): Promise<string> {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  const limit = LIMITS[kind];
  if (!m || !limit.types.includes(m[1])) {
    throw new AdminFileError(kind === 'documents' ? 'Documents must be PDF, JPEG, PNG or WebP files.' : 'Photos must be JPEG, PNG or WebP images.');
  }
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > limit.bytes) throw new AdminFileError(`The file is larger than ${limit.bytes / 1024 / 1024} MB.`);
  const type = TYPES[m[1]];
  if (!type.magic(bytes)) throw new AdminFileError('The file does not match its type.');
  const dir = path.join(UPLOADS_DIR, kind);
  await mkdir(dir, { recursive: true });
  const name = `${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.${type.ext}`;
  await writeFile(path.join(dir, name), bytes);
  return `/uploads/${kind}/${name}`;
}

/** Removes a file this module stored; anything else (an external URL) is left alone. */
export async function removeAdminFile(url: string) {
  const m = /^\/uploads\/(block-photos|documents)\/([\w.-]+)$/.exec(url);
  if (!m) return;
  await rm(path.join(UPLOADS_DIR, m[1], m[2]), { force: true });
}
