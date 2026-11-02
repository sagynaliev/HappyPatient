import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import FrontDeskSlotStatus from './FrontDeskSlotStatus';
import { authApi } from '../lib/api';
vi.mock('../lib/api', () => ({ authApi: { getSchedule: vi.fn() } }));
afterEach(cleanup);
it('shows all real slot statuses with Almaty date', async () => {
  vi.mocked(authApi.getSchedule).mockResolvedValue({ doctor: { id: 'doctor', office: null, category: { name: 'Test' } }, slots: (['FREE', 'BOOKED', 'OCCUPIED'] as const).map((status, i) => ({ id: String(i), startAt: '2026-11-02T05:00:00Z', endAt: '2026-11-02T05:30:00Z', status })) });
  render(<FrontDeskSlotStatus doctorId="doctor" startAt="2026-11-02T05:00:00Z" />);
  expect(await screen.findByText('Free')).toBeInTheDocument(); expect(screen.getByText('Booked')).toBeInTheDocument(); expect(screen.getByText('Occupied')).toBeInTheDocument();
  expect(authApi.getSchedule).toHaveBeenCalledWith('doctor', '2026-11-02');
});
