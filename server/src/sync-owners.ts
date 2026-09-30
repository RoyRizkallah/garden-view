// Seeds a live Garden View site from this machine's owner directory, then gives owners portal access.
// Run from server/ with the local database up:
//
//   GV_ADMIN_EMAIL=... GV_ADMIN_PASSWORD=... npm run sync-owners -- --site https://gardenviewbuilding.com [--skip "5 A2,7 A1"] [--dry-run]
//
// 1. reads the 41 homes (with owner details) from the local database
// 2. signs in to the site as an admin and sends them to /api/admin/units/import (add/update only)
// 3. creates resident accounts for homes whose owner has an email and no account yet
//    (first email listed; an owner's second home and --skip homes are left out)
// 4. writes the sign-in details (with the temporary passwords, shown only once) to a CSV in
//    Documents\Garden View on this machine. Send each owner their own line, then delete the file.
//
// The admin password comes from the environment, never from arguments or the repository.
import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { prisma } from './db';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const EMAIL = /[^\s;,/()<>]+@[^\s;,/()<>]+\.[a-z]{2,}/gi;

async function main() {
  const site = (arg('site') ?? '').replace(/\/+$/, '');
  if (!/^https:\/\//.test(site)) throw new Error('--site must be the https:// address of the live site');
  const email = process.env.GV_ADMIN_EMAIL;
  const password = process.env.GV_ADMIN_PASSWORD;
  if (!email || !password) throw new Error('Set GV_ADMIN_EMAIL and GV_ADMIN_PASSWORD');
  const skip = new Set((arg('skip') ?? '').split(',').map((s) => s.trim()).filter(Boolean));
  const dryRun = process.argv.includes('--dry-run');

  // 1. the directory
  const units = await prisma.unit.findMany({ orderBy: [{ block: 'asc' }, { number: 'asc' }] });
  console.log(`Local directory: ${units.length} homes`);

  // 2. sign in
  const login = await fetch(`${site}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  if (!login.ok) throw new Error(`Sign-in to ${site} failed (${login.status}). Check the admin email and password.`);
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0];
  const call = async <T>(p: string, method = 'GET', body?: unknown): Promise<T> => {
    const r = await fetch(site + p, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${(json as { error?: string }).error ?? ''}`);
    return json as T;
  };

  if (!dryRun) {
    const imp = await call<{ created: number; updated: number; total: number }>('/api/admin/units/import', 'POST', {
      units: units.map((u) => ({
        block: u.block,
        number: u.number,
        registrationNo: u.registrationNo,
        sizeSqm: u.sizeSqm,
        ownerName: u.ownerName,
        ownerPhone: u.ownerPhone,
        ownerEmail: u.ownerEmail,
        dataNotes: u.dataNotes,
      })),
    });
    console.log(`Directory on the site: ${imp.created} added, ${imp.updated} updated, ${imp.total} homes in total`);
  }

  // 3. who gets an account
  const live = await call<{ units: Array<{ id: string; block: string; number: string; ownerName: string | null; ownerEmail: string | null; account: { email: string } | null }> }>('/api/admin/residents');
  const taken = new Set(live.units.filter((u) => u.account).map((u) => u.account!.email.toLowerCase()));
  const rows: Array<{ unitId: string; email: string; name?: string; number: string; owner: string }> = [];
  const left: string[] = [];
  for (const u of live.units.sort((a, b) => a.block.localeCompare(b.block) || a.number.localeCompare(b.number, undefined, { numeric: true }))) {
    if (u.account) continue;
    const first = (u.ownerEmail?.match(EMAIL) ?? [])[0]?.toLowerCase();
    if (skip.has(u.number)) left.push(`${u.number} (held back to confirm the email)`);
    else if (!first) left.push(`${u.number} (no email on file)`);
    else if (taken.has(first)) left.push(`${u.number} (same owner as another home)`);
    else {
      taken.add(first);
      rows.push({ unitId: u.id, email: first, name: u.ownerName ?? undefined, number: u.number, owner: u.ownerName ?? '' });
    }
  }
  console.log(`Accounts to create: ${rows.length}`);
  if (left.length) console.log(`Left out: ${left.join(', ')}`);
  if (dryRun || rows.length === 0) return;

  const { results } = await call<{ results: Array<{ unitId: string; email: string; status: string; reason?: string; password?: string }> }>('/api/admin/accounts/bulk', 'POST', {
    accounts: rows.map(({ unitId, email: e, name }) => ({ unitId, email: e, name })),
  });
  const created = results.filter((r) => r.status === 'created');
  for (const r of results.filter((x) => x.status !== 'created')) console.log(`Not created: ${rows.find((x) => x.unitId === r.unitId)?.number}: ${r.reason}`);

  // 4. the sign-in details, kept on this machine only
  const dir = path.join(os.homedir(), 'Documents', 'Garden View');
  // owner-only: the file holds temporary passwords
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // one file per run (date and time), never overwritten: an earlier run's passwords can't be recovered
  const file = path.join(dir, `sign-in-details-${new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-')}.csv`);
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const lines = [['Home', 'Owner', 'Sign-in email', 'Temporary password', 'Sign in at'].map(esc).join(',')];
  for (const r of created) {
    const row = rows.find((x) => x.unitId === r.unitId)!;
    lines.push([row.number, row.owner, r.email, r.password ?? '', `${site}/login`].map(esc).join(','));
  }
  writeFileSync(file, '﻿' + lines.join('\r\n'), { encoding: 'utf-8', mode: 0o600, flag: 'wx' });
  console.log(`Created ${created.length} accounts. Sign-in details saved to ${file}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
