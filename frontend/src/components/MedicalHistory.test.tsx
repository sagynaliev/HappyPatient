import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MedicalHistory, { MedicalNoteForm, MedicalEntry } from './MedicalHistory';
import { api } from '../lib/api';
vi.mock('../lib/api', () => ({ api: vi.fn() }));
afterEach(cleanup);
const entry: MedicalEntry = { id: '1', category: 'test', title: 'Blood test', body: 'First line\nSecond line <script>', createdAt: '2026-11-02T05:00:00Z', updatedAt: '2026-11-02T05:00:00Z', doctor: { user: { firstName: 'Sam', lastName: 'Doctor' } } };
beforeEach(() => vi.resetAllMocks());
/** Visits start closed; open every visit card on screen. */
const openVisits = async () => { const toggles = await screen.findAllByRole('button', { expanded: false }); toggles.filter(button => button.classList.contains('mh-group-toggle')).forEach(button => fireEvent.click(button)); };
describe('medical history shared doctor/patient view', () => {
  it('shows loading skeletons', () => { vi.mocked(api).mockReturnValue(new Promise(() => {})); render(<MedicalHistory />); expect(screen.getByRole('status')).toHaveTextContent('Loading'); expect(document.querySelector('.skeleton')).not.toBeNull(); });
  it('shows empty state and patient read-only view', async () => { vi.mocked(api).mockResolvedValue({ entries: [], hasMore: false, counts: {} }); render(<MedicalHistory />); expect(await screen.findByText(/No medical records yet/)).toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Add note' })).toBeNull(); });
  it('retries a generic error', async () => { vi.mocked(api).mockRejectedValueOnce(new Error('private info')).mockResolvedValueOnce({ entries: [], hasMore: false, counts: {} }); render(<MedicalHistory />); expect(await screen.findByRole('alert')).not.toHaveTextContent('private info'); fireEvent.click(screen.getByRole('button', { name: 'Retry' })); expect(await screen.findByText(/No medical records yet/)).toBeInTheDocument(); });
  it('filters with counts, shows text safely, uses Almaty time', async () => { vi.mocked(api).mockImplementation((path) => Promise.resolve({ entries: path.includes('category=test') ? [entry] : [entry, { ...entry, id: '2', category: 'conclusion', title: 'Conclusion' }], hasMore: false, counts: { test: 1, conclusion: 1 } })); render(<MedicalHistory />); await openVisits(); expect(await screen.findByText('Blood test')).toBeInTheDocument(); expect(screen.getAllByText(/10:00/)).toHaveLength(2); fireEvent.click(screen.getByRole('button', { name: 'Tests (1)' })); expect(await screen.findByRole('button', { name: 'Tests (1)' })).toHaveAttribute('aria-pressed', 'true'); await waitFor(() => expect(screen.queryByRole('heading', { name: 'Conclusion' })).toBeNull()); await openVisits(); expect(await screen.findByText(/Second line <script>/)).toBeInTheDocument(); expect(document.querySelector('script')).toBeNull(); });
  it('validates form before submitting and supports cancel', () => { const cancel = vi.fn(); render(<MedicalNoteForm appointmentId="visit" onSave={vi.fn()} onCancel={cancel} />); fireEvent.click(screen.getByRole('button', { name: 'Save note' })); expect(screen.getByRole('alert')).toHaveTextContent('Enter a title'); expect(api).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Cancel' })); expect(cancel).toHaveBeenCalledOnce(); });
  it('reloads the new note in server chronological order after saving', async () => { vi.mocked(api).mockResolvedValueOnce({ entries: [], hasMore: false, counts: {} }).mockResolvedValueOnce({ entry }).mockResolvedValueOnce({ entries:[entry], hasMore:false, counts:{test:1} }); render(<MedicalHistory patientId="patient" appointmentId="visit" />); await screen.findByText(/No medical records yet/); fireEvent.click(screen.getByRole('button', { name: 'Add note' })); fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Blood test' } }); fireEvent.change(screen.getByLabelText('Note'), { target: { value: 'Results' } }); fireEvent.click(screen.getByRole('button', { name: 'Save note' })); expect(await screen.findByText(/Note saved — it is highlighted below/)).toBeInTheDocument(); expect(await screen.findByText('Blood test')).toBeInTheDocument(); expect(screen.getByText('Just added')).toBeInTheDocument(); expect(screen.getByLabelText('Title')).toHaveValue(''); expect(screen.getByRole('button', { name: 'Close' })).toBeInTheDocument(); expect(api).toHaveBeenCalledTimes(3); });
  it('loads more records', async () => { vi.mocked(api).mockResolvedValueOnce({ entries: [entry], hasMore: true, counts: { test: 2 } }).mockResolvedValueOnce({ entries: [{ ...entry, id: '2', title: 'Older test' }], hasMore: false, counts: { test: 2 } }); render(<MedicalHistory />); fireEvent.click(await screen.findByRole('button', { name: 'Load more' })); await waitFor(() => expect(api).toHaveBeenCalledTimes(2)); await openVisits(); expect(await screen.findByText('Older test')).toBeInTheDocument(); await waitFor(() => expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull()); expect(api).toHaveBeenLastCalledWith('/medical-history?direction=desc&offset=1'); });
  it('switches sort order and expands long notes', async () => { vi.mocked(api).mockResolvedValue({ entries: [{ ...entry, body: 'x'.repeat(400) }], hasMore: false, counts: { test: 1 } }); render(<MedicalHistory />); await openVisits(); fireEvent.click(await screen.findByRole('button', { name: 'Show more' })); expect(screen.getByRole('button', { name: 'Show less' })).toHaveAttribute('aria-expanded', 'true'); fireEvent.click(screen.getByRole('button', { name: 'Oldest first' })); await waitFor(() => expect(api).toHaveBeenLastCalledWith('/medical-history?direction=asc&')); expect(screen.getByRole('button', { name: 'Oldest first' })).toHaveAttribute('aria-pressed', 'true'); });
  it('shows when a note was written and which visit it belongs to', async () => {
    vi.mocked(api).mockResolvedValue({ entries: [{ ...entry, appointmentId: 'visit-1', specialty: 'Pediatrics', createdAt: '2026-11-05T09:00:00Z', updatedAt: '2026-11-05T09:00:00Z', eventAt: '2026-11-04T10:30:00Z', appointmentStartAt: '2026-11-04T10:30:00Z' }], hasMore: false, counts: { test: 1 } });
    render(<MedicalHistory />);
    await openVisits();
    expect(await screen.findByText(/Written 5 Nov, 14:00/)).toBeInTheDocument();
    expect(screen.getByText('Visit · Wed, 4 Nov 2026 · 15:30')).toBeInTheDocument();
    expect(screen.getByText(/Pediatrics/)).toBeInTheDocument();
  });

  it('groups notes by visit and keeps every visit closed until clicked', async () => {
    const visit = (id: string, appointmentId: string, at: string, title: string) => ({ ...entry, id, title, appointmentId, eventAt: at, appointmentStartAt: at, createdAt: at, updatedAt: at });
    vi.mocked(api).mockResolvedValue({ entries: [visit('1', 'v-new', '2026-11-04T10:00:00Z', 'Newest note'), visit('2', 'v-new', '2026-11-04T10:00:00Z', 'Second note'), visit('3', 'v-old', '2026-10-01T10:00:00Z', 'Old note')], hasMore: false, counts: { test: 3 } });
    render(<MedicalHistory />);
    const toggles = (await screen.findAllByRole('button', { expanded: false })).filter(button => button.classList.contains('mh-group-toggle'));
    expect(toggles).toHaveLength(2);
    expect(screen.queryByText('Newest note')).toBeNull();
    expect(screen.queryByText('Old note')).toBeNull();
    fireEvent.click(toggles[0]);
    expect(screen.getByText('Newest note')).toBeInTheDocument();
    expect(screen.getByText('Second note')).toBeInTheDocument();
    expect(screen.queryByText('Old note')).toBeNull();
    fireEvent.click(toggles[1]);
    expect(screen.getByText('Old note')).toBeInTheDocument();
  });

  it('searches and filters by specialty and period on the server', async () => {
    vi.mocked(api).mockResolvedValue({ entries: [entry], hasMore: false, counts: { test: 1 }, specialties: [{ name: 'Cardiology', count: 2 }, { name: 'Pediatrics', count: 1 }] });
    render(<MedicalHistory />);
    await openVisits();
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

describe('editing a note', () => {
  it('opens prefilled, saves with PATCH and keeps the visit and patient out of the request', async () => {
    const save = vi.fn();
    vi.mocked(api).mockResolvedValueOnce({ entry: { ...entry, title: 'Blood test, repeated', updatedAt: '2026-11-02T06:00:00Z' } });
    render(<MedicalNoteForm appointmentId="visit" entry={entry} chips onSave={save} onCancel={vi.fn()} />);
    expect(screen.getByLabelText('Title')).toHaveValue('Blood test');
    expect(screen.getByRole('button', { name: /Tests/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Blood test, repeated' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const [path, options] = vi.mocked(api).mock.calls[0];
    expect(path).toBe('/medical-history/1');
    expect(options?.method).toBe('PATCH');
    const sent = JSON.parse(String(options?.body));
    expect(sent).toEqual({ category: 'test', title: 'Blood test, repeated', body: 'First line\nSecond line <script>', results: [] });
  });
  it('shows the server reason when an edit is refused', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('Only the doctor who wrote a note can edit it, within 24 hours after the visit.'));
    render(<MedicalNoteForm appointmentId="visit" entry={entry} chips onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the doctor who wrote a note');
  });
  it('offers Edit only when allowed and marks edited notes', async () => {
    const edited = { ...entry, id: '2', title: 'Changed later', appointmentId: 'v1', updatedAt: '2026-11-02T07:30:00Z' };
    vi.mocked(api).mockResolvedValue({ entries: [edited], hasMore: false, counts: { test: 1 } });
    const onEdit = vi.fn();
    render(<MedicalHistory patientId="p" scope={{ only: 'v1' }} compact onEditEntry={onEdit} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Edit note Changed later' }));
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: '2' }));
    expect(screen.getByText(/^Edited /)).toBeInTheDocument();
    cleanup();
    vi.mocked(api).mockResolvedValue({ entries: [{ ...entry, appointmentId: 'v1' }], hasMore: false, counts: { test: 1 } });
    render(<MedicalHistory patientId="p" scope={{ only: 'v1' }} compact />);
    await screen.findByText('Blood test');
    expect(screen.queryByRole('button', { name: /Edit note/ })).toBeNull();
    expect(screen.queryByText(/^Edited /)).toBeNull();
  });
});

describe('lab results on test notes', () => {
  it('lets the doctor enter values, fills a known range and sends numbers', async () => {
    const save = vi.fn();
    vi.mocked(api).mockResolvedValueOnce({ entry });
    render(<MedicalNoteForm appointmentId="visit" chips onSave={save} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tests/ }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Complete blood count' } });
    fireEvent.change(screen.getByLabelText('Result 1 test name'), { target: { value: 'Hemoglobin' } });
    expect(screen.getByLabelText('Result 1 unit')).toHaveValue('g/L');
    expect(screen.getByLabelText('Result 1 normal from')).toHaveValue('120');
    fireEvent.change(screen.getByLabelText('Result 1 value'), { target: { value: '118,5' } });
    fireEvent.click(screen.getByRole('button', { name: '+ Add result' }));
    fireEvent.change(screen.getByLabelText('Result 2 test name'), { target: { value: 'Ferritin' } });
    fireEvent.change(screen.getByLabelText('Result 2 value'), { target: { value: '9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    const sent = JSON.parse(String(vi.mocked(api).mock.calls[0][1]?.body));
    expect(sent).toMatchObject({ appointmentId: 'visit', category: 'test', title: 'Complete blood count', body: '' });
    expect(sent.results).toEqual([
      { name: 'Hemoglobin', value: 118.5, unit: 'g/L', low: 120, high: 160 },
      { name: 'Ferritin', value: 9, unit: 'ng/mL', low: 15, high: 150 },
    ]);
  });
  it('refuses a result without a numeric value', () => {
    render(<MedicalNoteForm appointmentId="visit" chips onSave={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /Tests/ }));
    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Blood test' } });
    fireEvent.change(screen.getByLabelText('Result 1 test name'), { target: { value: 'Hemoglobin' } });
    fireEvent.change(screen.getByLabelText('Result 1 value'), { target: { value: 'low' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    expect(screen.getByRole('alert')).toHaveTextContent('numeric value');
    expect(api).not.toHaveBeenCalled();
  });
  it('shows results with Low, High and Normal flags', async () => {
    vi.mocked(api).mockResolvedValue({ entries: [{ ...entry, body: '', results: [
      { name: 'Hemoglobin', value: 118, unit: 'g/L', low: 120, high: 160 },
      { name: 'Glucose', value: 4.8, unit: 'mmol/L', low: 3.9, high: 5.5 },
      { name: 'Total cholesterol', value: 6.1, unit: 'mmol/L', low: null, high: 5.2 },
    ] }], hasMore: false, counts: { test: 1 } });
    render(<MedicalHistory />);
    await openVisits();
    const rows = (await screen.findAllByRole('row')).slice(1).map(row => row.textContent);
    expect(rows[0]).toContain('118 g/L'); expect(rows[0]).toContain('120–160 g/L'); expect(rows[0]).toContain('Low');
    expect(rows[1]).toContain('Normal');
    expect(rows[2]).toContain('< 5.2 mmol/L'); expect(rows[2]).toContain('High');
  });
  it('offers the PDF download to the patient only when there are test notes', async () => {
    vi.mocked(api).mockResolvedValue({ entries: [entry], hasMore: false, counts: { test: 1 } });
    render(<MedicalHistory downloadFor="Aigerim Seitkali" />);
    expect(await screen.findByRole('button', { name: /Download test results/ })).not.toBeDisabled();
    cleanup();
    vi.mocked(api).mockResolvedValue({ entries: [], hasMore: false, counts: {} });
    render(<MedicalHistory downloadFor="Aigerim Seitkali" />);
    expect(await screen.findByRole('button', { name: /Download test results/ })).toBeDisabled();
  });
});
