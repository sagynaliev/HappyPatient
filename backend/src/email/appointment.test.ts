import { describe, expect, it } from 'vitest';
import { reminderEmail, appointmentEmail, PatientEmailEvent } from './appointment';
const data = { doctor: 'Dr. Әлия <script>alert(1)</script>', reference: 'HP-REAL-123', slotId: 'slot/123', startAt: new Date('2026-10-29T20:30:00Z'), endAt: new Date('2026-10-29T21:00:00Z'), office: 'Central clinic, room 4', frontendUrl: 'https://happy.example/', reason: '<img src=x> unavailable & away' };
describe('branded appointment templates', () => {
  it.each<PatientEmailEvent>(['BOOKED', 'CANCELLED', 'DOCTOR_CANCELLED', 'CHECKED_IN'])('renders %s with escaped values, real details and Almaty dates', event => {
    const email = appointmentEmail(event, data);
    expect(email.html).toContain('#2B63F6');
    expect(email.html).toContain('#101B3B');
    expect(email.html).toContain('#F2F5FC');
    expect(email.html).toContain('max-width:600px');
    expect(email.html).toContain('name="viewport"');
    expect(email.html).toContain('<!--[if mso]>');
    expect(email.html).toContain('&lt;script&gt;');
    expect(email.html).not.toContain('<script>');
    expect(email.text).toContain(data.doctor);
    expect(email.text).toContain('30 October 2026');
    expect(email.text).toContain('01:30 to 02:00 (Asia/Almaty)');
    expect(email.text).toContain(data.office);
    expect(email.text).toContain(data.reference);
    expect(email.subject).toMatch(/ \| Happy Patient$/);
    if (event === 'BOOKED') {
      expect(email.html).toContain('Manage appointment');
      expect(email.html).toContain('https://happy.example/appointments?appointmentId=slot%2F123');
      expect(email.text).toContain('Manage appointment: https://happy.example/appointments?appointmentId=slot%2F123');
      expect(email.html).toContain('&#9829;');
    }
    if (event === 'CANCELLED' || event === 'DOCTOR_CANCELLED') {
      expect(email.html).toContain('Book another appointment');
      expect(email.text).toContain('Book another appointment: https://happy.example/search');
      expect(email.html).toContain('&lt;img src=x&gt; unavailable &amp; away');
    }
    if (event === 'DOCTOR_CANCELLED') expect(email.text).toContain('Cancelled by doctor');
    if (event === 'CANCELLED') expect(email.text).toContain('Cancelled by patient');
    if (event === 'CHECKED_IN') expect(email.text).toContain('attached as a PDF');
  });

  it('uses colour by meaning: green when done, red when cancelled, blue for reminders', () => {
    expect(appointmentEmail('BOOKED', data).html).toContain('#0F8A63');
    expect(appointmentEmail('CHECKED_IN', data).html).toContain('#0F8A63');
    for (const event of ['CANCELLED', 'DOCTOR_CANCELLED'] as const) {
      const { html } = appointmentEmail(event, data);
      expect(html).toContain('#D63B42');
      expect(html).not.toContain('#0F8A63');
    }
    const reminder = reminderEmail(data).html;
    expect(reminder).toContain('Reminder');
    expect(reminder).not.toContain('#D63B42');
    expect(reminder).not.toContain('#0F8A63');
  });
});


describe('appointment email links', () => {
  it('still links to the platform when frontend URL is not configured', () => {
    const { html, text } = appointmentEmail('BOOKED', { ...data, frontendUrl: undefined });
    expect(html).toContain('Open Happy Patient');
    expect(text).toMatch(/Open Happy Patient: https?:\/\//);
  });
});

describe('reminder email', () => {
  it('carries the visit facts, escapes the doctor name and links to the booking', () => {
    const { subject, html, text } = reminderEmail({ ...data, frontendUrl: 'https://happypatient-f.onrender.com' });
    expect(subject).toContain('Reminder');
    expect(html).not.toContain('<script>');
    expect(html).toContain('Your visit is coming up');
    expect(text).toContain('Booking ID: HP-REAL-123');
    expect(text).toContain('https://happypatient-f.onrender.com/appointments?appointmentId=slot%2F123');
  });
});
