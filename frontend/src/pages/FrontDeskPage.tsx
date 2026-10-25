import { FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { authApi, FrontDeskAppointment, Receipt } from "../lib/api";
import WalkInSlotPicker, { PickedSlot } from "../components/WalkInSlotPicker";
import "../styles/frontDesk.css";
import { ReceiptDialog } from "../components/ReceiptView";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date());
const dateText = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeZone: "Asia/Almaty" }).format(new Date(value));
const timeText = (value: string) => new Intl.DateTimeFormat("en-GB", { timeStyle: "short", timeZone: "Asia/Almaty" }).format(new Date(value));

/** Check-in opens 30 minutes before the visit and closes when it ends (same rule as the API). */
const checkInOpen = (appointment: FrontDeskAppointment, now = Date.now()) =>
  Date.parse(appointment.startAt) - now <= 30 * 60_000 && Date.parse(appointment.endAt) > now;

type FrontDeskView = "appointments" | "walk-in";

export default function FrontDeskPage({ view = "appointments" }: { view?: FrontDeskView }) {
  const [query, setQuery] = useState("");
  const [appointments, setAppointments] = useState<FrontDeskAppointment[]>([]);
  const [selected, setSelected] = useState<FrontDeskAppointment | null>(null);
  const [patient, setPatient] = useState<{ firstName: string; lastName: string; iin: string; email: string; phone: string | null }>({ firstName: "", lastName: "", iin: "", email: "", phone: "" });
  const [picked, setPicked] = useState<PickedSlot | null>(null);
  const [pickerRefresh, setPickerRefresh] = useState(0);
  const [purpose, setPurpose] = useState("Walk-in consultation");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const loadAppointments = useCallback(async () => {
    try { setAppointments((await authApi.frontDeskAppointments(query)).appointments); setError(""); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Unable to load appointments."); }
  }, [query]);

  useEffect(() => { void loadAppointments(); }, [loadAppointments]);

  async function lookup(event?: FormEvent) {
    event?.preventDefault(); setError(""); setMessage("");
    if (!/^\d{12}$/.test(patient.iin)) { setError("IIN must contain exactly 12 digits."); return; }
    setBusy(true);
    try { const result = await authApi.frontDeskLookup(patient.iin); setPatient((current) => ({ ...current, ...result.patient })); setMessage("Existing patient found. Their record will be reused."); }
    catch (cause: unknown) { setMessage("No existing patient found. Complete the form to register a new patient."); if (cause instanceof Error && !/not found/i.test(cause.message)) setError(cause.message); }
    finally { setBusy(false); }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (!picked) { setError("Choose a free time with a doctor first."); return; }
    setBusy(true); setError(""); setMessage(""); setReceipt(null);
    try {
      const result = await authApi.frontDeskWalkIn({ ...patient, phone: patient.phone || undefined, doctorId: picked.doctorId, slotId: picked.slotId, visitPurpose: purpose });
      setMessage(`${patient.firstName} ${patient.lastName} is booked with ${picked.doctorName} at ${timeText(picked.startAt)} (${result.reference}, ${result.slot.status === "OCCUPIED" ? "checked in" : "booked"}). You can find the visit under Front desk.`);
      setPicked(null);
      setPickerRefresh((value) => value + 1);
      setPatient({ firstName: "", lastName: "", iin: "", email: "", phone: "" });
      setPurpose("Walk-in consultation");
      await loadAppointments();
      if (result.slot.status === "OCCUPIED") setReceipt((await authApi.receipt(result.slot.id)).receipt);
    } catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Walk-in registration failed."); }
    finally { setBusy(false); }
  }

  async function checkIn(appointment: FrontDeskAppointment) {
    setBusy(true); setError(""); setMessage(""); setReceipt(null);
    try { const result = await authApi.checkInAppointment(appointment.id); setMessage(`Check-in confirmed for ${result.reference}.`); setReceipt((await authApi.receipt(appointment.id)).receipt); await loadAppointments(); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Check-in failed."); }
    finally { setBusy(false); }
  }

  async function openReceipt(appointment: FrontDeskAppointment) {
    setError("");
    try { setReceipt((await authApi.receipt(appointment.id)).receipt); }
    catch (cause: unknown) { setError(cause instanceof Error ? cause.message : "Receipt is not available."); }
  }

  return <main className="front-desk-page">
    <header className="front-desk-heading fdk-banner">
      <div className="fdk-banner-copy">{view === "walk-in" ? <><h1>Walk-in registration</h1><p>Register a patient who arrived without a booking and give them the next free time.</p></> : <><h1>Front desk</h1><p>Find appointments and confirm arrivals.</p></>}</div>
      {view === "walk-in" ? <Link className="fdk-banner-link" to="/front-desk">Today’s appointments</Link> : <dl className="fdk-stats">
        <div><dt>Today’s visits</dt><dd>{appointments.filter((item) => item.startAt.slice(0, 10) && new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Almaty" }).format(new Date(item.startAt)) === today()).length}</dd></div>
        <div><dt>Waiting to check in</dt><dd>{appointments.filter((item) => item.status === "BOOKED").length}</dd></div>
        <div><dt>Checked in</dt><dd>{appointments.filter((item) => item.status === "OCCUPIED").length}</dd></div>
      </dl>}
    </header>
    {message && <div className="front-desk-alert success" role="status">{message}</div>}
    {error && <div className="front-desk-alert error" role="alert">{error}</div>}
    <div className={view === "walk-in" ? "fdk-walkin-layout" : "fdk-appointments-layout"}>
      {view === "appointments" && <section className="front-desk-card"><div className="fdk-section-head"><h2>Appointments</h2><Link className="fdk-walkin-link" to="/front-desk/walk-in">+ Walk-in</Link></div><p className="front-desk-muted">Booked and checked-in visits, soonest first.</p><form className="front-desk-search" onSubmit={(event) => { event.preventDefault(); void loadAppointments(); }}><input aria-label="Search appointments" placeholder="Patient, reference, or IIN" value={query} onChange={(event) => setQuery(event.target.value)} /><button className="button" type="submit">Search</button></form>
        {appointments.length > 0 && <div className="fdk-list-head" aria-hidden="true"><span /><span>Patient</span><span>Doctor</span><span>Date &amp; time</span><span>Reference</span><span>Status</span></div>}
        <div className="front-desk-list">{appointments.length ? appointments.map((appointment) => <article className={`front-desk-appointment${selected?.id === appointment.id ? " selected" : ""}`} key={appointment.id} onClick={() => setSelected(appointment)}>
          <span className="fdk-avatar" aria-hidden="true">{(appointment.patient?.name ?? "?").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</span>
          <div className="fdk-info">
            <strong>{appointment.patient?.name ?? "Unknown patient"}</strong>
            <span className="fdk-meta">{appointment.doctor.name}</span>
            <span className="fdk-when">{dateText(appointment.startAt)} · {timeText(appointment.startAt)}</span>
            <span className="fdk-ref">{appointment.reference}</span>
          </div>
          <div className="fdk-actions">
            <b className={`front-desk-status ${appointment.status.toLowerCase()}`}>{appointment.status === "OCCUPIED" ? "Checked in" : appointment.status === "BOOKED" ? "Booked" : appointment.status}</b>
            {appointment.status === "OCCUPIED" && <button className="fdk-receipt-btn" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void openReceipt(appointment); }}>Receipt</button>}
            {appointment.status === "BOOKED" && (checkInOpen(appointment)
              ? <button className="fdk-checkin" type="button" disabled={busy} onClick={(event) => { event.stopPropagation(); void checkIn(appointment); }}>Check in</button>
              : Date.parse(appointment.endAt) <= Date.now()
                ? <span className="fdk-checkin-later">Missed</span>
                : <span className="fdk-checkin-later">Check-in from {timeText(new Date(Date.parse(appointment.startAt) - 30 * 60_000).toISOString())}</span>)}
          </div>
        </article>) : <p className="front-desk-empty">No booked or checked-in appointments found.</p>}</div>
      </section>}
      {view === "walk-in" && <section className="front-desk-card fdk-walkin" aria-label="Register walk-in patient">
        <form onSubmit={register} className="front-desk-form">
          <fieldset className="fdk-step">
            <legend className="sr-only">Patient</legend>
            <h3 className="fdk-step-title" aria-hidden="true"><span className="fdk-step-number">1</span>Patient</h3>
            <p className="front-desk-muted fdk-step-hint">Search by IIN first. A matching patient record is reused automatically.</p>
            <div className="front-desk-inline"><label>IIN<input required inputMode="numeric" maxLength={12} value={patient.iin} onChange={(event) => setPatient({ ...patient, iin: event.target.value.replace(/\D/g, "").slice(0, 12) })} /></label><button className="button button-outline" type="button" disabled={busy} onClick={() => void lookup()}>Find patient</button></div>
            <div className="front-desk-two"><label>First name<input required value={patient.firstName} onChange={(event) => setPatient({ ...patient, firstName: event.target.value })} /></label><label>Last name<input required value={patient.lastName} onChange={(event) => setPatient({ ...patient, lastName: event.target.value })} /></label></div>
            <div className="front-desk-two"><label>Email<input type="email" value={patient.email} onChange={(event) => setPatient({ ...patient, email: event.target.value })} /></label><label>Phone<input value={patient.phone ?? ""} onChange={(event) => setPatient({ ...patient, phone: event.target.value })} /></label></div>
          </fieldset>
          <fieldset className="fdk-step">
            <legend className="sr-only">Doctor and time</legend>
            <h3 className="fdk-step-title" aria-hidden="true"><span className="fdk-step-number">2</span>Doctor and time</h3>
            <WalkInSlotPicker value={picked} onChange={setPicked} refreshKey={pickerRefresh} disabled={busy} />
          </fieldset>
          <fieldset className="fdk-step">
            <legend className="sr-only">Confirm</legend>
            <h3 className="fdk-step-title" aria-hidden="true"><span className="fdk-step-number">3</span>Confirm</h3>
            {picked ? (
              <div className="fdk-picked">
                <span className="fdk-picked-time">{timeText(picked.startAt)}</span>
                <div><strong>{picked.doctorName}</strong><small>{picked.specialty}{picked.office ? ` · ${picked.office}` : ""} · {dateText(picked.startAt)}</small></div>
                <button type="button" className="fdk-picked-clear" onClick={() => setPicked(null)}>Change</button>
              </div>
            ) : <p className="fdk-picked-empty">Pick a free time above.</p>}
            <label>Visit purpose<input required value={purpose} onChange={(event) => setPurpose(event.target.value)} maxLength={300} /></label>
            <button className="button" disabled={busy || !picked}>{busy ? "Saving…" : picked ? `Register and book ${timeText(picked.startAt)}` : "Register and book"}</button>
          </fieldset>
        </form></section>}
    </div>
    {receipt && <ReceiptDialog receipt={receipt} onClose={() => setReceipt(null)} />}
  </main>;
}
