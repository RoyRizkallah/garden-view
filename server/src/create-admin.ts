// Creates a building-management account (ADMIN or ACCOUNTANT) from the command line — the only
// way to make the first admin on a fresh production database. Resident accounts are then created
// by an admin in the portal (Admin -> Residents), each linked to its unit.
//
//   npm run create-admin                 (asks for everything; the password is never echoed)
//   npm run create-admin -- --role ACCOUNTANT
//
// The password is read from the terminal only, never from arguments, so it stays out of shell
// history and process listings.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import readline from 'node:readline';
import { prisma } from './db';

const MIN_PASSWORD = 12;

// One reader for the whole session (a reader per question would swallow input meant for the
// next one). While a hidden answer is typed, echo is muted.
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
let muted = false;
const out = rl as unknown as { _writeToOutput: (s: string) => void; output: NodeJS.WriteStream };
out._writeToOutput = (s: string) => {
  if (!muted) process.stdout.write(s);
};
const lines = rl[Symbol.asyncIterator]();

async function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  const next = await lines.next();
  muted = false;
  if (hidden || !process.stdin.isTTY) process.stdout.write('\n');
  if (next.done) throw new Error('Input ended before all answers were given.');
  return String(next.value).trim();
}

async function main() {
  const roleArg = process.argv.indexOf('--role');
  const role = (roleArg > -1 ? process.argv[roleArg + 1] : 'ADMIN')?.toUpperCase();
  if (role !== 'ADMIN' && role !== 'ACCOUNTANT') throw new Error('--role must be ADMIN or ACCOUNTANT');

  const email = (await ask('Email: ')).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('That is not a valid email address.');
  if (await prisma.account.findUnique({ where: { email } })) throw new Error(`An account for ${email} already exists.`);
  const name = (await ask('Full name: ')) || 'Building Management';
  const password = await ask(`Password (at least ${MIN_PASSWORD} characters): `, true);
  if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters.`);
  if ((await ask('Repeat password: ', true)) !== password) throw new Error('The passwords do not match.');

  await prisma.account.create({ data: { email, name, role, passwordHash: await bcrypt.hash(password, 12) } });
  console.log(`\nCreated ${role.toLowerCase()} account for ${email}. Sign in at /login.`);
}

main()
  .catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : err}`);
    process.exitCode = 1;
  })
  .finally(() => {
    rl.close();
    return prisma.$disconnect();
  });
