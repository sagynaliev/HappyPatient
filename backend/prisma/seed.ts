import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const DOCTOR_COUNT = 300;
const CATEGORY_NAMES = [
  'Cardiology',
  'Dermatology',
  'Pediatrics',
  'Neurology',
  'Orthopedics',
  'General Practice',
  'Ophthalmology',
  'Otolaryngology (ENT)',
  'Gynecology',
  'Urology',
  'Endocrinology',
  'Gastroenterology',
  'Psychiatry',
  'Dentistry',
  'Oncology'
] as const;

type Gender = 'male' | 'female';
type GeneratedDoctor = {
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  categoryName: string;
  office: string;
  consultationFee: number;
};

const FIRST_NAMES: ReadonlyArray<{ name: string; gender: Gender }> = [
  { name: 'Aibek', gender: 'male' },
  { name: 'Alikhan', gender: 'male' },
  { name: 'Arman', gender: 'male' },
  { name: 'Askar', gender: 'male' },
  { name: 'Daniyar', gender: 'male' },
  { name: 'Dias', gender: 'male' },
  { name: 'Erlan', gender: 'male' },
  { name: 'Ilyas', gender: 'male' },
  { name: 'Marat', gender: 'male' },
  { name: 'Nurlan', gender: 'male' },
  { name: 'Ruslan', gender: 'male' },
  { name: 'Serik', gender: 'male' },
  { name: 'Timur', gender: 'male' },
  { name: 'Yermek', gender: 'male' },
  { name: 'Zhandos', gender: 'male' },
  { name: 'Aigerim', gender: 'female' },
  { name: 'Ainur', gender: 'female' },
  { name: 'Aizhan', gender: 'female' },
  { name: 'Alina', gender: 'female' },
  { name: 'Anastasia', gender: 'female' },
  { name: 'Dana', gender: 'female' },
  { name: 'Dinara', gender: 'female' },
  { name: 'Elmira', gender: 'female' },
  { name: 'Gulnaz', gender: 'female' },
  { name: 'Kamila', gender: 'female' },
  { name: 'Karina', gender: 'female' },
  { name: 'Madina', gender: 'female' },
  { name: 'Mariya', gender: 'female' },
  { name: 'Saule', gender: 'female' },
  { name: 'Zhanna', gender: 'female' }
];

const MALE_SURNAMES = [
  'Akhmetov', 'Bekov', 'Duisenov', 'Iskakov', 'Kairatov',
  'Muratov', 'Nazarov', 'Petrov', 'Sarsenov', 'Tulegenov'
];
const FEMALE_SURNAMES = [
  'Akhmetova', 'Bekova', 'Duisenova', 'Iskakova', 'Kairatova',
  'Muratova', 'Nazarova', 'Petrova', 'Sarsenova', 'Tulegenova'
];

const CATEGORY_FEES: Record<string, number> = {
  Cardiology: 20000,
  Dermatology: 14000,
  Pediatrics: 12000,
  Neurology: 19000,
  Orthopedics: 18000,
  'General Practice': 10000,
  Ophthalmology: 16000,
  'Otolaryngology (ENT)': 14000,
  Gynecology: 15000,
  Urology: 17000,
  Endocrinology: 16000,
  Gastroenterology: 17000,
  Psychiatry: 15000,
  Dentistry: 10000,
  Oncology: 25000
};

// This shared bcrypt password is for alpha testing only; never use it in production.
const DEMO_PASSWORD = 'Demo@12345';

function doctorName(index: number) {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const surnameIndex = Math.floor(index / FIRST_NAMES.length);
  const surnames = firstName.gender === 'female' ? FEMALE_SURNAMES : MALE_SURNAMES;
  return {
    firstName: firstName.name,
    lastName: surnames[surnameIndex % surnames.length]
  };
}

function doctorPhone(index: number) {
  const operator = String(700 + index).padStart(3, '0');
  return `+7 ${operator} ${String(100 + index).slice(-3)} ${String(10 + (index % 90)).padStart(2, '0')} ${String(10 + ((index * 7) % 90)).padStart(2, '0')}`;
}

function doctorOffice(index: number) {
  const floor = (Math.floor(index / 60) % 5) + 1;
  const room = (Math.floor(index / 2) % 30) + 1;
  return `Office ${floor}${String(room).padStart(2, '0')}`;
}

function prepareDoctors(): GeneratedDoctor[] {
  if (DOCTOR_COUNT % CATEGORY_NAMES.length !== 0 || DOCTOR_COUNT < CATEGORY_NAMES.length * 10) {
    throw new Error(`DOCTOR_COUNT must be divisible by ${CATEGORY_NAMES.length} and provide at least 10 doctors per category`);
  }

  const doctors: GeneratedDoctor[] = [];
  const usedEmails = new Set<string>();
  const usedPhones = new Set<string>();
  const usedFullNames = new Set<string>();

  for (let index = 0; index < DOCTOR_COUNT; index += 1) {
    const categoryName = CATEGORY_NAMES[index % CATEGORY_NAMES.length];
    const { firstName, lastName } = doctorName(index);
    const fullName = `${firstName} ${lastName}`;
    const email = `${firstName}.${lastName}@happypatient.kz`.toLowerCase();
    const phone = doctorPhone(index);
    const office = doctorOffice(index);
    const consultationFee = CATEGORY_FEES[categoryName];

    if (usedEmails.has(email)) throw new Error(`Duplicate generated email: ${email}`);
    if (usedPhones.has(phone)) throw new Error(`Duplicate generated phone: ${phone}`);
    if (usedFullNames.has(fullName)) throw new Error(`Duplicate generated full name: ${fullName}`);
    if (!Number.isInteger(consultationFee) || consultationFee < 8000 || consultationFee > 25000 || consultationFee % 500 !== 0) {
      throw new Error(`Invalid consultation fee for ${categoryName}: ${consultationFee}`);
    }

    usedEmails.add(email);
    usedPhones.add(phone);
    usedFullNames.add(fullName);
    doctors.push({ firstName, lastName, fullName, email, phone, categoryName, office, consultationFee });
  }

  return doctors;
}

