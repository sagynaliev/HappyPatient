import { describe, expect, it } from 'vitest';
import { registrationReceiptPdf } from './registrationReceipt';

export const receiptData = { id: 'receipt-db-456', reference: 'HP-BOOKING-123', patientName: 'Әлия Қасымова', doctor: 'Dr. Sam Doctor', startAt: new Date('2026-10-29T20:30:00Z'), checkedInAt: new Date('2026-10-29T20:15:00Z') };
export async function readPdf(buffer: Buffer) {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = getDocument({ data: new Uint8Array(buffer), useSystemFonts: false });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const content = await page.getTextContent();
  const text = content.items.map(item => 'str' in item ? item.str : '').join(' ');
  const pages = pdf.numPages;
  await task.destroy();
  return { text, pages };
}
describe('visit registration PDF', () => {
  it('is a valid PDF with actual data, Cyrillic names and Almaty check-in time', async () => {
    const buffer = registrationReceiptPdf(receiptData);
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    const { text, pages } = await readPdf(buffer);
    expect(pages).toBe(1);
    for (const value of [receiptData.id, receiptData.reference, receiptData.patientName, receiptData.doctor, '30 October 2026', '01:30', '01:15', 'Asia/Almaty', 'CHECKED IN', 'Registration completed successfully.']) expect(text).toContain(value);
    expect(text).not.toMatch(/KZT|TOTAL|tax|Payment at|Purpose/);
  });
});
