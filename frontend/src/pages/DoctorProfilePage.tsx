import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import AvailabilityCalendar, { slotDateInAlmaty } from "../components/AvailabilityCalendar";
import { TimeSlotGrid } from "../components/AvailabilityCalendar";
import { useAuth } from "../context/AuthContext";
import { api, authApi, Doctor, ScheduleSlot } from "../lib/api";
import DoctorLocation from "../components/DoctorLocation";
import { doctorLocationText } from "../lib/doctorLocation";
import "../styles/findDoctor.css";
import "../styles/appScreens.css";

function initialsFor(doctor: Doctor) {
  return `${doctor.user.firstName.charAt(0)}${doctor.user.lastName.charAt(0)}`.toLocaleUpperCase();
}

export default function DoctorProfilePage() {
  const { doctorId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const routeDoctor = (location.state as { doctor?: Doctor } | null)?.doctor;
  const initialDoctor = routeDoctor && doctorId && routeDoctor.id === doctorId ? routeDoctor : null;
  const [doctor, setDoctor] = useState<Doctor | null>(initialDoctor);
  const [availabilitySlots, setAvailabilitySlots] = useState<ScheduleSlot[]>(initialDoctor?.scheduleSlots.map((slot) => ({ ...slot, status: "FREE" })) ?? []);
  const [availabilityError, setAvailabilityError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedSlotId, setSelectedSlotId] = useState("");
  const [loading, setLoading] = useState(!initialDoctor);
  const [error, setError] = useState("");
  const [profileRetry, setProfileRetry] = useState(0);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityRetry, setAvailabilityRetry] = useState(0);

  useEffect(() => {
    if (doctor?.id === doctorId || !doctorId) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setDoctor(null);
    setAvailabilitySlots([]);
    api<{ doctors: Doctor[] }>("/doctors", { signal: controller.signal })
      .then(({ doctors }) => {
        const match = doctors.find((item) => item.id === doctorId);
        if (!match) throw new Error("This doctor could not be found.");
        setDoctor(match);
        setAvailabilitySlots(match.scheduleSlots.map((slot) => ({ ...slot, status: "FREE" })));
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load this profile.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [doctor?.id, doctorId, profileRetry]);

  useEffect(() => {
    if (!doctor || user?.role !== "PATIENT") {
      setAvailabilityLoading(false);
      return;
    }
    let active = true;
    setAvailabilityLoading(true);
    setAvailabilityError("");
    setAvailabilitySlots([]);
    authApi.getSchedule(doctor.id)
      .then(({ slots }) => {
        if (active) setAvailabilitySlots(slots);
      })
      .catch((cause: unknown) => {
        if (active) setAvailabilityError(cause instanceof Error ? cause.message : "Unable to load appointment times.");
      })
      .finally(() => {
        if (active) setAvailabilityLoading(false);
      });
    return () => { active = false; };
  }, [availabilityRetry, doctor, user?.role]);

  useEffect(() => {
    const firstOpen = availabilitySlots.find((slot) => slot.status === "FREE" && Date.parse(slot.startAt) > Date.now());
    if (!selectedDate && firstOpen) setSelectedDate(slotDateInAlmaty(firstOpen.startAt));
    if (selectedSlotId && !availabilitySlots.some((slot) => slot.id === selectedSlotId && slot.status === "FREE")) {
      setSelectedSlotId("");
    }
  }, [availabilitySlots, selectedDate, selectedSlotId]);

  const selectedDaySlots = useMemo(
    () => availabilitySlots.filter((slot) => slotDateInAlmaty(slot.startAt) === selectedDate),
    [availabilitySlots, selectedDate],
  );
  const selectedSlot = selectedDaySlots.find((slot) =>
    slot.id === selectedSlotId && slot.status === "FREE" && Date.parse(slot.startAt) > Date.now(),
  ) ?? null;

  if (loading) {
    return (
      <div className="dp-page">
        <div className="dp-container">
          <p className="sr-only" role="status">Loading doctor profile and appointment availability…</p>
          <span className="dp-back dp-skeleton-line" aria-hidden="true" />
          <div className="dp-layout dp-skeleton-layout" aria-hidden="true">
            <div className="dp-main">
              <section className="dp-card dp-skeleton-card"><div className="dp-skeleton-overview"><span /><div><i /><i /><i /><i /></div></div></section>
              <section className="dp-card dp-skeleton-card"><i /><i /><i /></section>
              <section className="dp-card dp-skeleton-card"><i /><i /><i /></section>
            </div>
            <aside className="dp-card dp-skeleton-card"><i /><div className="dp-skeleton-calendar" /><div className="dp-skeleton-slots"><i /><i /><i /><i /></div></aside>
          </div>
        </div>
      </div>
    );
  }
  if (error || !doctor) {
    return (
      <div className="dp-page">
        <div className="dp-container">
          <div className="dp-card" role="alert">
            <h1>Doctor profile unavailable</h1>
            <p>{error || "This doctor could not be found."}</p>
            <button className="dp-retry" type="button" onClick={() => setProfileRetry((attempt) => attempt + 1)}>Try again</button>
            <Link className="button button-outline" to="/search">Back to Find Your Doctor</Link>
          </div>
        </div>
      </div>
    );
  }

  const doctorName = `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`;
  const schedulePath = selectedSlot
    ? `/book/${encodeURIComponent(doctor.id)}?step=1&date=${encodeURIComponent(slotDateInAlmaty(selectedSlot.startAt))}&slot=${encodeURIComponent(selectedSlot.id)}`
    : `/book/${encodeURIComponent(doctor.id)}?step=1`;
  const bookingState = {
    doctorName,
    specialty: doctor.category.name,
    office: doctorLocationText(doctor, ""),
    city: doctor.city,
    clinicName: doctor.clinicName,
    streetAddress: doctor.streetAddress,
    officeNumber: doctor.officeNumber,
    consultationFee: doctor.consultationFee,
  };
  const canBook = user?.role === "PATIENT";
  const hasUpcomingAvailability = availabilitySlots.some((slot) => slot.status === "FREE" && Date.parse(slot.startAt) > Date.now());
  const backPath = location.search ? `/search${location.search}` : "/search";

  return (
    <div className="dp-page">
      <div className="dp-container">
        <Link className="dp-back" to={backPath} aria-label="Back to doctor results">← Back to doctor results</Link>
        <div className="dp-layout">
          <div className="dp-main">
            <article className="dp-card">
              <div className="dp-profile-header">
                <div className="dp-avatar" aria-hidden="true">{initialsFor(doctor)}</div>
                <div>
                  <h1>{doctorName}</h1>
                  <p className="dp-specialty">{doctor.category.name}</p>
                  <div className="dp-badges">
                    {hasUpcomingAvailability
                      ? <span className="fd-status-badge fd-status-success">Accepting appointments</span>
                      : <span className="fd-status-badge fd-status-neutral">No appointments listed</span>}
                  </div>
                </div>
              </div>
              {doctor.consultationFee > 0 && <p className="dp-price">{new Intl.NumberFormat("en-US").format(doctor.consultationFee)} KZT / consultation</p>}
              <p className="dp-clinic"><DoctorLocation {...doctor} emptyText="Clinic location not listed" /></p>
            </article>

            <section className="dp-card" aria-labelledby="dp-about-title">
              <h2 id="dp-about-title">About this doctor</h2>
              <p className="dp-no-data">A biography, qualifications, and languages are not included in the doctor information currently provided by the service.</p>
            </section>

            <section className="dp-card" aria-labelledby="dp-services-title">
              <h2 id="dp-services-title">Services &amp; consultation types</h2>
              <p className="dp-service-summary">The booking service offers 30-minute appointments at the doctor’s listed office.</p>
              <p className="dp-info-note">Online consultation details and a separate service list are not available in the current doctor record.</p>
            </section>

            <section className="dp-card" aria-labelledby="dp-reviews-title">
              <h2 id="dp-reviews-title">Patient reviews</h2>
              <p className="dp-no-data">Reviews are not available from the current doctor service.</p>
            </section>
          </div>

          <aside className="dp-widget">
            <section className="dp-card" aria-labelledby="dp-book-title">
              <h2 id="dp-book-title">Book an appointment</h2>
              <p className="dp-clinic">Choose an available date and time.</p>
              <span className="fd-status-badge fd-status-neutral">In-person · 30 minutes</span>
              {availabilityError && (
                <div className="dp-inline-error" role="alert">
                  <span>{availabilityError}</span>
                  <button className="dp-inline-retry" type="button" onClick={() => setAvailabilityRetry((attempt) => attempt + 1)}>Retry availability</button>
                </div>
              )}
              <AvailabilityCalendar slots={availabilitySlots} selectedDate={selectedDate} displayDate={slotDateInAlmaty(new Date().toISOString())} onDateChange={(date) => {
                setSelectedDate(date);
                setSelectedSlotId("");
              }} compact />
              <p className="dp-selected-day">
                {selectedDate ? `Selected: ${new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${selectedDate}T12:00:00Z`))} · Asia/Almaty UTC+5` : "Select a date with available appointments."}
              </p>
              {availabilityLoading ? (
                <div className="dp-slot-skeleton" role="status" aria-label="Loading available times"><i /><i /><i /><i /></div>
              ) : (
                <TimeSlotGrid
                  slots={selectedDaySlots}
                  selectedSlotId={selectedSlotId}
                  onSelect={(slot) => setSelectedSlotId(slot.id)}
                  compact
                />
              )}
              {canBook ? (
                <button
                  className="dp-book-button"
                  type="button"
                  disabled={!selectedSlot}
                  onClick={() => navigate(schedulePath, { state: bookingState })}
                >
                  Book Appointment
                </button>
              ) : user ? (
                <button className="dp-book-button" type="button" disabled aria-describedby="dp-patient-account-note">
                  Patient account required
                </button>
              ) : (
                <Link className="dp-book-button" to="/login" state={{ from: schedulePath, returnState: bookingState }}>
                  Sign in to book
                </Link>
              )}
              {user && user.role !== "PATIENT" && <p id="dp-patient-account-note" className="dp-widget-footnote">Appointments can only be booked from a patient account.</p>}
              <p className="dp-widget-footnote">
                {doctor.consultationFee > 0 ? `${new Intl.NumberFormat("en-US").format(doctor.consultationFee)} KZT · ` : ""}
                Confirm your details in the next steps. No appointment is booked yet.
              </p>
            </section>
            <p className="dp-widget-info">Choose a free time, review your details, then confirm your appointment.</p>
          </aside>
        </div>
      </div>
    </div>
  );
}
