import { describe, expect, it } from 'vitest';
import { appointmentEmail, PatientEmailEvent } from './appointment';
const data = { doctor: 'Dr. Әлия <script>alert(1)</script>', reference: 'HP-REAL-123', slotId: 'slot/123', startAt: new Date('2026-10-29T20:30:00Z'), endAt: new Date('2026-10-29T21:00:00Z'), office: 'Central clinic, room 4', frontendUrl: 'https://happy.example/', reason: '<img src=x> unavailable & away' };
describe('branded appointment templates', () => {
  it.each<PatientEmailEvent>(['BOOKED', 'CANCELLED', 'DOCTOR_CANCELLED', 'CHECKED_IN'])('renders %s with escaped values, real details and Almaty dates', event => {
    const email = appointmentEmail(event, data);
    expect(email.html).toContain('#2D5FF5');
    expect(email.html).toContain('#111D40');
    expect(email.html).toContain('#F3F6FF');
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
      expect(email.html).toContain('M10.5 18h4l2-3 2.8 6 2-3h4.2');
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
});


describe('appointment email links', () => {
  it('omits actions when frontend URL is not configured', () => {
    const { html, text } = appointmentEmail('BOOKED', { ...data, frontendUrl: undefined });
    expect(html).not.toContain('Manage appointment');
    expect(text).not.toContain('/appointments?appointmentId=');
  });
});
