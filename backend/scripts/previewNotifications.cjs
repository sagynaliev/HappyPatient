// Synthetic preview only. This script neither accesses the database nor calls Resend.
const { mkdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { tmpdir } = require('node:os');
const { appointmentEmail } = require('../dist/email/appointment');
const { registrationReceiptPdf } = require('../dist/registrationReceipt');
const output = join(tmpdir(), 'happypatient-notification-preview');
mkdirSync(output, { recursive: true });
const data = {
  id: 'DEMO-RECEIPT-001', reference: 'HP-DEMO-001', patientName: 'Әлия Қасымова (demo)',
  doctor: 'Dr. Sam Doctor (demo)', startAt: new Date('2026-10-29T20:30:00Z'),
  checkedInAt: new Date('2026-10-29T20:15:00Z'), reason: 'Doctor unavailable (demo)',
};
for (const event of ['BOOKED', 'CANCELLED', 'DOCTOR_CANCELLED', 'CHECKED_IN']) {
  const email = appointmentEmail(event, data);
  writeFileSync(join(output, `${event}.html`), email.html);
  writeFileSync(join(output, `${event}.txt`), `${email.subject}\n\n${email.text}`);
}
writeFileSync(join(output, 'registration-receipt.pdf'), registrationReceiptPdf(data));
console.log(`Synthetic HTML, text and PDF previews written to ${output}`);
