import { FormEvent, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { Icon } from './Icons';
import '../styles/medicalHistory.css';
import { toast } from '../lib/toast';

export const categoryLabels = { test: 'Tests', anamnesis: 'Anamnesis', conclusion: 'Conclusions' };
/** "1 Test", "2 Tests": the per-visit counts read as plain English. */
const countLabel = (key: keyof typeof categoryLabels, count: number) => `${count} ${count === 1 ? { test: 'Test', anamnesis: 'Anamnesis', conclusion: 'Conclusion' }[key] : { test: 'Tests', anamnesis: 'Anamneses', conclusion: 'Conclusions' }[key]}`;
export type MedicalCategory = keyof typeof categoryLabels;
/** A measured value on a test note; low/high is the normal range. */
export type LabResult = { name: string; value: number; unit: string; low: number | null; high: number | null };
export type MedicalEntry = { id: string; category: MedicalCategory; title: string; body: string; results?: LabResult[] | null; createdAt: string; updatedAt: string; eventAt?: string; appointmentId?: string|null; appointmentStartAt?: string|null; specialty?: string; doctor: { user: { firstName: string; lastName: string } } };
type HistoryResponse = { entries: MedicalEntry[]; hasMore: boolean; counts: Partial<Record<MedicalCategory, number>>; specialties?: Array<{ name: string; count: number }> };
const almaty = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Almaty', ...options });
const timeText = almaty({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const writtenText = almaty({ day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dayText = almaty({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const visitText = almaty({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
const monthText = almaty({ month: 'short' });
const dayNumber = almaty({ day: 'numeric' });
const categoryIcons = { test: 'chart', anamnesis: 'file', conclusion: 'check' } as const;
const LONG_NOTE = 160;
const doctorName = (entry: MedicalEntry) => `Dr. ${entry.doctor.user.firstName} ${entry.doctor.user.lastName}`;

/** One note, compact: category, title, when it was written and a two-line preview. */
function MedicalEntryCard({ entry, showDoctor, isNew, newLabel = 'Just added', onEdit }: { entry: MedicalEntry; showDoctor: boolean; isNew?: boolean; newLabel?: string; onEdit?: (entry: MedicalEntry) => void }) {
  const [expanded, setExpanded] = useState(false);
  // A minute of slack: the database sets both stamps on creation, so only a real later change counts as an edit.
  const edited = Date.parse(entry.updatedAt) - Date.parse(entry.createdAt) > 60_000;
  const long = entry.body.length > LONG_NOTE || entry.body.split('\n').length > 2;
  return <article className={`mh-entry is-${entry.category}${isNew ? ' is-new' : ''}`} ref={element => { if (isNew && element?.scrollIntoView) element.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }}>
    <header className="mh-entry-head">
      {isNew && <span className="mh-new-badge">{newLabel}</span>}
      <span className={`mh-pill is-${entry.category}`}><Icon name={categoryIcons[entry.category]} size={13} /> {categoryLabels[entry.category]}</span>
      <h4>{entry.title}</h4>
      <span className="mh-entry-when">
        <time className="mh-entry-time" dateTime={entry.createdAt} title="When the note was written">Written {writtenText.format(new Date(entry.createdAt))}</time>
        {edited && <time className="mh-entry-edited" dateTime={entry.updatedAt} title="When the note was last changed">Edited {writtenText.format(new Date(entry.updatedAt))}</time>}
      </span>
      {onEdit && <button type="button" className="mh-edit" onClick={() => onEdit(entry)} aria-label={`Edit note ${entry.title}`}>Edit</button>}
    </header>
    {entry.results?.length ? <LabResultsTable results={entry.results} /> : null}
    {entry.body && <p className={`mh-body${long && !expanded ? ' is-clamped' : ''}`}>{entry.body}</p>}
    {long && <button className="mh-more" type="button" aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Show less' : 'Show more'}</button>}
    {showDoctor && <p className="mh-entry-doctor"><Icon name="stethoscope" size={14} /> {doctorName(entry)}</p>}
  </article>;
}

const numberText = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(value);
/** "120–160", "< 5.2", "> 30" or an empty string when no range was given. */
export const rangeText = (result: LabResult) => result.low !== null && result.high !== null ? `${numberText(result.low)}–${numberText(result.high)}` : result.high !== null ? `< ${numberText(result.high)}` : result.low !== null ? `> ${numberText(result.low)}` : '';
export const resultFlag = (result: LabResult): 'low' | 'high' | 'normal' | null => result.low === null && result.high === null ? null : result.low !== null && result.value < result.low ? 'low' : result.high !== null && result.value > result.high ? 'high' : 'normal';
const flagLabels = { low: 'Low', high: 'High', normal: 'Normal' };
export function LabResultsTable({ results }: { results: LabResult[] }) {
  return <div className="mh-results-wrap"><table className="mh-results">
    <thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Normal range</th><th scope="col"><span className="sr-only">Flag</span></th></tr></thead>
    <tbody>{results.map((result, index) => { const flag = resultFlag(result); return <tr key={`${result.name}-${index}`} className={flag ? `is-${flag}` : undefined}>
      <th scope="row">{result.name}</th>
      <td><strong>{numberText(result.value)}</strong>{result.unit ? ` ${result.unit}` : ''}</td>
      <td>{rangeText(result) ? `${rangeText(result)}${result.unit ? ` ${result.unit}` : ''}` : '—'}</td>
      <td>{flag && <span className={`mh-flag is-${flag}`}>{flagLabels[flag]}</span>}</td>
    </tr>; })}</tbody>
  </table></div>;
}

type EntryGroup = { key: string; at: string; visit: boolean; entries: MedicalEntry[] };
/** Notes of one visit stay together; notes without a visit are grouped by day. Entries arrive sorted. */
function groupEntries(entries: MedicalEntry[]) {
  const groups: EntryGroup[] = [];
  for (const entry of entries) {
    const at = entry.eventAt ?? entry.appointmentStartAt ?? entry.createdAt;
    const key = entry.appointmentId ? `visit-${entry.appointmentId}` : `day-${dayText.format(new Date(at))}`;
    const last = groups[groups.length - 1];
    if (last?.key === key) last.entries.push(entry);
    else groups.push({ key, at, visit: Boolean(entry.appointmentId), entries: [entry] });
  }
  return groups;
}

/** A visit as a collapsible card: date, doctor and what was recorded, with the notes inside. */
function VisitGroup({ group, open, onToggle, newId, newLabel, onEdit }: { group: EntryGroup; open: boolean; onToggle: () => void; newId?: string; newLabel?: string; onEdit?: (entry: MedicalEntry) => void }) {
  const first = group.entries[0];
  const doctors = new Set(group.entries.map(doctorName));
  const tally = (Object.keys(categoryLabels) as MedicalCategory[]).map(key => [key, group.entries.filter(entry => entry.category === key).length] as const).filter(([, count]) => count);
  const panelId = `mh-group-${group.key}`;
  return <li className={`mh-group${open ? ' is-open' : ''}`}>
    <button type="button" className="mh-group-toggle" aria-expanded={open} aria-controls={panelId} onClick={onToggle}>
      <span className="mh-date" aria-hidden="true"><span>{monthText.format(new Date(group.at))}</span><strong>{dayNumber.format(new Date(group.at))}</strong></span>
      <span className="mh-group-copy">
        <span className="mh-group-title">{group.visit ? 'Visit' : 'Notes'} · {visitText.format(new Date(group.at))}{group.visit ? ` · ${timeText.format(new Date(group.at))}` : ''}</span>
        <span className="mh-group-meta">{doctors.size === 1 ? doctorName(first) : `${doctors.size} doctors`}{first.specialty ? ` · ${first.specialty}` : ''}</span>
      </span>
      <span className="mh-group-tally">{tally.map(([key, count]) => <span key={key} className={`mh-pill is-${key}`}>{countLabel(key, count)}</span>)}</span>
      <Icon name="arrow-right" size={18} className="mh-group-chevron" />
    </button>
    {open && <div className="mh-group-body" id={panelId}>{group.entries.map(entry => <MedicalEntryCard key={entry.id} entry={entry} showDoctor={doctors.size > 1} isNew={entry.id === newId} newLabel={newLabel} onEdit={onEdit} />)}</div>}
  </li>;
}

export function MedicalEntryList({ entries, openAll = false, newId, newLabel, onEdit }: { entries: MedicalEntry[]; openAll?: boolean; newId?: string; newLabel?: string; onEdit?: (entry: MedicalEntry) => void }) {
  const groups = groupEntries(entries);
  // Visits start closed so a long history stays short; a search (or a single-visit view) opens what it found.
  const [toggled, setToggled] = useState<Record<string, boolean>>({});
  // The visit holding a note that was just added always stays open, so the doctor sees what was saved.
  const isOpen = (group: EntryGroup) => (newId !== undefined && group.entries.some(entry => entry.id === newId)) || (toggled[group.key] ?? openAll);
  return <ol className="mh-list">{groups.map((group) => <VisitGroup key={group.key} group={group} open={isOpen(group)} newId={newId} newLabel={newLabel} onEdit={onEdit} onToggle={() => setToggled(current => ({ ...current, [group.key]: !isOpen(group) }))} />)}</ol>;
}

type ResultRow = { name: string; value: string; unit: string; low: string; high: string };
const toRow = (result: LabResult): ResultRow => ({ name: result.name, value: String(result.value), unit: result.unit, low: result.low === null ? '' : String(result.low), high: result.high === null ? '' : String(result.high) });
const emptyRow = (): ResultRow => ({ name: '', value: '', unit: '', low: '', high: '' });
/** Accepts "118", "5,4" or "0.4"; returns null for an empty value and NaN for text. */
const parseNumber = (text: string) => { const trimmed = text.trim().replace(',', '.'); if (!trimmed) return null; return /^-?\d+(\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN; };
/** Common tests with their usual unit and adult normal range; picking one fills the unit and range. */
const COMMON_TESTS: Array<[string, string, string, string]> = [
  ['Hemoglobin', 'g/L', '120', '160'], ['Red blood cells', '×10¹²/L', '3.8', '5.1'], ['White blood cells', '×10⁹/L', '4', '9'], ['Platelets', '×10⁹/L', '150', '400'],
  ['ESR', 'mm/h', '2', '15'], ['Glucose', 'mmol/L', '3.9', '5.5'], ['Total cholesterol', 'mmol/L', '', '5.2'], ['Creatinine', 'µmol/L', '53', '97'],
  ['ALT', 'U/L', '', '40'], ['AST', 'U/L', '', '40'], ['Ferritin', 'ng/mL', '15', '150'], ['TSH', 'mIU/L', '0.4', '4'], ['Vitamin D', 'ng/mL', '30', '100'],
];
function ResultsEditor({ rows, onChange, disabled }: { rows: ResultRow[]; onChange: (rows: ResultRow[]) => void; disabled: boolean }) {
  const list = rows.length ? rows : [emptyRow()];
  const update = (index: number, patch: Partial<ResultRow>) => onChange(list.map((row, at) => {
    if (at !== index) return row;
    const next = { ...row, ...patch };
    // Picking a known test fills its unit and range, without overwriting what the doctor typed.
    const known = patch.name !== undefined ? COMMON_TESTS.find(([name]) => name.toLowerCase() === patch.name!.trim().toLowerCase()) : undefined;
    return known ? { ...next, unit: next.unit || known[1], low: next.low || known[2], high: next.high || known[3] } : next;
  }));
  return <fieldset className="mh-results-editor">
    <legend>Results</legend>
    <p className="mh-results-hint">Enter each measured value. Values outside the normal range are marked Low or High for the patient.</p>
    <datalist id="mh-common-tests">{COMMON_TESTS.map(([name]) => <option key={name} value={name} />)}</datalist>
    <div className="mh-results-grid" role="table" aria-label="Results">
      <div className="mh-results-row is-head" role="row"><span role="columnheader">Test</span><span role="columnheader">Value</span><span role="columnheader">Unit</span><span role="columnheader">Normal from</span><span role="columnheader">Normal to</span><span role="columnheader"><span className="sr-only">Remove</span></span></div>
      {list.map((row, index) => <div className="mh-results-row" role="row" key={index}>
        <input aria-label={`Result ${index + 1} test name`} list="mh-common-tests" placeholder="e.g. Hemoglobin" value={row.name} maxLength={80} disabled={disabled} onChange={event => update(index, { name: event.target.value })} />
        <input aria-label={`Result ${index + 1} value`} inputMode="decimal" placeholder="118" value={row.value} maxLength={16} disabled={disabled} onChange={event => update(index, { value: event.target.value })} />
        <input aria-label={`Result ${index + 1} unit`} placeholder="g/L" value={row.unit} maxLength={20} disabled={disabled} onChange={event => update(index, { unit: event.target.value })} />
        <input aria-label={`Result ${index + 1} normal from`} inputMode="decimal" placeholder="120" value={row.low} maxLength={16} disabled={disabled} onChange={event => update(index, { low: event.target.value })} />
        <input aria-label={`Result ${index + 1} normal to`} inputMode="decimal" placeholder="160" value={row.high} maxLength={16} disabled={disabled} onChange={event => update(index, { high: event.target.value })} />
        <button type="button" className="mh-results-remove" aria-label={`Remove result ${index + 1}`} disabled={disabled || (list.length === 1 && !row.name && !row.value)} onClick={() => onChange(list.filter((_, at) => at !== index))}>✕</button>
      </div>)}
    </div>
    <button type="button" className="button button-outline small" disabled={disabled || list.length >= 30} onClick={() => onChange([...list, emptyRow()])}>+ Add result</button>
  </fieldset>;
}

/** chips: picks the category with one tap and focuses the title, for the note bar on the doctor visit page. */
/** entry: edit that note instead of writing a new one. */
export function MedicalNoteForm({ appointmentId, onSave, onCancel, savedCount = 0, chips = false, entry }: { appointmentId: string; onSave: (entry: MedicalEntry) => void; onCancel: () => void; savedCount?: number; chips?: boolean; entry?: MedicalEntry }) {
  const [category, setCategory] = useState<MedicalCategory>(entry?.category ?? 'anamnesis');
  const [title, setTitle] = useState(entry?.title ?? ''); const [body, setBody] = useState(entry?.body ?? '');
  const [rows, setRows] = useState<ResultRow[]>(() => (entry?.results ?? []).map(toRow));
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const isTest = category === 'test';
  async function submit(event: FormEvent) {
    event.preventDefault(); setError('');
    const filled = isTest ? rows.filter(row => row.name.trim() || row.value.trim()) : [];
    const results: LabResult[] = [];
    for (const row of filled) {
      const value = parseNumber(row.value); const low = row.low.trim() ? parseNumber(row.low) : null; const high = row.high.trim() ? parseNumber(row.high) : null;
      if (!row.name.trim() || value === null || Number.isNaN(value)) { setError('Each result needs a name and a numeric value, for example Hemoglobin 118.'); return; }
      if (Number.isNaN(low) || Number.isNaN(high) || (low !== null && high !== null && low > high)) { setError(`Check the normal range of ${row.name.trim()}: use numbers, low before high.`); return; }
      results.push({ name: row.name.trim().slice(0, 80), value, unit: row.unit.trim().slice(0, 20), low, high });
    }
    if (!title.trim() || title.trim().length > 120 || body.trim().length > 5000 || (!body.trim() && !results.length)) { setError(isTest ? 'Enter a title and at least one result or a note.' : 'Enter a title (1–120) and note (1–5000 characters).'); return; }
    setBusy(true);
    try {
      const content = { category, title: title.trim(), body: body.trim(), results };
      const result = entry
        ? await api<{ entry: MedicalEntry }>(`/medical-history/${encodeURIComponent(entry.id)}`, { method: 'PATCH', body: JSON.stringify(content) })
        : await api<{ entry: MedicalEntry }>('/medical-history', { method: 'POST', body: JSON.stringify({ appointmentId, ...content }) });
      if (!entry) { setTitle(''); setBody(''); setRows([]); }
      onSave(result.entry);
    }
    catch (caught) { setError(entry && caught instanceof Error && caught.message ? caught.message : 'Unable to save the note. Please try again.'); }
    finally { setBusy(false); }
  }
  return <form className={`mh-form${chips ? ' is-inline' : ''}`} onSubmit={submit} noValidate>
    <h3>{savedCount ? 'Add another note' : chips ? 'Write a note' : 'Add medical note'}</h3>
    {savedCount > 0 && <p className="mh-alert is-success" role="status"><Icon name="check" size={16} /> {savedCount === 1 ? 'Note saved' : `${savedCount} notes saved`} — it is highlighted below. Add another or close the form.</p>}
    {error && <p id="mh-form-error" className="alert error" role="alert">{error}</p>}
    {chips
      ? <fieldset className="mh-category-chips"><legend>Category</legend>{(Object.keys(categoryLabels) as MedicalCategory[]).map(key => <button type="button" key={key} className={`is-${key}`} aria-pressed={category === key} disabled={busy} onClick={() => setCategory(key)}><Icon name={categoryIcons[key]} size={15} /> {categoryLabels[key]}</button>)}</fieldset>
      : <><label htmlFor="mh-category">Category</label><select id="mh-category" value={category} onChange={event => setCategory(event.target.value as MedicalCategory)} disabled={busy} required>{Object.entries(categoryLabels).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select></>}
    <label htmlFor="mh-title">Title</label><input id="mh-title" autoFocus={chips} value={title} maxLength={120} required disabled={busy} aria-describedby={error ? 'mh-form-error' : undefined} onChange={event => setTitle(event.target.value)} />
    {isTest && <ResultsEditor rows={rows} onChange={setRows} disabled={busy} />}
    <label htmlFor="mh-body">{isTest ? 'Comment (optional when results are entered)' : 'Note'}</label><textarea id="mh-body" value={body} maxLength={5000} rows={isTest ? 3 : 7} required={!isTest} disabled={busy} aria-describedby={`mh-counter${error ? ' mh-form-error' : ''}`} onChange={event => setBody(event.target.value)} />
    <small id="mh-counter">{body.length}/5000 characters</small>
    <div className="mh-actions"><button className="button" disabled={busy}>{busy ? 'Saving…' : entry ? 'Save changes' : 'Save note'}</button><button className="button button-outline" type="button" disabled={busy} onClick={onCancel}>{savedCount ? 'Close' : 'Cancel'}</button></div>
  </form>;
}

/** appointmentId enables adding notes to that visit; scope limits the list to one visit (only) or everything but one visit (except).
 * compact puts the category counts in a chip row inside the timeline; refreshKey reloads and highlightId marks a note saved from outside. */
export default function MedicalHistory({ patientId, appointmentId, scope, emptyText, compact = false, refreshKey = 0, highlightId, highlightLabel, onAddNote, onEditEntry, downloadFor }: { downloadFor?: string; patientId?: string; appointmentId?: string; scope?: { only?: string; except?: string }; emptyText?: { title: string; body: string }; compact?: boolean; refreshKey?: number; highlightId?: string; highlightLabel?: string; onAddNote?: () => void; onEditEntry?: (entry: MedicalEntry) => void }) {
  const [direction,setDirection]=useState<'asc'|'desc'>('desc');
  const [entries, setEntries] = useState<MedicalEntry[]>([]);
  const [counts, setCounts] = useState<HistoryResponse['counts']>({});
  const [hasMore, setHasMore] = useState(false); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(''); const [success, setSuccess] = useState(false);
  const [filter, setFilter] = useState<MedicalCategory | 'all'>('all'); const [adding, setAdding] = useState(false);
  const [retry, setRetry] = useState(0);
  const [newId, setNewId] = useState<string>(); const [savedCount, setSavedCount] = useState(0);
  const [search, setSearch] = useState(''); const [query, setQuery] = useState('');
  const [specialty, setSpecialty] = useState(''); const [period, setPeriod] = useState<'all' | '30' | '182' | '365'>('all');
  const [specialties, setSpecialties] = useState<NonNullable<HistoryResponse['specialties']>>([]);
  useEffect(() => { const timer = window.setTimeout(() => setQuery(search.trim()), 300); return () => window.clearTimeout(timer); }, [search]);
  const showFinder = !scope?.only;
  const since = period === 'all' ? '' : new Date(Date.now() - Number(period) * 86_400_000).toISOString().slice(0, 10);
  const narrowed = Boolean(query || specialty || since);
  const path = `/medical-history?${patientId ? `patientId=${encodeURIComponent(patientId)}&` : ''}direction=${direction}&${filter !== 'all' ? `category=${filter}&` : ''}${scope?.only ? `appointmentId=${encodeURIComponent(scope.only)}&` : ''}${scope?.except ? `excludeAppointmentId=${encodeURIComponent(scope.except)}&` : ''}${query ? `q=${encodeURIComponent(query)}&` : ''}${specialty ? `specialty=${encodeURIComponent(specialty)}&` : ''}${since ? `from=${since}&` : ''}`;
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    api<HistoryResponse>(path).then(result => { if (active) { setEntries(result.entries); setCounts(result.counts); setHasMore(result.hasMore); if (result.specialties) setSpecialties(result.specialties); } }).catch(() => { if (active) setError('Unable to load medical history.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [path, retry, refreshKey]);
  async function loadMore() {
    setLoading(true); setError('');
    try { const result = await api<HistoryResponse>(`${path}offset=${entries.length}`); setEntries(current => [...current, ...result.entries]); setCounts(result.counts); setHasMore(result.hasMore); }
    catch { setError('Unable to load medical history.'); }
    finally { setLoading(false); }
  }
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const filters = [
    { key: 'all' as const, label: 'All records', icon: 'heart' as const, count: total },
    ...(Object.keys(categoryLabels) as MedicalCategory[]).map(key => ({ key, label: categoryLabels[key], icon: categoryIcons[key], count: counts[key] ?? 0 })),
  ];
  const highlighted = highlightId ?? newId;
  const [downloading, setDownloading] = useState(false);
  /** All of the patient's test notes (not just the loaded page), newest first, as one PDF. */
  async function downloadResults() {
    setDownloading(true);
    try {
      const { entries: all } = await api<{ entries: MedicalEntry[] }>(`/medical-history/export${patientId ? `?patientId=${encodeURIComponent(patientId)}` : ''}`);
      const tests = all.filter(entry => entry.category === 'test').reverse();
      if (!tests.length) { toast.error('No test results yet'); return; }
      const { downloadLabResultsPdf } = await import('../lib/labResultsPdf');
      await downloadLabResultsPdf(tests, downloadFor || 'Patient');
      toast.success('Test results downloaded');
    } catch { toast.error('Could not create the PDF', 'Please try again.'); }
    finally { setDownloading(false); }
  }
  return <section className={`mh-history${compact ? ' is-compact' : ''}`} aria-label="Medical history" aria-busy={loading}>
    {!compact && <div className="mh-filters" role="group" aria-label="Filter medical entries">
      {filters.map(item => <button type="button" className={`mh-filter is-${item.key}`} aria-pressed={filter === item.key} aria-label={`${item.label} (${item.count})`} key={item.key} onClick={() => setFilter(item.key)}>
        <span className="mh-filter-icon"><Icon name={item.icon} size={20} /></span>
        <span className="mh-filter-text"><strong>{item.count}</strong><span>{item.label}</span></span>
      </button>)}
    </div>}
    <div className="mh-card">
      <header className="mh-heading">
        <h2>Timeline</h2>
        <div className="mh-heading-actions">
          <div className="mh-sort" role="group" aria-label="Sort records">
            <button type="button" aria-pressed={direction === 'desc'} onClick={() => setDirection('desc')}>Newest first</button>
            <button type="button" aria-pressed={direction === 'asc'} onClick={() => setDirection('asc')}>Oldest first</button>
          </div>
          {downloadFor !== undefined && <button className="button button-outline small mh-download" type="button" disabled={downloading || !(counts.test ?? 0)} title={counts.test ? undefined : 'No test results yet'} onClick={() => void downloadResults()}><Icon name="file" size={15} /> {downloading ? 'Preparing PDF…' : 'Download test results (PDF)'}</button>}
          {appointmentId && !adding && <button className="button small" type="button" onClick={() => { setAdding(true); setSuccess(false); }}>Add note</button>}
          {onAddNote && <button className="button small" type="button" onClick={onAddNote}>Add note</button>}
        </div>
      </header>
      {compact && <div className="mh-chips" role="group" aria-label="Filter medical entries">
        {filters.map(item => <button type="button" className={`mh-chip is-${item.key}`} aria-pressed={filter === item.key} aria-label={`${item.label} (${item.count})`} key={item.key} onClick={() => setFilter(item.key)}><Icon name={item.icon} size={14} /> {item.key === 'all' ? 'All' : item.label} <strong>{item.count}</strong></button>)}
      </div>}
      {showFinder && <div className="mh-finder" role="search" aria-label="Find records">
        <label className="mh-search"><Icon name="search" size={16} /><span className="sr-only">Search records</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search notes, e.g. blood test" /></label>
        {specialties.length > 1 && <label className="mh-select"><span className="sr-only">Specialty</span><select value={specialty} onChange={event => setSpecialty(event.target.value)}><option value="">All specialties</option>{specialties.map(item => <option key={item.name} value={item.name}>{item.name} ({item.count})</option>)}</select></label>}
        <label className="mh-select"><span className="sr-only">Period</span><select value={period} onChange={event => setPeriod(event.target.value as typeof period)}><option value="all">All time</option><option value="30">Last 30 days</option><option value="182">Last 6 months</option><option value="365">Last year</option></select></label>
        {narrowed && <button type="button" className="mh-clear" onClick={() => { setSearch(''); setQuery(''); setSpecialty(''); setPeriod('all'); }}>Clear filters</button>}
      </div>}
      {adding && appointmentId && <MedicalNoteForm appointmentId={appointmentId} savedCount={savedCount} onCancel={() => { setAdding(false); setSavedCount(0); }} onSave={entry => { setFilter('all'); setNewId(entry.id); setSavedCount(count => count + 1); setSuccess(true); setRetry(value => value + 1); toast.success('Medical note saved', 'It is highlighted in the timeline.'); }} />}
      {success && !adding && <p className="mh-alert is-success" role="status"><Icon name="check" size={16} /> Medical note saved.</p>}
      {error && <div className="mh-alert is-error" role="alert"><span>{error}</span> <button className="button button-outline small" type="button" onClick={() => { if (entries.length) void loadMore(); else setRetry(value => value + 1); }}>Retry</button></div>}
      {loading && entries.length === 0 && <div role="status" className="mh-loading"><span className="sr-only">Loading medical history…</span><div className="skeleton mh-skeleton" /><div className="skeleton mh-skeleton" /></div>}
      {!loading && !error && entries.length === 0 && <div className="mh-empty">
        <span className="mh-empty-icon"><Icon name="file" size={26} /></span>
        <h3>{narrowed ? 'No matching records' : filter === 'all' ? emptyText?.title ?? 'No records yet' : `No ${categoryLabels[filter].toLowerCase()} yet`}</h3>
        <p>{narrowed ? 'Try another word, specialty or period.' : filter === 'all' ? emptyText?.body ?? 'No medical records yet. Entries added by your doctor after a visit will appear here.' : 'No entries in this category.'}</p>
      </div>}
      <MedicalEntryList key={path} entries={entries} openAll={Boolean(query) || Boolean(scope?.only)} newId={highlighted} newLabel={highlightId ? highlightLabel : undefined} onEdit={onEditEntry} />
      {hasMore && <button className="button button-outline mh-load-more" type="button" disabled={loading} onClick={() => void loadMore()}>{loading ? 'Loading…' : 'Load more'}</button>}
      {loading && entries.length > 0 && <p role="status" className="sr-only">Loading medical history…</p>}
    </div>
  </section>;
}
