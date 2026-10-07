const API_URL = import.meta.env.VITE_API_URL || '/api';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: Array<{ path: string[]; message: string }>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('hp_token');
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error || 'Something went wrong. Please try again.',
      data.details,
    );
  }
  return data as T;
}

export type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN';
export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: Role;
};
export type Doctor = {
  id: string;
  office: string | null;
  category: { id: string; name: string };
  user: { firstName: string; lastName: string; email: string };
  scheduleSlots: Array<{ id: string; startAt: string; endAt: string }>;
};
export type ScheduleSlot = {
  id: string;
  startAt: string;
  endAt: string;
  status: 'FREE' | 'BOOKED' | 'OCCUPIED';
  visitPurpose?: string | null;
  patient?: { id: string; firstName: string; lastName: string; email?: string } | null;
};
export type DoctorProfile = {
  id: string;
  office: string | null;
  category: { name: string };
  user?: { firstName: string; lastName: string };
};
export type AuthResponse = { user: User; token: string; notification?: { channel: 'email' | 'local'; message: string } };

export const authApi = {
  login: (body: { email: string; password: string }) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: Record<string, unknown>) =>
    api<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  doctorProfile: () => api<{ doctor: DoctorProfile }>('/doctors/me'),
  updateOffice: (office: string) => api<{ doctor: DoctorProfile }>('/doctors/me/office', { method: 'PATCH', body: JSON.stringify({ office }) }),
  createSchedule: (body: { date: string; startTime: string; endTime: string }) =>
    api<{ created: number }>('/doctors/me/schedule', { method: 'POST', body: JSON.stringify(body) }),
  createWorkingDays: (body: { dates: string[]; startTime: string; endTime: string }) =>
    api<{ created: number; dates: string[] }>('/doctors/me/schedule/working-days', { method: 'POST', body: JSON.stringify(body) }),
  getSchedule: (doctorId: string, date: string) => api<{ doctor: DoctorProfile; slots: ScheduleSlot[] }>(`/doctors/${encodeURIComponent(doctorId)}/schedule?date=${encodeURIComponent(date)}`),
  bookSlot: (doctorId: string, slotId: string, visitPurpose: string) =>
    api<{ slot: ScheduleSlot }>(`/doctors/${encodeURIComponent(doctorId)}/schedule/${encodeURIComponent(slotId)}/book`, { method: 'POST', body: JSON.stringify({ visitPurpose }) }),
  updateSlot: (slotId: string, body: { status: ScheduleSlot['status']; patientId?: string; visitPurpose?: string }) =>
    api<{ slot: ScheduleSlot }>(`/doctors/me/schedule/${encodeURIComponent(slotId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  slotDetails: (slotId: string) => api<{ slot: ScheduleSlot }>(`/doctors/me/schedule/${encodeURIComponent(slotId)}`),
  me: () => api<{ user: User }>('/me'),
  forgot: (email: string) =>
    api<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
  verifyResetCode: (email: string, code: string) =>
    api<{ resetToken: string }>('/auth/verify-reset-code', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    }),
  reset: (body: { token: string; password: string }) =>
    api<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
};

export const doctorDirectoryApi = {
  locations: (options: RequestInit = {}) =>
    api<{ locations: string[] }>('/doctors/locations', options),
};
