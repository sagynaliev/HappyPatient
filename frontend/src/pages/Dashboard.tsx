import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth, roleLabel } from "../context/AuthContext";
import { AppNotification, authApi, PatientAppointment, Receipt } from "../lib/api";
import { Icon } from "../components/Icons";
import { NotificationItem } from "../components/NotificationItem";
import { ReceiptDialog } from "../components/ReceiptView";
import { downloadReceiptPdf } from "../lib/receiptPdf";
import DoctorDashboard from "./DoctorDashboard";
import { MiniCalendar } from "../components/MiniCalendar";
import "../styles/patientDashboard.css";

const TZ = "Asia/Almaty";
const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: TZ, ...options });
const longDate = fmt({ weekday: "long", day: "numeric", month: "long" });
const shortDate = fmt({ weekday: "short", day: "numeric", month: "short" });
const clock = fmt({ hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const dayKey = (value: string | Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(value));

function greeting(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(now));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function daysUntil(value: string) {
  const diff = Math.round((Date.parse(`${dayKey(value)}T00:00:00Z`) - Date.parse(`${dayKey(new Date())}T00:00:00Z`)) / 86_400_000);
  if (diff <= 0) return "today";
  if (diff === 1) return "tomorrow";
  return `in ${diff} days`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [appointments, setAppointments] = useState<PatientAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [latestReceipt, setLatestReceipt] = useState<Receipt | null>(null);
  const [receiptError, setReceiptError] = useState("");
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptDialog, setReceiptDialog] = useState<Receipt | null>(null);
  const [printReceipt, setPrintReceipt] = useState(false);

  const load = useCallback(() => {
    setLoading(true); setError("");
    authApi.myAppointments()
      .then(({ appointments: result }) => setAppointments(result))
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Unable to load your appointments."))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { if (user?.role === "PATIENT") load(); }, [user?.role, load]);

  useEffect(() => {
    if (user?.role !== "PATIENT") return;
    authApi.notifications().then((result) => setNotifications(result.notifications.slice(0, 4))).catch(() => setNotifications([]));
  }, [user?.role]);

  const { upcoming, past, marked } = useMemo(() => {
    const now = Date.now();
    const active = appointments.filter((item) => item.status === "BOOKED" || item.status === "OCCUPIED");
    return {
      upcoming: active.filter((item) => Date.parse(item.endAt) > now).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt)),
      past: active.filter((item) => Date.parse(item.endAt) <= now),
      marked: new Set(active.map((item) => dayKey(item.startAt))),
    };
  }, [appointments]);

  const latestCheckedIn = useMemo(() => appointments.filter((item) => item.status === "OCCUPIED").sort((a, b) => Date.parse(b.checkedInAt ?? b.startAt) - Date.parse(a.checkedInAt ?? a.startAt))[0], [appointments]);
  useEffect(() => {
    if (!latestCheckedIn) { setLatestReceipt(null); setReceiptError(""); return; }
    let active = true;
    setReceiptBusy(true); setReceiptError("");
    authApi.receipt(latestCheckedIn.id).then(({ receipt }) => { if (active) setLatestReceipt(receipt); }).catch((cause: unknown) => { if (active) setReceiptError(cause instanceof Error ? cause.message : "Receipt is unavailable."); }).finally(() => { if (active) setReceiptBusy(false); });
    return () => { active = false; };
  }, [latestCheckedIn?.id]);

  useEffect(() => {
    if (!receiptDialog || !printReceipt) return;
    const timer = window.setTimeout(() => { document.body.classList.add("hp-printing-receipt"); window.print(); setPrintReceipt(false); }, 180);
    return () => window.clearTimeout(timer);
  }, [receiptDialog, printReceipt]);

  async function downloadLatestReceipt() {
    if (!latestReceipt) return;
    setReceiptBusy(true); setReceiptError("");
    try { await downloadReceiptPdf(latestReceipt); }
    catch (cause: unknown) { setReceiptError(cause instanceof Error ? cause.message : "Unable to download this receipt."); }
    finally { setReceiptBusy(false); }
  }

  if (!user) return null;
  if (user.role === "DOCTOR") return <DoctorDashboard />;

  if (user.role !== "PATIENT") {
    return (
      <div className="pt-page" aria-label={`${roleLabel(user.role)} dashboard`}>
        <section className="pt-banner">
          <div className="pt-banner-copy">
            <span className="pt-date-chip"><Icon name="calendar" size={16} /> {longDate.format(new Date())}</span>
            <h1>{greeting()}, {user.firstName}!</h1>
            <p>Use the menu to manage the clinic.</p>
          </div>
        </section>
      </div>
    );
  }

  const next = upcoming[0];
  const later = upcoming.slice(1, 4);

  return (
    <div className="pt-page" aria-label={`${roleLabel(user.role)} dashboard`}>
      <div className="pt-layout">
        <div className="pt-main">
          <section className="pt-banner">
            <div className="pt-banner-copy">
              <span className="pt-date-chip"><Icon name="calendar" size={16} /> {longDate.format(new Date())}</span>
              <h1>{greeting()}, {user.firstName}!</h1>
              <p>{next ? `Your next visit is ${daysUntil(next.startAt)}, ${shortDate.format(new Date(next.startAt))} at ${clock.format(new Date(next.startAt))}.` : "You have no visits planned. Find a doctor and book a time that suits you."}</p>
              <Link className="pt-banner-button" to="/search"><Icon name="search" size={18} /> Book a visit</Link>
            </div>
            <div className="pt-banner-art" aria-hidden="true">
              <span className="pt-orb pt-orb-1" />
              <span className="pt-orb pt-orb-2" />
              <span className="pt-art-card"><Icon name="stethoscope" size={54} /></span>
              <span className="pt-art-pill pt-art-pill-1"><Icon name="check" size={14} /> Online booking</span>
              <span className="pt-art-pill pt-art-pill-2"><Icon name="shield" size={14} /> Verified doctors</span>
            </div>
          </section>

          <div className="pt-stats">
            <div className="pt-card pt-stat">
              <span className="pt-stat-icon is-blue"><Icon name="calendar" /></span>
              <div><strong>{loading ? "–" : upcoming.length}</strong><span>Upcoming visits</span></div>
            </div>
            <div className="pt-card pt-stat">
              <span className="pt-stat-icon is-green"><Icon name="check" /></span>
              <div><strong>{loading ? "–" : past.length}</strong><span>Completed visits</span></div>
            </div>
            <div className="pt-card pt-stat">
              <span className="pt-stat-icon is-violet"><Icon name="clock" /></span>
              <div><strong>{next ? daysUntil(next.startAt) : "—"}</strong><span>Until next visit</span></div>
            </div>
          </div>

          <section className="pt-card pt-next" aria-labelledby="pt-next-title">
            <header className="pt-section-head">
              <h2 id="pt-next-title">Upcoming appointment</h2>
              <Link to="/appointments" className="pt-link">All appointments</Link>
            </header>
            {loading ? (
              <div className="pt-empty" role="status">Loading your appointments…</div>
            ) : error ? (
              <div className="pt-empty" role="alert">
                <p>{error}</p>
                <button className="button button-outline small" type="button" onClick={load}>Try again</button>
              </div>
            ) : next ? (
              <article className="pt-visit">
                <div className="pt-visit-date">
                  <span>{fmt({ month: "short" }).format(new Date(next.startAt))}</span>
                  <strong>{fmt({ day: "numeric" }).format(new Date(next.startAt))}</strong>
                </div>
                <div className="pt-visit-body">
                  <h3>{next.doctor.name}</h3>
                  <p className="pt-visit-specialty">{next.doctor.specialty}</p>
                  <ul className="pt-visit-meta">
                    <li><Icon name="clock" size={16} /> {clock.format(new Date(next.startAt))}–{clock.format(new Date(next.endAt))}</li>
                    {next.doctor.office && <li><Icon name="pin" size={16} /> {next.doctor.office}</li>}
                  </ul>
                </div>
                <span className={`pt-pill ${next.status === "OCCUPIED" ? "is-blue" : "is-green"}`}>{next.status === "OCCUPIED" ? "Checked in" : "Booked"}</span>
              </article>
            ) : (
              <div className="pt-empty">
                <span className="pt-empty-icon"><Icon name="calendar" size={26} /></span>
                <h3>No upcoming visit yet</h3>
                <p>Your next appointment will appear here once you book it.</p>
                <Link className="button small" to="/search">Find a doctor</Link>
              </div>
            )}
            {later.length > 0 && (
              <ul className="pt-later">
                {later.map((item) => (
                  <li key={item.id}>
                    <span className="pt-later-time">{shortDate.format(new Date(item.startAt))} · {clock.format(new Date(item.startAt))}</span>
                    <strong>{item.doctor.name}</strong>
                    <span className="pt-later-spec">{item.doctor.specialty}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="pt-card pt-latest-receipt" aria-labelledby="pt-receipt-title">
            <header className="pt-section-head"><h2 id="pt-receipt-title">Latest receipt</h2></header>
            {!latestCheckedIn ? <p className="pt-receipt-empty">You’ll find your receipt here after check-in. <Link to="/search">Find a doctor</Link></p> : receiptBusy && !latestReceipt ? <p role="status">Loading your latest receipt…</p> : receiptError && !latestReceipt ? <div role="alert"><p>{receiptError}</p><Link to="/appointments">Open appointments</Link></div> : latestReceipt ? <>
              <dl className="pt-receipt-summary">
                <div><dt>Doctor</dt><dd>{latestReceipt.doctor}</dd></div>
                <div><dt>Date</dt><dd>{shortDate.format(new Date(latestReceipt.startAt))}</dd></div>
                <div><dt>Time</dt><dd>{clock.format(new Date(latestReceipt.startAt))}–{clock.format(new Date(latestReceipt.endAt))}</dd></div>
                <div><dt>Amount</dt><dd>{typeof latestReceipt.consultationFee === "number" ? `${new Intl.NumberFormat("en-US").format(latestReceipt.consultationFee)} KZT` : "Not listed"}</dd></div>
                <div><dt>Booking ID</dt><dd>{latestReceipt.reference}</dd></div>
              </dl>
              {receiptError && <p role="alert">{receiptError}</p>}
              <div className="pt-receipt-actions">
                <button className="button button-outline small" type="button" onClick={() => setReceiptDialog(latestReceipt)}>View</button>
                <button className="button button-outline small" type="button" disabled={receiptBusy} onClick={() => void downloadLatestReceipt()}>{receiptBusy ? "Preparing…" : "Download PDF"}</button>
                <button className="button button-outline small" type="button" onClick={() => { setReceiptDialog(latestReceipt); setPrintReceipt(true); }}>Print</button>
              </div>
            </> : null}
          </section>

          <section className="pt-card pt-notifications" aria-labelledby="pt-notifications-title">
            <header className="pt-section-head"><h2 id="pt-notifications-title">Notifications</h2></header>
            {notifications.length ? <ul className="notification-panel-list">{notifications.map((item) => <NotificationItem key={item.id} item={item} role="PATIENT" />)}</ul> : <p className="pt-receipt-empty">Booking and cancellation updates will appear here.</p>}
          </section>

          <section className="pt-quick" aria-label="Quick actions">
            <Link className="pt-card pt-quick-item" to="/search"><span className="pt-stat-icon is-blue"><Icon name="search" /></span><span><strong>Find a doctor</strong><small>Search by name or specialty</small></span></Link>
            <Link className="pt-card pt-quick-item" to="/appointments"><span className="pt-stat-icon is-violet"><Icon name="calendar" /></span><span><strong>Manage visits</strong><small>Cancel, check in, receipts</small></span></Link>
            <Link className="pt-card pt-quick-item" to="/profile"><span className="pt-stat-icon is-green"><Icon name="user" /></span><span><strong>My profile</strong><small>Contact details and IIN</small></span></Link>
          </section>
        </div>

        <aside className="pt-side">
          <section className="pt-card pt-profile">
            <header className="pt-profile-head">
              <h2>My profile</h2>
              <Link to="/profile" className="pt-round" aria-label="Edit profile"><Icon name="file" size={16} /></Link>
            </header>
            <div className="pt-profile-body">
              <span className="pt-avatar">{`${user.firstName[0] || ""}${user.lastName[0] || ""}`.toUpperCase()}</span>
              <div>
                <strong>{user.firstName} {user.lastName}</strong>
                <span>{roleLabel(user.role)}</span>
              </div>
            </div>
            <dl className="pt-profile-facts">
              <div><dt>Email</dt><dd>{user.email}</dd></div>
              <div><dt>Phone</dt><dd>{user.phone || "Not added"}</dd></div>
            </dl>
          </section>
          <MiniCalendar marked={marked} />
        </aside>
      </div>
      {receiptDialog && <ReceiptDialog receipt={receiptDialog} onClose={() => { setReceiptDialog(null); setPrintReceipt(false); }} />}
    </div>
  );
}
