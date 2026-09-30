import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const doctors = [
  ['Avery', 'Stone', 'Cardiology', 'North Medical Center'],
  ['Maya', 'Chen', 'Dermatology', 'Riverside Clinic'],
  ['Noah', 'Williams', 'Pediatrics', 'Central Health Office'],
  ['Sofia', 'Martinez', 'Neurology', 'Westside Medical Center'],
  ['Liam', 'Patel', 'Family Medicine', 'Family Health Clinic']
];

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? 'admin@happypatient.test';
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
  await prisma.user.upsert({
    where: { email: adminEmail.toLowerCase() },
    update: {},
    create: { email: adminEmail.toLowerCase(), passwordHash: await bcrypt.hash(adminPassword, 12), firstName: 'System', lastName: 'Admin', role: Role.ADMIN }
  });
  for (const [firstName, lastName, specialty, office] of doctors) {
    const category = await prisma.category.upsert({ where: { name: specialty }, update: {}, create: { name: specialty } });
    const email = `${firstName}.${lastName}@happypatient.test`.toLowerCase();
    const user = await prisma.user.upsert({
      where: { email }, update: {},
      create: { email, passwordHash: await bcrypt.hash('Doctor123!', 12), firstName, lastName, role: Role.DOCTOR }
    });
    await prisma.doctor.upsert({ where: { userId: user.id }, update: { categoryId: category.id, office }, create: { userId: user.id, categoryId: category.id, office } });
  }
}
main().finally(() => prisma.$disconnect());
