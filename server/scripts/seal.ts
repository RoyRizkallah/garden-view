// Seals a file for the repository with the server's RESIDENTS_SEED_KEY, read from the environment
// (or server/.env). The key is never printed. Before writing, it checks the key also opens the
// existing residence directory, so a sealed file always matches the key on the server.
// JSON is sealed as its text; any other file (a PDF) as base64 of its bytes.
//
//   npx tsx scripts/seal.ts <plain file> <prisma/data/name.seed>
import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openSealed, seal } from '../src/sealed';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('usage: npx tsx scripts/seal.ts <plain file> <prisma/data/name.seed>');
  process.exit(1);
}
const key = process.env.RESIDENTS_SEED_KEY?.trim();
if (!key) {
  console.error('RESIDENTS_SEED_KEY is not set (server/.env or the environment).');
  process.exit(1);
}
const residents = path.join(process.cwd(), 'prisma', 'data', 'residents.seed');
if (existsSync(residents)) {
  try {
    openSealed(residents, key);
  } catch {
    console.error('This key does not open prisma/data/residents.seed, so it is not the server key. Nothing written.');
    process.exit(1);
  }
}
const bytes = readFileSync(input);
let text: string;
if (input.endsWith('.json')) {
  text = bytes.toString('utf8');
  JSON.parse(text); // refuse to seal a file that is not JSON
} else {
  text = bytes.toString('base64');
}
writeFileSync(output, seal(text, key) + '\n');
if (openSealed(output, key) !== text) {
  console.error('Sealed file does not read back. Nothing usable written.');
  process.exit(1);
}
console.log(`sealed ${path.basename(input)} -> ${output} (reads back with the server key)`);
