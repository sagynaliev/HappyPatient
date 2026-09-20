import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const doctors = [
  ['Avery', 'Stone', 'Cardiology', 'Heart and vascular wellness'],
  ['Maya', 'Chen', 'Dermatology', 'Evidence-based skin care'],
  ['Noah', 'Williams', 'Pediatrics', 'Compassionate care for children'],
  ['Sofia', 'Martinez', 'Neurology', 'Personalized neurological care'],
  ['Liam', 'Patel', 'Family Medicine', 'Whole-family primary care']
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@happypatient.test';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {},
    create: { email: adminEmail.toLowerCase(), passwordHash: await bcrypt.hash(adminPassword, 12), firstName: 'System', lastName: 'Admin', role: Role.ADMIN }
  });
  for (const [firstName, lastName, specialty] of doctors) {
    const category = await prisma.category.upsert({ where: { name: specialty }, update: {}, create: { name: specialty } });
    const email = `${firstName}.${lastName}@happypatient.test`.toLowerCase();
    const user = await prisma.user.upsert({
      where: { email }, update: {},
      create: { email, passwordHash: await bcrypt.hash('Doctor123!', 12), firstName, lastName, role: Role.DOCTOR }
    });
    await prisma.doctor.upsert({ where: { userId: user.id }, update: { categoryId: category.id }, create: { userId: user.id, categoryId: category.id } });
  }
}
main().finally(() => prisma.$disconnect());
