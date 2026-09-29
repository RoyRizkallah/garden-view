// Owner photos are prepared in the browser before upload: phone photos are 3–8 MB and 4000+ px,
// far more than a listing needs. Each is turned upright (EXIF), scaled so its longest edge is at
// most 1920 px, and re-encoded as WebP (JPEG where WebP encoding isn't supported), which also
// drops the camera's metadata — including any GPS location — before it leaves the device.

export type PreparedPhoto = {
  /** Stable key for the list while the form is open. */
  key: string;
  dataUrl: string;
  width: number;
  height: number;
  /** Encoded size in bytes, for the "n MB" note. */
  bytes: number;
};

const MAX_EDGE = 1920;
const MAX_INPUT_BYTES = 40 * 1024 * 1024;
export const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export class PhotoPrepError extends Error {}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

export async function preparePhoto(file: File): Promise<PreparedPhoto> {
  if (!file.type.startsWith('image/')) throw new PhotoPrepError(`"${file.name}" is not an image.`);
  if (file.size > MAX_INPUT_BYTES) throw new PhotoPrepError(`"${file.name}" is larger than 40 MB.`);
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new PhotoPrepError(`"${file.name}" could not be opened. Try a JPEG or PNG version of it.`);
  }
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new PhotoPrepError('Your browser could not process the photo.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  let blob = await toBlob(canvas, 'image/webp', 0.82);
  // Safari before 17 silently falls back to PNG for an unsupported type: use JPEG there instead
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!blob) throw new PhotoPrepError(`"${file.name}" could not be encoded.`);
  return {
    key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
    dataUrl: await blobToDataUrl(blob),
    width,
    height,
    bytes: blob.size,
  };
}
