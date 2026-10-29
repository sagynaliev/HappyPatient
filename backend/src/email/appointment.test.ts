import { describe, expect, it } from 'vitest';
import { appointmentEmail, PatientEmailEvent } from './appointment';
const data = { doctor: 'Dr. Әлия <script>alert(1)</script>', reference: 'HP-REAL-123', startAt: new Date('2026-10-29T20:30:00Z'), reason: '<img src=x> unavailable & away' };
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
    expect(email.text).toContain('01:30 (Asia/Almaty)');
    expect(email.text).toContain(data.reference);
    expect(email.subject).toMatch(/ \| Happy Patient$/);
    if (event === 'DOCTOR_CANCELLED') {
      expect(email.html).toContain('&lt;img src=x&gt; unavailable &amp; away');
      expect(email.text).toContain('Cancelled by doctor');
    }
    if (event === 'CANCELLED') expect(email.text).toContain('Cancelled by patient');
    if (event === 'CHECKED_IN') expect(email.text).toContain('attached as a PDF');
  });
});
