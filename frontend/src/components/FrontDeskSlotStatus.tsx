import { useEffect, useState } from 'react';
import { authApi, ScheduleSlot } from '../lib/api';
const day = (value: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Almaty' }).format(new Date(value));
const time = (value: string) => new Intl.DateTimeFormat('en-GB', { timeStyle: 'short', timeZone: 'Asia/Almaty' }).format(new Date(value));
const labels = { FREE: 'Free', BOOKED: 'Booked', OCCUPIED: 'Occupied' };
export default function FrontDeskSlotStatus({ doctorId, startAt }: { doctorId: string; startAt: string }) {
  const [slots, setSlots] = useState<ScheduleSlot[]>([]); const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false); const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(false);
    authApi.getSchedule(doctorId, day(startAt)).then(result => { if (active) setSlots(result.slots); }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [doctorId, startAt, retry]);
  return <section className="fd-slot-status schedule-panel" aria-label="Selected doctor slot statuses">
    <h4>Doctor’s schedule · {day(startAt)}</h4>
    {loading ? <p className="skeleton" role="status">Loading slot statuses…</p> : error ? <div className="alert error" role="alert">Unable to load slot statuses. <button type="button" className="button button-outline" onClick={() => setRetry(value => value + 1)}>Retry</button></div> : slots.length ? <ul>{slots.map(slot => <li className="slot-card" key={slot.id}><time dateTime={slot.startAt}>{time(slot.startAt)}</time> <span className="status-pill">{labels[slot.status]}</span></li>)}</ul> : <p className="search-state">No slots on this date.</p>}
  </section>;
}
