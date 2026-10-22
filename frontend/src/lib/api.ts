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

export type Role = 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'FRONT_DESK';
export type User = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: Role;
};
export type ProfileUser = User & { maskedIin: string | null; createdAt: string };
export type ProfileUpdate = { firstName: string; lastName: string; phone: string | null };
export type Doctor = {
  id: string;
  office: string | null;
  city?: string | null;
  clinicName?: string | null;
  streetAddress?: string | null;
  officeNumber?: string | null;
  consultationFee: number;
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
  city?: string | null;
  clinicName?: string | null;
  streetAddress?: string | null;
  officeNumber?: string | null;
  consultationFee?: number;
  category: { name: string };
  user?: { firstName: string; lastName: string };
};
export type PatientAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  status: 'FREE' | 'BOOKED' | 'OCCUPIED';
  visitPurpose?: string | null;
  doctor: { name: string; specialty: string; office: string | null; consultationFee: number };
  reference?: string;
  checkedInAt?: string | null;
};
export type CancelledAppointment = {
  id: string;
  startAt: string;
  endAt: string;
  visitPurpose?: string | null;
  reason: string;
  cancelledBy: 'PATIENT' | 'CLINIC';
  createdAt: string;
  reference?: string;
  doctor: { name: string; specialty: string; office: string | null; consultationFee: number };
};
export type DoctorCancellation = { id: string; startAt: string; endAt: string; visitPurpose?: string | null; reason: string; cancelledBy: 'PATIENT' | 'CLINIC'; createdAt: string; patientName: string };
export type AvailabilityDoctor = { id: string; name: string; specialty: string; office: string | null; consultationFee: number; slots: Array<{ id: string; startAt: string; endAt: string }> };
export type FrontDeskAppointment = { id: string; startAt: string; endAt: string; status: ScheduleSlot['status']; visitPurpose?: string | null; checkedInAt?: string | null; reference: string; patient: { id: string; name: string; email: string; phone: string | null } | null; doctor: { name: string; specialty: string; office: string | null } };
export type AppNotification = { id: string; type: string; channel: string; status: string; subject: string; message: string; createdAt: string; readAt?: string | null };
export type Receipt = {
  id: string;
  reference: string;
  status: string;
  createdAt?: string;
  patientDisplayName: string;
  patientMaskedIin?: string | null;
  doctor: string;
  specialty?: string;
  consultationFee?: number;
  clinic?: string | null;
  address?: string | null;
  office?: string | null;
  visitPurpose?: string | null;
  startAt: string;
  endAt: string;
  checkedInAt?: string | null;
  checkedInBy?: string | null;
};
export type DoctorProfileDraft = {
  firstName?: string;
  lastName?: string;
  specialty?: string;
  qualification?: string;
  experience?: string;
  consultationFee?: number;
  languages?: string[];
  email?: string;
  phone?: string;
  office?: string;
  city?: string | null;
  clinicName?: string | null;
  streetAddress?: string | null;
  officeNumber?: string | null;
  bio?: string;
  license?: string;
  inPerson?: boolean;
  online?: boolean;
};
export type TimeOffRequest = {
  startDate: string;
  endDate: string;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  reason?: string;
  note?: string;
  hideFromSearch?: boolean;
};
export type RescheduleRequest = {
  newSlotId?: string;
  newDate?: string;
  newTime?: string;
  patientMessage?: string;
  sendNotification?: boolean;
};
export type AdminMetrics = {
  totalUsers: number;
  patients: number;
  doctors: number;
  admins: number;
  appointments: number;
  pendingReviews: number;
  recentUsers: Array<{ id: string; firstName: string; lastName: string; email: string; role: Role; createdAt: string }>;
};
export type AdminUserRecord = User & { maskedIin?: string | null; status?: 'active' | 'inactive'; createdAt: string; phone?: string | null };
export type AdminDoctorRecord = {
  id: string;
  name: string;
  email: string;
  specialty: string;
  office: string | null;
  status: 'verified' | 'pending' | 'needs-info' | 'rejected';
  createdAt: string;
  scheduleSlots: Array<{ startAt: string; endAt: string; status: string }>;
};
export type AuthResponse = { user: User; token: string; notification?: { channel: 'email' | 'local'; message: string } };

