// Data files kept in the repository encrypted (AES-256-GCM): the residence directory and each
// home's charges. The key (RESIDENTS_SEED_KEY, 64 hex characters) lives only on the server, in
// Coolify; it is not in the repository. Layout, base64 of: 12-byte IV, 16-byte tag, ciphertext.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function keyFrom(keyHex: string): Buffer {
  const key = Buffer.from(keyHex.trim(), 'hex');
  if (key.length !== 32) throw new Error('RESIDENTS_SEED_KEY must be 64 hex characters.');
  return key;
}

/** Decrypts a sealed file to its text. */
export function openSealed(file: string, keyHex: string): string {
  const payload = Buffer.from(readFileSync(file, 'utf8').trim(), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', keyFrom(keyHex), payload.subarray(0, 12));
  decipher.setAuthTag(payload.subarray(12, 28));
  return Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
}

const cache = new Map<string, unknown>();

/**
 * Reads a data file from prisma/data once: `<base>.seed` when it exists and the server has the key,
 * otherwise the plain `<base>.json`. For local testing, the environment variable `testEnv` can name
 * another plain copy, which then wins. Null when none is available.
 */
export function loadDataJson<T>(base: string, testEnv: string): T | null {
  if (cache.has(base)) return cache.get(base) as T | null;
  let value: T | null = null;
  try {
    const dir = path.join(process.cwd(), 'prisma', 'data');
    const sealed = path.join(dir, `${base}.seed`);
    const plain = path.join(dir, `${base}.json`);
    const key = process.env.RESIDENTS_SEED_KEY?.trim();
    const testFile = process.env[testEnv]?.trim();
    if (testFile && existsSync(testFile)) value = JSON.parse(readFileSync(testFile, 'utf8')) as T;
    else if (key && existsSync(sealed)) value = JSON.parse(openSealed(sealed, key)) as T;
    else if (existsSync(plain)) value = JSON.parse(readFileSync(plain, 'utf8')) as T;
  } catch (err) {
    console.error(`[data] could not read ${base}:`, err instanceof Error ? err.message : err);
  }
  cache.set(base, value);
  return value;
}

/** Encrypts text into the sealed layout (one base64 line). */
export function seal(text: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyHex), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
