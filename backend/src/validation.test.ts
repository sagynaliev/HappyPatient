import { describe, expect, it } from 'vitest';
import { bookingSchema, officeSchema, registrationSchema, scheduleSchema, slotUpdateSchema, verificationCodeSchema } from './validation';

describe('registration validation', () => {
  it('normalizes email', () => expect(registrationSchema.parse({ email: 'USER@Example.COM', password: 'password123', firstName: 'A', lastName: 'B', iin: '123456789012' }).email).toBe('user@example.com'));
  it('rejects short passwords', () => expect(() => registrationSchema.parse({ email: 'a@b.com', password: 'short', firstName: 'A', lastName: 'B', iin: '123456789012' })).toThrow());
  it('requires an IIN with exactly 12 digits', () => {
    const base = { email: 'a@b.com', password: 'password123', firstName: 'A', lastName: 'B' };
    expect(registrationSchema.parse({ ...base, iin: '123456789012' }).iin).toBe('123456789012');
    expect(() => registrationSchema.parse({ ...base, iin: '12345678901' })).toThrow();
    expect(() => registrationSchema.parse({ ...base, iin: '12345678901a' })).toThrow();
  });
  it('accepts only six-digit recovery codes', () => {
    expect(verificationCodeSchema.parse({ email: 'a@b.com', code: '482913' }).code).toBe('482913');
    expect(() => verificationCodeSchema.parse({ email: 'a@b.com', code: '48291' })).toThrow();
    expect(() => verificationCodeSchema.parse({ email: 'a@b.com', code: '48291a' })).toThrow();
  });
});

describe('schedule validation', () => {
  it('requires a non-empty office location within the field limit', () => {
    expect(officeSchema.parse({ office: ' North Clinic ' }).office).toBe('North Clinic');
    expect(() => officeSchema.parse({ office: ' ' })).toThrow();
    expect(() => officeSchema.parse({ office: 'x'.repeat(201) })).toThrow();
  });

  it('accepts valid dates and half-hour boundaries only', () => {
    expect(scheduleSchema.parse({ date: '2099-05-10', startTime: '09:00', endTime: '10:30' }).endTime).toBe('10:30');
    expect(() => scheduleSchema.parse({ date: '2099-02-30', startTime: '09:00', endTime: '10:00' })).toThrow();
    expect(() => scheduleSchema.parse({ date: '2099-05-10', startTime: '09:15', endTime: '10:00' })).toThrow();
    expect(() => scheduleSchema.parse({ date: '2099-05-10', startTime: '10:00', endTime: '09:00' })).toThrow();
  });

  it('requires patient and purpose for booked slots', () => {
    expect(() => slotUpdateSchema.parse({ status: 'BOOKED' })).toThrow();
    expect(slotUpdateSchema.parse({ status: 'BOOKED', patientId: 'patient-1', visitPurpose: 'Consultation' }).status).toBe('BOOKED');
    expect(() => slotUpdateSchema.parse({ status: 'FREE', patientId: 'patient-1' })).toThrow();
  });

  it('requires a concise visit purpose when booking', () => {
    expect(bookingSchema.parse({ visitPurpose: 'Consultation' }).visitPurpose).toBe('Consultation');
    expect(() => bookingSchema.parse({ visitPurpose: ' ' })).toThrow();
    expect(() => bookingSchema.parse({ visitPurpose: 'x'.repeat(301) })).toThrow();
  });
});
