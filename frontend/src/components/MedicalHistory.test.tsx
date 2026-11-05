import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MedicalHistory, { MedicalNoteForm, MedicalEntry } from './MedicalHistory';
import { api } from '../lib/api';
vi.mock('../lib/api', () => ({ api: vi.fn() }));
afterEach(cleanup);
const entry: MedicalEntry = { id: '1', category: 'test', title: 'Blood test', body: 'First line\nSecond line <script>', createdAt: '2026-11-02T05:00:00Z', updatedAt: '2026-11-02T05:00:00Z', doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } };
beforeEach(() => vi.resetAllMocks());
describe('medical history shared doctor/patient view', () => {
  it('shows loading skeletons', () => { vi.mocked(api).mockReturnValue(new Promise(() => {})); render(<MedicalHistory />); expect(screen.getByRole('status')).toHaveTextContent('Loading'); expect(document.querySelector('.skeleton')).not.toBeNull(); });
  it('shows empty state and patient read-only view', async () => { vi.mocked(api).mockResolvedValue({ entries: [], hasMore: false, counts: {} }); render(<MedicalHistory />); expect(await screen.findByText(/No medical records yet/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull(); });
  it('retries a generic error', async () => { vi.mocked(api).mockRejectedValueOnce(new Error('private info')).mockResolvedValueOnce({ entries: [], hasMore: false, counts: {} }); render(<MedicalHistory />); expect(await screen.findByRole('alert')).not.toHaveTextContent('private info'); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(await screen.findByText(/No medical records yet/)).toBeInTheDocument(); });
  it('filters with counts, shows text safely, uses Almaty time', async () => { vi.mocked(api).mockImplementation((path) => Promise.resolve({ entries: path.includes('category=test') ? [entry] : [entry, { ...entry, id: '2', category: 'conclusion', title: 'Conclusion' }], hasMore: false, counts: { test: 1, conclusion: 1 } })); render(<MedicalHistory />); expect(await screen.findByText('Blood test')).toBeInTheDocument(); expect(screen.getAllByText(/10:00/)).toHaveLength(2); fireEvent.click(screen.getByRole('button', { name: 'Tests (1)' })); expect(await screen.findByRole('button', { name: 'Tests (1)' })).toHaveAttribute('aria-pressed', 'true'); await waitFor(() => expect(screen.queryByRole('heading', { name: 'Conclusion' })).toBeNull()); expect(screen.getByText(/Second line <script>/)).toBeInTheDocument(); expect(document.querySelector('script')).toBeNull(); });
  it('validates form before submitting and supports cancel', () => { const cancel = vi.fn(); render(<MedicalNoteForm appointmentId="visit" onSave={vi.fn()} onCancel={cancel} />); fireEvent.click(screen.getByRole('button', { name: 'Save note' })); expect(screen.getByRole('alert')).toHaveTextContent('Enter a title'); expect(api).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(cancel).toHaveBeenCalledOnce(); });
  it('reloads the new note in server chronological order after saving', async () => { vi.mocked(api).mockResolvedValueOnce({ entries: [], hasMore: false, counts: {} }).mockResolvedValueOnce({ entry }).mockResolvedValueOnce({ entries:[entry], hasMore:false, counts:{test:1} }); render(<MedicalHistory patientId="patient" appointmentId="visit" />); await screen.findByText(/No medical records yet/); fireEvent.click(screen.getByRole('button', { name: 'Add note' })); fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Blood test' } }); fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Results' } }); fireEvent.click(screen.getByRole('button', { name: 'Save note' })); expect(await screen.findByText('Medical note saved.')).toBeInTheDocument(); expect(await screen.findByText('Blood test')).toBeInTheDocument(); expect(api).toHaveBeenCalledTimes(3); });
  it('loads more records', async () => { vi.mocked(api).mockResolvedValueOnce({ entries: [entry], hasMore: true, counts: { test: 2 } }).mockResolvedValueOnce({ entries: [{ ...entry, id: '2', title: 'Older test' }], hasMore: false, counts: { test: 2 } }); render(<MedicalHistory />); fireEvent.click(await screen.findByRole('button', { name: 'Load more' })); expect(await screen.findByText('Older test')).toBeInTheDocument(); await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()); expect(api).toHaveBeenLastCalledWith('/medical-history?direction=desc&offset=1'); });
  it('switches sort order and expands long notes', async () => { vi.mocked(api).mockResolvedValue({ entries: [{ ...entry, body: 'x'.repeat(400) }], hasMore: false, counts: { test: 1 } }); render(<MedicalHistory />); fireEvent.click(await screen.findByRole('button', { name: 'Show more' })); expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true'); fireEvent.click(screen.getByRole('button', { name: 'Oldest first' })); await waitFor(() => expect(api).toHaveBeenLastCalledWith('/medical-history?direction=asc&')); expect(screen.getByRole('button', { name: 'Oldest first' })).toHaveAttribute('aria-pressed', 'true'); });
  it('shows when a note was written and which visit it belongs to', async () => {
    vi.mocked(api).mockResolvedValue({ entries: [{ ...entry, appointmentId: 'visit-1', specialty: 'Pediatrics', createdAt: '2026-11-05T09:00:00Z', updatedAt: '2026-11-05T09:00:00Z', eventAt: '2026-11-04T10:30:00Z', appointmentStartAt: '2026-11-04T10:30:00Z' }], hasMore: false, counts: { test: 1 } });
    render(<MedicalHistory />);
    expect(await screen.findByText(/Written 5 Nov, 14:00/)).toBeInTheDocument();
    expect(screen.getByText('Visit · Wed, 4 Nov 2026 · 15:30')).toBeInTheDocument();
    expect(screen.getByText(/Pediatrics/)).toBeInTheDocument();
  });

  it('groups notes by visit and only opens the newest visit', async () => {
    const visit = (id: string, appointmentId: string, at: string, title: string) => ({ ...entry, id, title, appointmentId, eventAt: at, appointmentStartAt: at, createdAt: at, updatedAt: at });
    vi.mocked(api).mockResolvedValue({ entries: [visit('1', 'v-new', '2026-11-04T10:00:00Z', 'Newest note'), visit('2', 'v-new', '2026-11-04T10:00:00Z', 'Second note'), visit('3', 'v-old', '2026-10-01T10:00:00Z', 'Old note')], hasMore: false, counts: { test: 3 } });
    render(<MedicalHistory />);
    expect(await screen.findByText('Newest note')).toBeInTheDocument();
    expect(screen.getByText('Second note')).toBeInTheDocument();
    expect(screen.queryByText('Old note')).toBeNull();
    const toggles = screen.getAllByRole('button', { expanded: false });
    fireEvent.click(toggles[toggles.length - 1]);
    expect(screen.getByText('Old note')).toBeInTheDocument();
  });

  it('searches and filters by specialty and period on the server', async () => {
    vi.mocked(api).mockResolvedValue({ entries: [entry], hasMore: false, counts: { test: 1 }, specialties: [{ name: 'Cardiology', count: 2 }, { name: 'Pediatrics', count: 1 }] });
    render(<MedicalHistory />);
    await screen.findByText('Blood test');
    fireEvent.change(screen.getByPlaceholderText(/Search notes/), { target: { value: 'blood' } });
    await waitFor(() => expect(api).toHaveBeenLastCalledWith(expect.stringContaining('q=blood')), { timeout: 2000 });
    fireEvent.change(screen.getByRole('combobox', { name: 'Specialty' }), { target: { value: 'Cardiology' } });
    await waitFor(() => expect(api).toHaveBeenLastCalledWith(expect.stringContaining('specialty=Cardiology')));
    fireEvent.change(screen.getByRole('combobox', { name: 'Period' }), { target: { value: '30' } });
    await waitFor(() => expect(api).toHaveBeenLastCalledWith(expect.stringMatching(/from=\d{4}-\d{2}-\d{2}/)));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(api).toHaveBeenLastCalledWith('/medical-history?direction=desc&'));
  });
});