async function main() {
  const doctorsToSeed = prepareDoctors();
  // Hash once and reuse the hash for all alpha-test accounts.
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const report = await prisma.$transaction(async (tx) => {
    // Preserve patients and all patient-owned data. Doctor schedules cascade from doctors.
    await tx.doctor.deleteMany({});
    await tx.user.deleteMany({ where: { role: { in: [Role.DOCTOR, Role.ADMIN] } } });
    await tx.category.deleteMany({});

    await tx.category.createMany({ data: CATEGORY_NAMES.map((name) => ({ name })) });
    const categories = await tx.category.findMany({ where: { name: { in: [...CATEGORY_NAMES] } } });
    const categoryByName = new Map(categories.map((category) => [category.name, category]));

    const userRows = doctorsToSeed.map((doctor) => ({
      email: doctor.email,
      passwordHash,
      firstName: doctor.firstName,
      lastName: doctor.lastName,
      phone: doctor.phone,
      role: Role.DOCTOR
    }));
    await tx.user.createMany({ data: userRows });
    await tx.user.create({
      data: {
        email: 'admin@happypatient.kz',
        passwordHash,
        firstName: 'System',
        lastName: 'Administrator',
        role: Role.ADMIN
      }
    });

    const seededUsers = await tx.user.findMany({
      where: { email: { in: doctorsToSeed.map((doctor) => doctor.email) }, role: Role.DOCTOR },
      select: { id: true, email: true }
    });
    const userIdByEmail = new Map(seededUsers.map((user) => [user.email, user.id]));
    const doctorRows = doctorsToSeed.map((doctor) => {
      const userId = userIdByEmail.get(doctor.email);
      const category = categoryByName.get(doctor.categoryName);
      if (!userId) throw new Error(`Missing seeded user for ${doctor.email}`);
      if (!category) throw new Error(`Missing seeded category for ${doctor.categoryName}`);
      return { userId, categoryId: category.id, office: doctor.office, consultationFee: doctor.consultationFee };
    });
    await tx.doctor.createMany({ data: doctorRows });

    const [categoryCount, doctorCount, doctorUserCount, adminUserCount, seededDoctors] = await Promise.all([
      tx.category.count(),
      tx.doctor.count(),
      tx.user.count({ where: { role: Role.DOCTOR } }),
      tx.user.count({ where: { role: Role.ADMIN } }),
      tx.doctor.findMany({
        include: {
          user: { select: { id: true, email: true, phone: true, firstName: true, lastName: true } },
          category: { select: { id: true, name: true } }
        }
      })
    ]);

    const categoryCounts = new Map<string, number>();
    const officeCounts = new Map<string, number>();
    for (const doctor of seededDoctors) {
      categoryCounts.set(doctor.category.name, (categoryCounts.get(doctor.category.name) ?? 0) + 1);
      officeCounts.set(doctor.office ?? '', (officeCounts.get(doctor.office ?? '') ?? 0) + 1);
    }
    const emails = seededDoctors.map((doctor) => doctor.user.email);
    const phones = seededDoctors.map((doctor) => doctor.user.phone).filter((phone): phone is string => phone !== null);
    const fullNames = seededDoctors.map((doctor) => `${doctor.user.firstName} ${doctor.user.lastName}`);
    const checks = [
      categoryCount === CATEGORY_NAMES.length,
      doctorCount === DOCTOR_COUNT,
      doctorUserCount === DOCTOR_COUNT,
      adminUserCount === 1,
      seededDoctors.length === DOCTOR_COUNT,
      seededDoctors.every((doctor) => Boolean(doctor.userId) && Boolean(doctor.user) && Boolean(doctor.categoryId) && Boolean(doctor.category)),
      new Set(emails).size === emails.length,
      new Set(phones).size === phones.length,
      new Set(fullNames).size === fullNames.length,
      CATEGORY_NAMES.every((name) => (categoryCounts.get(name) ?? 0) >= 10),
      [...officeCounts.values()].every((count) => count <= 2)
    ];
    if (checks.some((passed) => !passed)) {
      throw new Error(`Seed verification failed: check(s) ${checks.map((passed, index) => passed ? null : index + 1).filter(Boolean).join(', ')}`);
    }

    return {
      categoryCount,
      doctorCount,
      doctorUserCount,
      adminUserCount,
      categoryCounts,
      samples: doctorsToSeed.slice(0, 5)
    };
  }, { timeout: 30000 });

  console.log(`Total categories: ${report.categoryCount}`);
  console.log(`Total doctors: ${report.doctorCount}`);
  console.log(`Total doctor users: ${report.doctorUserCount}`);
  console.log(`Admin users: ${report.adminUserCount}`);
  console.log('Doctor count per category:');
  for (const categoryName of CATEGORY_NAMES) {
    console.log(`- ${categoryName}: ${report.categoryCounts.get(categoryName) ?? 0}`);
  }
  console.log('5 sample doctors:');
  for (const doctor of report.samples) {
    console.log(`- ${doctor.fullName} | ${doctor.email} | ${doctor.categoryName} | ${doctor.office} | ${doctor.consultationFee} KZT`);
  }
}

main()
  .catch((error) => {
    console.error('Seed failed; transaction rolled back.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
