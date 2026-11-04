import { describe, expect, it } from 'vitest';
import { bookingSchema, doctorLocationSchema, officeSchema, registrationSchema, scheduleBatchSchema, scheduleSchema, slotUpdateSchema, verificationCodeSchema, walkInRegistrationSchema, isValidIin } from './validation';

describe('registration validation', () => {
  it('normalizes email', () => expect(registrationSchema.parse({ email: 'USER@Example.COM', password: 'password123', firstName: 'A', lastName: 'B', phone: '+7 700 123 45 67', iin: '881230500711' }).email).toBe('user@example.com'));
  it('rejects short passwords', () => expect(() => registrationSchema.parse({ email: 'a@b.com', password: 'short', firstName: 'A', lastName: 'B', phone: '+7 700 123 45 67', iin: '881230500711' })).toThrow());
  it('requires an IIN with exactly 12 digits', () => {
    const base = { email: 'a@b.com', password: 'password123', firstName: 'A', lastName: 'B', phone: '+7 700 123 45 67' };
    expect(registrationSchema.parse({ ...base, iin: '881230500711' }).iin).toBe('881230500711');
    expect(() => registrationSchema.parse({ ...base, iin: '12345678901' })).toThrow();
    expect(() => registrationSchema.parse({ ...base, iin: '12345678901a' })).toThrow();
  });
  it('verifies the IIN birth date and check digit', () => {
    const base = { email: 'a@b.com', password: 'password123', firstName: 'A', lastName: 'B', phone: '+7 700 123 45 67' };
    expect(isValidIin('990101300122')).toBe(true);
    expect(isValidIin('950515400569')).toBe(true);
    expect(isValidIin('990101300123')).toBe(false); // wrong check digit
    expect(isValidIin('123456789012')).toBe(false); // month 34
    expect(isValidIin('990231300122')).toBe(false); // 31 February
    expect(() => registrationSchema.parse({ ...base, iin: '123456789012' })).toThrow();
  });
  it('requires a valid phone number', () => {
    const base = { email: 'a@b.com', password: 'password123', firstName: 'A', lastName: 'B', iin: '881230500711' };
    expect(registrationSchema.parse({ ...base, phone: '+7 (700) 123-45-67' }).phone).toBe('+7 (700) 123-45-67');
    expect(() => registrationSchema.parse(base)).toThrow();
    expect(() => registrationSchema.parse({ ...base, phone: '12345' })).toThrow();
    expect(() => registrationSchema.parse({ ...base, phone: 'call me' })).toThrow();
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

  it('normalizes structured doctor location details and accepts missing optional components', () => {
    expect(doctorLocationSchema.parse({
      city: ' Almaty ',
      clinicName: ' Central Clinic ',
      streetAddress: ' 18 Abay Avenue ',
      officeNumber: ' Office 101 ',
    })).toEqual({
      city: 'Almaty',
      clinicName: 'Central Clinic',
      streetAddress: '18 Abay Avenue',
      officeNumber: 'Office 101',
    });
    expect(doctorLocationSchema.parse({ city: '', clinicName: null, streetAddress: null, officeNumber: null })).toEqual({
      city: null,
      clinicName: null,
      streetAddress: null,
      officeNumber: null,
    });
    expect(() => doctorLocationSchema.parse({
      city: 'A'.repeat(101),
      clinicName: null,
      streetAddress: null,
      officeNumber: null,
    })).toThrow();
  });

  it('accepts valid dates and half-hour boundaries only', () => {
    expect(scheduleSchema.parse({ date: '2099-05-10', startTime: '09:00', endTime: '10:30' }).endTime).toBe('10:30');
    expect(() => scheduleSchema.parse({ date: '2099-02-30', startTime: '09:00', endTime: '10:00' })).toThrow();
    expect(() => scheduleSchema.parse({ date: '2099-05-10', startTime: '09:15', endTime: '10:00' })).toThrow();
    expect(() => scheduleSchema.parse({ date: '2099-05-10', startTime: '10:00', endTime: '09:00' })).toThrow();
  });

  it('validates a weekly set of unique work dates and shared working hours', () => {
    expect(scheduleBatchSchema.parse({
      dates: ['2099-05-10', '2099-05-12'],
      startTime: '09:00',
      endTime: '10:30',
    }).dates).toHaveLength(2);
    expect(() => scheduleBatchSchema.parse({
      dates: ['2099-05-10', '2099-05-10'],
      startTime: '09:00',
      endTime: '10:30',
    })).toThrow();
    expect(() => scheduleBatchSchema.parse({
      dates: ['2099-05-10'],
      startTime: '09:15',
      endTime: '10:30',
    })).toThrow();
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

  it('validates walk-in registration identity and booking fields', () => {
    expect(walkInRegistrationSchema.parse({
      firstName: 'Amina',
      lastName: 'Patient',
      iin: '881230500711',
      doctorId: 'doctor-1',
      slotId: 'slot-1',
      visitPurpose: 'Walk-in consultation',
    }).iin).toBe('881230500711');
    expect(() => walkInRegistrationSchema.parse({
      firstName: 'Amina', lastName: 'Patient', iin: '123', doctorId: 'doctor-1', slotId: 'slot-1', visitPurpose: 'Visit',
    })).toThrow();
  });
});
