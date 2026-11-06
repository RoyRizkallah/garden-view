// Idempotent production seed. Creates each residence and its portal login when missing.
// Existing logins keep their password, so a later deploy does not undo a password change.
// The directory and password hashes are supplied at deploy time (RESIDENTS_SEED_B64).
// They are not stored in this repository.
import 'dotenv/config';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { prisma } from './db';

type ResidentSeed = {
  block: string;
  number: string;
  registrationNo: string | null;
  sizeSqm: number | null;
  floorPlanUrl: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  dataNotes: string | null;
  account: {
    email: string;
    name: string;
    passwordHash: string;
  };
};

function seedText(): string | null {
  const b64 = process.env.RESIDENTS_SEED_B64?.trim();
  const inline = process.env.RESIDENTS_SEED_JSON?.trim();
  const fromEnvFile = process.env.RESIDENTS_SEED_FILE?.trim();
  const fallback = path.join(process.cwd(), 'prisma', 'data', 'residents.json');
  if (b64) {
    if (b64.startsWith('[')) return b64;
    const decoded = Buffer.from(b64, 'base64').toString('utf8').trim();
    if (decoded.startsWith('[')) return decoded;
    throw new Error('RESIDENTS_SEED_B64 is neither the residence JSON nor its base64 line.');
  }
  if (inline) return inline;
  if (fromEnvFile && existsSync(fromEnvFile)) return readFileSync(fromEnvFile, 'utf8');
  if (existsSync(fallback)) return readFileSync(fallback, 'utf8');
  return null;
}

function loadSeed(): ResidentSeed[] | null {
  const raw = seedText();
  if (!raw) {
    console.log(
      'Resident seed skipped. Set RESIDENTS_SEED_B64 on the server to create residence logins. That value is not stored in the repository.',
    );
    return null;
  }
  const rows = JSON.parse(raw) as ResidentSeed[];
  if (!Array.isArray(rows) || rows.length === 0) throw new Error('Resident seed is empty');
  return rows;
}

export async function seedResidents() {
  const rows = loadSeed();
  if (!rows) return;
  let accountsCreated = 0;
  let accountsUnchanged = 0;

  for (const row of rows) {
    const unit = await prisma.unit.upsert({
      where: { block_number: { block: row.block, number: row.number } },
      create: {
        block: row.block,
        number: row.number,
        registrationNo: row.registrationNo,
        sizeSqm: row.sizeSqm,
        floorPlanUrl: row.floorPlanUrl,
        ownerName: row.ownerName,
        ownerPhone: row.ownerPhone,
        ownerEmail: row.ownerEmail,
        dataNotes: row.dataNotes,
      },
      update: {
        registrationNo: row.registrationNo,
        sizeSqm: row.sizeSqm,
        floorPlanUrl: row.floorPlanUrl,
        ownerName: row.ownerName,
        ownerPhone: row.ownerPhone,
        ownerEmail: row.ownerEmail,
        dataNotes: row.dataNotes,
      },
    });

    const existing = await prisma.account.findUnique({ where: { unitId: unit.id } });
    if (existing) {
      accountsUnchanged += 1;
      continue;
    }

    const emailTaken = await prisma.account.findUnique({ where: { email: row.account.email } });
    if (emailTaken) {
      throw new Error(
        `Login ${row.account.email} already belongs to another account, so ${row.block}-${row.number} was not created.`,
      );
    }

    await prisma.account.create({
      data: {
        email: row.account.email,
        passwordHash: row.account.passwordHash,
        name: row.account.name,
        role: 'RESIDENT',
        unitId: unit.id,
      },
    });
    accountsCreated += 1;
  }

  console.log(
    `Resident seed complete. ${rows.length} residences, ${accountsCreated} logins created, ${accountsUnchanged} left unchanged.`,
  );
}

if (require.main === module) {
  seedResidents()
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      console.error('Resident seed failed. The website will still start.');
    })
    .finally(() => prisma.$disconnect());
}