export const authApi = {
  login: (body: { email: string; password: string }) =>
    api<AuthResponse>('/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  register: (body: Record<string, unknown>) =>
    api<AuthResponse>('/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  doctorProfile: () => api<{ doctor: DoctorProfile }>('/doctors/me'),
  updateOffice: (office: string) => api<{ doctor: DoctorProfile }>('/doctors/me/office', { method: 'PATCH', body: JSON.stringify({ office }) }),
  updateLocation: (body: { city: string | null; clinicName: string | null; streetAddress: string | null; officeNumber: string | null }) =>
    api<{ doctor: DoctorProfile }>('/doctors/me/location', { method: 'PUT', body: JSON.stringify(body) }),
  createSchedule: (body: { date: string; startTime: string; endTime: string }) =>
    api<{ created: number }>('/doctors/me/schedule', { method: 'POST', body: JSON.stringify(body) }),
  createWorkingDays: (body: { dates: string[]; startTime: string; endTime: string }) =>
    api<{ created: number; dates: string[] }>('/doctors/me/schedule/working-days', { method: 'POST', body: JSON.stringify(body) }),
  getSchedule: (doctorId: string, date?: string) => api<{ doctor: DoctorProfile; slots: ScheduleSlot[] }>(`/doctors/${encodeURIComponent(doctorId)}/schedule${date ? `?date=${encodeURIComponent(date)}` : ""}`),
  bookSlot: (doctorId: string, slotId: string, visitPurpose: string) =>
    api<{ slot: ScheduleSlot }>(`/doctors/${encodeURIComponent(doctorId)}/schedule/${encodeURIComponent(slotId)}/book`, { method: 'POST', body: JSON.stringify({ visitPurpose }) }),
  updateSlot: (slotId: string, body: { status: ScheduleSlot['status']; patientId?: string; visitPurpose?: string; releaseBooking?: boolean; cancellationReason?: string }) =>
    api<{ slot: ScheduleSlot }>(`/doctors/me/schedule/${encodeURIComponent(slotId)}`, { method: 'PATCH', body: JSON.stringify(body) }),
  slotDetails: (slotId: string) => api<{ slot: ScheduleSlot }>(`/doctors/me/schedule/${encodeURIComponent(slotId)}`),
  me: () => api<{ user: ProfileUser }>('/me'),
  updateProfile: (body: ProfileUpdate) => api<{ user: ProfileUser }>('/me', { method: 'PATCH', body: JSON.stringify(body) }),
  myAppointments: () => api<{ appointments: PatientAppointment[]; cancelled?: CancelledAppointment[] }>('/me/appointments'),
  doctorCancellations: () => api<{ cancellations: DoctorCancellation[] }>('/doctors/me/cancellations'),
  cancelAppointment: (slotId: string, reason: string) => api<{ cancelled: boolean; reference: string }>(`/appointments/${slotId}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  checkInAppointment: (slotId: string) => api<{ checkedIn: boolean; reference: string; receipt: { id: string } }>(`/appointments/${slotId}/check-in`, { method: 'POST' }),
  receipt: (slotId: string) => api<{ receipt: Receipt }>(`/appointments/${encodeURIComponent(slotId)}/receipt`),
  notifications: () => api<{ notifications: AppNotification[]; unreadCount: number }>('/notifications'),
  markNotificationsRead: () => api<{ updated: number }>('/notifications/read-all', { method: 'POST' }),
  frontDeskLookup: (iin: string) => api<{ patient: { id: string; firstName: string; lastName: string; email: string; phone: string | null; iin: string } }>(`/front-desk/patients/lookup?iin=${encodeURIComponent(iin)}`),
  frontDeskAppointments: (query = '') => api<{ appointments: FrontDeskAppointment[] }>(`/front-desk/appointments${query ? `?q=${encodeURIComponent(query)}` : ''}`),
  frontDeskAvailability: (params: { date: string; category?: string; q?: string }) =>
    api<{ date: string; doctors: AvailabilityDoctor[] }>(`/front-desk/availability?${new URLSearchParams({ date: params.date, ...(params.category ? { category: params.category } : {}), ...(params.q ? { q: params.q } : {}) }).toString()}`),
  frontDeskSchedule: (doctorId: string, date: string) => api<{ doctor: DoctorProfile; slots: ScheduleSlot[] }>(`/doctors/${encodeURIComponent(doctorId)}/schedule?date=${encodeURIComponent(date)}`),
  frontDeskWalkIn: (body: { firstName: string; lastName: string; iin: string; email?: string; phone?: string; doctorId: string; slotId: string; visitPurpose: string }) => api<{ patient: { id: string; firstName: string; lastName: string }; slot: { id: string; status: ScheduleSlot['status'] }; reference: string }>('/front-desk/walk-ins', { method: 'POST', body: JSON.stringify(body) }),
  updateDoctorProfile: (body: DoctorProfileDraft) =>
    api<{ doctor: DoctorProfile }>('/doctors/me/profile', {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  createTimeOff: (body: TimeOffRequest) =>
    api<{ message: string }>('/doctors/me/time-off', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  rescheduleAppointment: (appointmentId: string, body: RescheduleRequest) =>
    api<{ message: string }>(`/doctors/me/appointments/${encodeURIComponent(appointmentId)}/reschedule`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  adminMetrics: () => api<AdminMetrics>('/admin/metrics'),
  adminUsers: (query?: { role?: Role; status?: string; q?: string }) =>
    api<{ users: AdminUserRecord[] }>(`/admin/users${query ? `?${new URLSearchParams({ ...(query.role ? { role: query.role } : {}), ...(query.status ? { status: query.status } : {}), ...(query.q ? { q: query.q } : {}) }).toString()}` : ''}`),
  patchAdminUser: (id: string, data: Partial<AdminUserRecord> & { role?: Role; status?: 'active' | 'inactive' }) =>
    api<{ user: AdminUserRecord }>(`/admin/users/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  adminDoctors: () => api<{ doctors: AdminDoctorRecord[] }>('/admin/doctors'),
  adminAppointments: () => api<{ appointments: Array<{ id: string; patient: string; doctor: string; specialty: string; date: string; status: string; purpose?: string | null }> }>('/admin/appointments'),
  adminApproveDoctor: (id: string, note?: string) => api<{ ok: boolean; doctor: { id: string; name: string; specialty: string; status: string; note?: string } }>(`/admin/doctors/${encodeURIComponent(id)}/approve`, { method: 'POST', body: JSON.stringify({ note }) }),
  adminRejectDoctor: (id: string, reason?: string) => api<{ ok: boolean; doctor: { id: string; name: string; specialty: string; status: string; reason?: string } }>(`/admin/doctors/${encodeURIComponent(id)}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
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
  cities: (options: RequestInit = {}) =>
    api<{ cities: string[] }>('/doctors/locations', options),
};
