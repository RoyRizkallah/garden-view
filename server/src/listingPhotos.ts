import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';

// Photos an owner attaches to a listing. The portal resizes and re-encodes them in the browser
// (longest edge ≤ 1920 px, WebP/JPEG), so each arrives as a data URL of a few hundred KB. Here we
// only check that the bytes really are an image of an allowed type and size, and write them to
// disk under a random name: the file name never comes from the client.

export const UPLOADS_DIR = path.resolve(__dirname, '..', 'uploads');
export const MAX_LISTING_PHOTOS = 12;
const MAX_PHOTO_BYTES = 3 * 1024 * 1024;

export const listingPhotoSchema = z.object({
  dataUrl: z.string().max(Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64),
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000),
});
export type ListingPhotoInput = z.infer<typeof listingPhotoSchema>;

const TYPES: Record<string, { ext: string; magic: (b: Buffer) => boolean }> = {
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  'image/png': { ext: 'png', magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
};

export class PhotoError extends Error {}

function decode(dataUrl: string): { bytes: Buffer; ext: string } {
  const m = /^data:(image\/(?:webp|jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new PhotoError('Photos must be JPEG, PNG or WebP images.');
  const type = TYPES[m[1]];
  const bytes = Buffer.from(m[2], 'base64');
  if (bytes.length > MAX_PHOTO_BYTES) throw new PhotoError('Each photo must be under 3 MB.');
  if (!type.magic(bytes)) throw new PhotoError('One of the files is not a valid image.');
  return { bytes, ext: type.ext };
}

/** Validates every photo first, then writes them; returns their public URLs in the given order. */
export async function saveListingPhotos(listingId: string, photos: ListingPhotoInput[]) {
  const decoded = photos.map((p) => ({ ...decode(p.dataUrl), width: p.width, height: p.height }));
  const dir = path.join(UPLOADS_DIR, 'listings', listingId);
  await mkdir(dir, { recursive: true });
  const saved = [];
  for (const [i, p] of decoded.entries()) {
    const name = `${i + 1}-${randomBytes(6).toString('hex')}.${p.ext}`;
    await writeFile(path.join(dir, name), p.bytes);
    saved.push({ url: `/uploads/listings/${listingId}/${name}`, width: p.width, height: p.height, order: i });
  }
  return saved;
}

/** Validates without writing: lets a request fail before anything is created. */
export function checkListingPhotos(photos: ListingPhotoInput[]) {
  for (const p of photos) decode(p.dataUrl);
}

export async function removeListingPhotos(listingId: string) {
  await rm(path.join(UPLOADS_DIR, 'listings', listingId), { recursive: true, force: true });
}
