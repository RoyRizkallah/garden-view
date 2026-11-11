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
 * Reads a sealed JSON file from prisma/data once, with the server key. For local testing a plain
 * copy can be named by the environment variable `plainEnv` instead. Null when neither is available.
 */
export function loadSealedJson<T>(name: string, plainEnv: string): T | null {
  if (cache.has(name)) return cache.get(name) as T | null;
  let value: T | null = null;
  try {
    const sealed = path.join(process.cwd(), 'prisma', 'data', name);
    const key = process.env.RESIDENTS_SEED_KEY?.trim();
    const plain = process.env[plainEnv]?.trim();
    if (key && existsSync(sealed)) value = JSON.parse(openSealed(sealed, key)) as T;
    else if (plain && existsSync(plain)) value = JSON.parse(readFileSync(plain, 'utf8')) as T;
  } catch (err) {
    console.error(`[sealed] could not open ${name}:`, err instanceof Error ? err.message : err);
  }
  cache.set(name, value);
  return value;
}

/** Encrypts text into the sealed layout (one base64 line). */
export function seal(text: string, keyHex: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(keyHex), iv);
  const body = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
}
