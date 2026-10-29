import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jsPDF } from 'jspdf';
import { appointmentDate, appointmentTime } from './email/appointment';
export type RegistrationReceiptData = { id: string; reference: string; patientName: string; doctor: string; startAt: Date; checkedInAt: Date };

let receiptFont: string | undefined;

/** Uses the persisted receipt and check-in timestamp; includes no clinical or payment data. */
export function registrationReceiptPdf(data: RegistrationReceiptData): Buffer {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('NotoSans.ttf', receiptFont ??= readFileSync(join(__dirname, 'assets/NotoSans-Regular.ttf')).toString('base64'));
  doc.addFont('NotoSans.ttf', 'NotoSans', 'normal');
  doc.addFont('NotoSans.ttf', 'NotoSans', 'bold');
  doc.setProperties({ title: 'Happy Patient — Visit Registration Receipt', author: 'HappyPatient', subject: 'Visit registration confirmation' });
  doc.setFillColor('#F3F6FF').rect(0, 0, 210, 297, 'F');
  doc.setFillColor('#FFFFFF').roundedRect(15, 15, 180, 267, 6, 6, 'F');
  doc.setTextColor('#2D5FF5').setFont('NotoSans', 'bold').setFontSize(24).text('+ HappyPatient', 25, 33);
  doc.setTextColor('#111D40').setFontSize(18).text('Visit Registration Receipt', 25, 51);
  doc.setFont('NotoSans', 'normal').setFontSize(11).text('Happy Patient — Visit Registration Receipt', 25, 61);
  doc.setFillColor('#EAF8EF').roundedRect(25, 71, 160, 13, 3, 3, 'F');
  doc.setTextColor('#15803D').setFont('NotoSans', 'bold').text('CHECKED IN', 31, 79);
  let y = 99;
  const rows = [['Receipt ID', data.id], ['Booking ID', data.reference], ['Patient', data.patientName], ['Doctor', data.doctor], ['Appointment date', appointmentDate(data.startAt)], ['Appointment time', `${appointmentTime(data.startAt)} (Asia/Almaty)`], ['Actual check-in', `${appointmentDate(data.checkedInAt)}, ${appointmentTime(data.checkedInAt)} (Asia/Almaty)`]];
  for (const [label, value] of rows) {
    doc.setFont('NotoSans', 'normal').setFontSize(9).setTextColor('#64748B').text(label, 25, y);
    const lines = doc.setFontSize(11).splitTextToSize(value, 155) as string[];
    doc.setTextColor('#111D40').text(lines, 25, y + 6);
    y += 13 + lines.length * 5;
  }
  doc.setFontSize(10).setTextColor('#111D40').text('Registration completed successfully.', 25, y + 4);
  doc.setTextColor('#64748B').setFontSize(9).text(['Please wait for the medical staff to call you.', 'Proof of visit registration. Not a fiscal or payment receipt.'], 25, y + 13);
  doc.setTextColor('#2D5FF5').text('Happy Patient | Your care, connected.', 25, 272);
  return Buffer.from(doc.output('arraybuffer'));
}
