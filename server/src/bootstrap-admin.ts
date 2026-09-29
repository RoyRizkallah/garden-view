// Runs at container start (deploy/docker-entrypoint.sh), after migrations. When ADMIN_EMAIL and
// ADMIN_PASSWORD are set in the environment (Coolify -> Environment Variables) and the database
// has no admin yet, it creates that first admin. It never touches an existing account, so a
// password changed later in the portal is never overwritten; once the admin exists the two
// variables can be removed. Credentials live only in the environment, never in the repository.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

const MIN_PASSWORD = 12;

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  if (await prisma.account.findFirst({ where: { role: 'ADMIN' } })) {
    console.log('[bootstrap-admin] an admin already exists; nothing to do (ADMIN_EMAIL/ADMIN_PASSWORD can be removed).');
    return;
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.warn('[bootstrap-admin] ADMIN_EMAIL is not a valid email address; no admin created.');
    return;
  }
  if (password.length < MIN_PASSWORD) {
    console.warn(`[bootstrap-admin] ADMIN_PASSWORD must be at least ${MIN_PASSWORD} characters; no admin created.`);
    return;
  }
  if (await prisma.account.findUnique({ where: { email } })) {
    console.warn(`[bootstrap-admin] ${email} already has a non-admin account; no admin created.`);
    return;
  }
  await prisma.account.create({
    data: { email, name: process.env.ADMIN_NAME?.trim() || 'Building Management', role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`[bootstrap-admin] created admin ${email}.`);
}

main()
  // a bootstrap problem must never keep the site from starting
  .catch((err) => console.error('[bootstrap-admin] failed:', err instanceof Error ? err.message : err))
  .finally(() => prisma.$disconnect());
