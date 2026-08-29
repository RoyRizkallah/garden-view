// Seed data is test accounts and sample activity (charges, votes, requests, etc.) for
// development. It never touches the Unit table's owner data — that comes from the real
// owner directory spreadsheet via `npm run import:owners` and is never deleted here.
// This script only attaches demo accounts to whichever real units already exist.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from './db';

async function findDemoUnits(block: string, count: number) {
  const units = await prisma.unit.findMany({ where: { block }, orderBy: { number: 'asc' }, take: count });
  if (units.length < count) {
    throw new Error(
      `Need ${count} Block ${block} unit(s) but found ${units.length}. Run "npm run import:owners -- <path-to-xlsx>" before seeding.`,
    );
  }
  return units;
}

async function main() {
  console.log('Seeding database...');

  await prisma.amenityBooking.deleteMany();
  await prisma.voteResponse.deleteMany();
  await prisma.listingRequest.deleteMany();
  await prisma.blockImage.deleteMany();
  await prisma.request.deleteMany();
  await prisma.charge.deleteMany();
  await prisma.projectMilestone.deleteMany();
  await prisma.project.deleteMany();
  await prisma.vote.deleteMany();
  await prisma.document.deleteMany();
  await prisma.amenitySpace.deleteMany();
  await prisma.account.deleteMany();

  const [unitA1, unitA2] = await findDemoUnits('A', 2);
  const [unitB1] = await findDemoUnits('B', 1);
  const [unitC1] = await findDemoUnits('C', 1);

  const passwordHash = await bcrypt.hash('DevPass123!', 10);

  const resident = await prisma.account.create({
    data: {
      email: 'resident@test.gardenview.dev',
      passwordHash,
      name: 'Test Resident',
      role: 'RESIDENT',
      unitId: unitA1.id,
    },
  });
  await prisma.account.create({
    data: {
      email: 'resident2@test.gardenview.dev',
      passwordHash,
      name: 'Test Resident Two',
      role: 'RESIDENT',
      unitId: unitA2.id,
    },
  });
  await prisma.account.create({
    data: {
      email: 'resident3@test.gardenview.dev',
      passwordHash,
      name: 'Test Resident Three',
      role: 'RESIDENT',
      unitId: unitB1.id,
    },
  });
  await prisma.account.create({
    data: {
      email: 'accountant@test.gardenview.dev',
      passwordHash,
      name: 'Test Accountant',
      role: 'ACCOUNTANT',
    },
  });
  await prisma.account.create({
    data: {
      email: 'admin@test.gardenview.dev',
      passwordHash,
      name: 'Test Admin',
      role: 'ADMIN',
    },
  });

  const now = new Date();
  const months = ['2026-05', '2026-06', '2026-07', '2026-08'];
  for (const [i, period] of months.entries()) {
    await prisma.charge.create({
      data: {
        unitId: unitA1.id,
        period,
        amountDue: 450,
        amountPaid: i < 3 ? 450 : 0,
        status: i < 3 ? 'PAID' : 'DUE',
        dueDate: new Date(2026, 4 + i, 5),
      },
    });
  }

  const elevatorProject = await prisma.project.create({
    data: {
      title: 'Elevator Modernization — Block A',
      category: 'Infrastructure',
      description: 'Upgrading both Block A elevators to current safety and efficiency standards.',
      progressPct: 65,
      startDate: new Date(2026, 1, 10),
      eta: new Date(2026, 9, 15),
      budget: 38000,
      contractor: 'TechLift Co.',
    },
  });
  await prisma.projectMilestone.createMany({
    data: [
      {
        projectId: elevatorProject.id,
        title: 'Vendor selected',
        done: true,
        order: 0,
        completedAt: new Date(2026, 1, 20),
      },
      {
        projectId: elevatorProject.id,
        title: 'Parts ordered',
        done: true,
        order: 1,
        completedAt: new Date(2026, 2, 5),
      },
      { projectId: elevatorProject.id, title: 'Installation', done: false, order: 2 },
      { projectId: elevatorProject.id, title: 'Final inspection', done: false, order: 3 },
    ],
  });

  const roofProject = await prisma.project.create({
    data: {
      title: 'Rooftop Waterproofing',
      category: 'Maintenance',
      description: 'Re-sealing the rooftop membrane ahead of the winter season.',
      progressPct: 20,
      startDate: new Date(2026, 6, 15),
      eta: new Date(2026, 10, 1),
      budget: 24500,
      contractor: 'BuildCo Solutions',
    },
  });
  await prisma.projectMilestone.createMany({
    data: [
      {
        projectId: roofProject.id,
        title: 'Site assessment',
        done: true,
        order: 0,
        completedAt: new Date(2026, 6, 20),
      },
      { projectId: roofProject.id, title: 'Contractor scheduled', done: false, order: 1 },
      { projectId: roofProject.id, title: 'Waterproofing work', done: false, order: 2 },
    ],
  });

  const openVote = await prisma.vote.create({
    data: {
      title: 'Approve rooftop lounge furniture budget',
      description: 'A proposal to allocate $8,000 from the reserve fund for new rooftop seating and shade structures.',
      status: 'OPEN',
      closesAt: new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.voteResponse.create({
    data: { voteId: openVote.id, accountId: resident.id, unitId: unitA1.id, choice: 'YES' },
  });

  const closedVote = await prisma.vote.create({
    data: {
      title: 'Elect new HOA committee member',
      description: 'Vote to confirm the nominee for the vacant Block C committee seat.',
      status: 'CLOSED',
      closesAt: new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
    },
  });
  await prisma.voteResponse.createMany({
    data: [
      { voteId: closedVote.id, accountId: resident.id, unitId: unitA1.id, choice: 'YES' },
      { voteId: closedVote.id, accountId: resident.id, unitId: unitB1.id, choice: 'NO' },
      { voteId: closedVote.id, accountId: resident.id, unitId: unitC1.id, choice: 'ABSTAIN' },
    ],
  });

  await prisma.request.create({
    data: {
      type: 'ISSUE',
      category: 'Plumbing',
      description: 'Slow drain in the master bathroom sink.',
      status: 'IN_PROGRESS',
      unitId: unitA1.id,
      accountId: resident.id,
    },
  });
  await prisma.request.create({
    data: {
      type: 'RENOVATION',
      category: 'Kitchen',
      description: 'Planning a kitchen counter replacement — requesting the approved-vendor list.',
      status: 'OPEN',
      unitId: unitA1.id,
      accountId: resident.id,
    },
  });

  await prisma.document.createMany({
    data: [
      { title: 'HOA Bylaws', category: 'Governance', fileUrl: '' },
      { title: 'Building Safety Guidelines', category: 'Safety', fileUrl: '' },
      { title: '2026 Financial Summary', category: 'Financial', fileUrl: '' },
    ],
  });

  await prisma.amenitySpace.createMany({
    data: [{ name: 'Rooftop' }, { name: 'Fitness Room' }, { name: "Residents' Lounge" }],
  });

  await prisma.listingRequest.create({
    data: {
      unitId: unitB1.id,
      accountId: (await prisma.account.findUniqueOrThrow({ where: { email: 'resident3@test.gardenview.dev' } })).id,
      type: 'RENT',
      askingPrice: 1800,
      availableFrom: new Date(2026, 9, 1),
      notes: 'Relocating for work — would prefer a resident-referred tenant if possible.',
      status: 'PENDING',
    },
  });

  await prisma.inquiry.createMany({
    data: [
      {
        name: 'Jad Khoury',
        email: 'jad.khoury@example.com',
        phone: '+961 71 555 234',
        interest: 'buying',
        message: 'Interested in a 2-bedroom unit in Block A. What is currently available?',
        status: 'NEW',
      },
      {
        name: 'Lea Fakhoury',
        email: 'lea.fakhoury@example.com',
        interest: 'tour',
        message: "Could I schedule a tour of the building this week?",
        status: 'CONTACTED',
      },
      {
        name: 'Sami Abou Rjeily',
        email: 'sami.ar@example.com',
        phone: '+961 3 444 112',
        interest: 'renting',
        message: 'Looking to rent a 1-bedroom starting next month. Please advise on availability.',
        status: 'CLOSED',
      },
    ],
  });

  console.log('Seed complete.');
  console.log('Test login: resident@test.gardenview.dev / DevPass123!');
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
