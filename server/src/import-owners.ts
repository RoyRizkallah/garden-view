// One-time / re-runnable import of the real owner directory spreadsheet into the Unit table.
// Never deletes units — only upserts, so it's safe to re-run when the source spreadsheet changes.
// Admin-only data: owner name/phone/email are never exposed outside authenticated admin routes.
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { prisma } from './db';

type OwnerRow = {
  block: string;
  number: string;
  registrationNo: string | null;
  ownerName: string | null;
  ownerPhone: string | null;
  ownerEmail: string | null;
  dataNotes: string | null;
};

async function main() {
  const xlsxPath = process.argv[2];
  if (!xlsxPath) {
    console.error('Usage: tsx src/import-owners.ts <path-to-owner-directory.xlsx>');
    process.exitCode = 1;
    return;
  }

  const scriptPath = path.join(__dirname, '..', 'scripts', 'parse_owner_directory.py');
  const output = execFileSync('python', [scriptPath, xlsxPath], { encoding: 'utf-8' });
  const rows: OwnerRow[] = JSON.parse(output);

  console.log(`Parsed ${rows.length} units from ${xlsxPath}`);

  for (const row of rows) {
    await prisma.unit.upsert({
      where: { block_number: { block: row.block, number: row.number } },
      create: row,
      update: row,
    });
  }

  const total = await prisma.unit.count();
  console.log(`Import complete. ${total} total units now on file.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
