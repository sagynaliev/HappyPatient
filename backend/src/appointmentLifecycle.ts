import { prisma } from './prisma';

export async function releaseUnattendedSlots(now = new Date()) {
  const cutoff = new Date(now.getTime() - 10 * 60_000);
  return prisma.scheduleSlot.updateMany({
    where: { status: 'BOOKED', startAt: { lte: cutoff } },
    data: { status: 'FREE', patientId: null, visitPurpose: null },
  });
}
