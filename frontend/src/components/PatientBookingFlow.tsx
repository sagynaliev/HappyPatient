import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import AvailabilityCalendar, {
  formatDateInAlmaty,
  formatTimeInAlmaty,
  slotDateInAlmaty,
  TimeSlotGrid,
} from "./AvailabilityCalendar";
import { DoctorProfile, ScheduleSlot, User } from "../lib/api";
import DoctorLocation from "./DoctorLocation";
import { doctorLocationText } from "../lib/doctorLocation";
import { Icon } from "./Icons";
import { BreadcrumbLabel } from "../lib/breadcrumbStore";

type BookingSuccess = {
  doctorName: string;
  date: string;
  time: string;
  purpose: string;
  slot: ScheduleSlot;
  reference: string;
};

type BookingStep = 1 | 2 | 3 | 4;

type PatientBookingFlowProps = {
  doctor: DoctorProfile | null;
  doctorName: string;
  consultationFee?: number;
  patient: User | null;
  date: string;
  onDateChange: (date: string) => void;
  slots: ScheduleSlot[];
  selectedSlot: ScheduleSlot | null;
  onSelectSlot: (slot: ScheduleSlot) => void;
  visitPurpose: string;
  onVisitPurposeChange: (value: string) => void;
  busy: boolean;
  refreshing: boolean;
  error: string;
  bookingSuccess: BookingSuccess | null;
  rescheduleFrom?: { startAt: string; endAt: string } | null;
  onConfirm: (event: FormEvent<HTMLFormElement>) => void;
  onSlotTaken: () => void;
};

const steps = ["Consultation type", "Date and time", "Patient details", "Review and confirm"] as const;
const stepIcons = ["stethoscope", "calendar", "user", "file"] as const;

function initials(firstName?: string, lastName?: string) {
  return `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toLocaleUpperCase();
}

function formatFullDate(date: string) {
  return formatDateInAlmaty(date, { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function escapeCalendarText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function downloadCalendarEvent(doctorName: string, slot: ScheduleSlot, office: string) {
  const localDate = slotDateInAlmaty(slot.startAt).replace(/-/g, "");
  const localTime = (value: string) => formatTimeInAlmaty(value).replace(":", "") + "00";
  const calendar = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Happy Patient//Appointment//EN",
    "BEGIN:VEVENT",
    `DTSTART;TZID=Asia/Almaty:${localDate}T${localTime(slot.startAt)}`,
    `DTEND;TZID=Asia/Almaty:${slotDateInAlmaty(slot.endAt).replace(/-/g, "")}T${localTime(slot.endAt)}`,
    `SUMMARY:${escapeCalendarText(`Appointment with ${doctorName}`)}`,
    ...(office ? [`LOCATION:${escapeCalendarText(office)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([calendar], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "happy-patient-appointment.ics";
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function PatientBookingFlow({
  doctor,
  doctorName,
  consultationFee,
  patient,
  date,
  onDateChange,
  slots,
  selectedSlot,
  onSelectSlot,
  visitPurpose,
  onVisitPurposeChange,
  busy,
  refreshing,
  error,
  bookingSuccess,
  rescheduleFrom,
  onConfirm,
  onSlotTaken,
}: PatientBookingFlowProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryStep = Number(searchParams.get("step"));
  // Visits are in person only, so there is nothing to choose in step 1: booking opens on the date and time.
  // Steps keep their internal numbers 2–4 (also in the address); the patient sees them as 1–3.
  const initialStep = queryStep >= 2 && queryStep <= 4 ? queryStep as BookingStep : 2;
  const [step, setStepState] = useState<BookingStep>(initialStep);
  const [detailsConfirmed, setDetailsConfirmed] = useState(false);
  const groupedSlots = useMemo(
    () => slots.filter((slot) => slotDateInAlmaty(slot.startAt) === date),
    [date, slots],
  );
  const emailValid = Boolean(patient?.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(patient.email));
  const patientDetailsValid = Boolean(patient?.firstName.trim() && patient.lastName.trim() && emailValid && visitPurpose.trim() && detailsConfirmed);

  function goToStep(nextStep: BookingStep) {
    setStepState(nextStep);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("step", String(nextStep));
      return next;
    });
  }

  useEffect(() => {
    if (bookingSuccess) return;
    const requestedStep = queryStep >= 2 && queryStep <= 4 ? queryStep as BookingStep : 2;
    const slotIsBookable = Boolean(
      selectedSlot && selectedSlot.status === "FREE" && Date.parse(selectedSlot.startAt) > Date.now(),
    );
    const furthestAllowedStep: BookingStep = !slotIsBookable
        ? 2
        : !patientDetailsValid
          ? 3
          : 4;
    const allowedStep = Math.min(requestedStep, furthestAllowedStep) as BookingStep;
    if (allowedStep !== requestedStep) {
      setSearchParams((current) => {
        const next = new URLSearchParams(current);
        next.set("step", String(allowedStep));
        return next;
      });
    }
    setStepState(allowedStep);
  }, [bookingSuccess, patientDetailsValid, queryStep, selectedSlot, setSearchParams]);

  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const successHandled = useRef(false);
  useEffect(() => {
    if (!bookingSuccess) { successHandled.current = false; return; }
    if (successHandled.current) return;
    successHandled.current = true;
    setStepState(4);
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("step", "4");
      return next;
    }, { replace: true });
    requestAnimationFrame(() => confirmationHeadingRef.current?.focus());
  }, [bookingSuccess, setSearchParams]);

  useEffect(() => {
    if (error && /slot is no longer available|no longer available/i.test(error)) {
      goToStep(2);
      onSlotTaken();
    }
  }, [error, onSlotTaken]);

  const fee = typeof consultationFee === "number" && consultationFee > 0
    ? `${new Intl.NumberFormat("en-US").format(consultationFee)} KZT`
    : "";
  const office = doctor ? doctorLocationText(doctor, "") : "";
  const selectedDate = selectedSlot ? slotDateInAlmaty(selectedSlot.startAt) : date;
  const selectedTime = selectedSlot
    ? `${formatTimeInAlmaty(selectedSlot.startAt)}–${formatTimeInAlmaty(selectedSlot.endAt)}`
    : "";

  const summarySlot = bookingSuccess ? bookingSuccess.slot : selectedSlot;
  const summaryTime = summarySlot ? `${formatTimeInAlmaty(summarySlot.startAt)}–${formatTimeInAlmaty(summarySlot.endAt)}` : "";

  // Small progress dots inside the current step of the vertical stepper.
  const subSteps: Record<number, { label: string; done: boolean }[]> = {
    2: [{ label: "Date", done: Boolean(date) }, { label: "Time", done: Boolean(selectedSlot) }],
    3: [
      { label: "Contact details", done: emailValid },
      { label: "Reason for visit", done: Boolean(visitPurpose.trim()) },
      { label: "Details confirmed", done: detailsConfirmed },
    ],
    4: [{ label: "Details checked", done: true }, { label: "Booking complete", done: Boolean(bookingSuccess) }],
  };
  const stepHints = [
    "In-person visit",
    summarySlot ? summaryTime : "Pick a day and time",
    "Contact and reason",
    "Check and confirm",
  ];

  const confirmationCard = bookingSuccess ? (
    <section className="bk-card" role="status" aria-live="polite" aria-labelledby="bk-step-title">
      <header className="bk-card-heading">
        <h2 id="bk-step-title" ref={confirmationHeadingRef} tabIndex={-1}>3. {steps[3]}</h2>
        <p>Your appointment is booked. These are the details that were saved.</p>
      </header>
      <div className="bk-confirmed-banner">
        <span className="bk-badge bk-badge--success">Confirmed</span>
        <strong>You’re all set, {patient?.firstName || "patient"}.</strong>
      </div>
      <div className="bk-review">
        <dl>
          <div><dt>Doctor</dt><dd>{bookingSuccess.doctorName}{doctor ? ` · ${doctor.category.name}` : ""}</dd></div>
          <div><dt>Consultation</dt><dd>In-person · 30 minutes</dd></div>
          <div><dt>Date & time</dt><dd>{formatFullDate(slotDateInAlmaty(bookingSuccess.slot.startAt))} · {summaryTime}</dd></div>
          <div><dt>Timezone</dt><dd>Asia/Almaty · UTC+5</dd></div>
          {office && doctor && <div><dt>Clinic</dt><dd><DoctorLocation {...doctor} /></dd></div>}
          <div><dt>Patient</dt><dd>{patient ? `${patient.firstName} ${patient.lastName}` : ""}</dd></div>
          <div><dt>Email</dt><dd>{patient?.email || ""}</dd></div>
          <div><dt>Phone</dt><dd>{patient?.phone || "Not provided"}</dd></div>
          {bookingSuccess.purpose && <div><dt>Visit reason</dt><dd>{bookingSuccess.purpose}</dd></div>}
          <div><dt>Booking ID</dt><dd>{bookingSuccess.reference}</dd></div>
          <div><dt>Status</dt><dd>{bookingSuccess.slot.status === "OCCUPIED" ? "Checked in" : "Booked"}</dd></div>
          {fee && <div className="bk-review-total"><dt>Total consultation fee</dt><dd>{fee}</dd></div>}
        </dl>
      </div>
      <p className="bk-info bk-info--success">A booking notification is waiting under the bell.</p>
    </section>
  ) : null;
  const nextCards = bookingSuccess ? (
    <div className="bk-next">
              <section className="bk-card bk-next-card">
                <h2>What happens next</h2>
                <ol className="bk-next-steps">
                  <li>
                    <span className="bk-next-icon" aria-hidden="true"><Icon name="check" size={18} /></span>
                    <div><strong>Booking saved</strong><span>You’ll find it under the bell and in My appointments.</span></div>
                  </li>
                  <li>
                    <span className="bk-next-icon" aria-hidden="true"><Icon name="clock" size={18} /></span>
                    <div><strong>Arrive 10 minutes early</strong><span>{formatDateInAlmaty(slotDateInAlmaty(bookingSuccess.slot.startAt), { weekday: "short", day: "numeric", month: "short" })} · {formatTimeInAlmaty(bookingSuccess.slot.startAt)}{office ? ` · ${office}` : ""}</span></div>
                  </li>
                  <li>
                    <span className="bk-next-icon" aria-hidden="true"><Icon name="desk" size={18} /></span>
                    <div><strong>Check in at the front desk</strong><span>Check-in opens at {formatTimeInAlmaty(new Date(Date.parse(bookingSuccess.slot.startAt) - 30 * 60_000).toISOString())}. Give your name or IIN.</span></div>
                  </li>
                  <li>
                    <span className="bk-next-icon" aria-hidden="true"><Icon name="file" size={18} /></span>
                    <div><strong>Get your receipt</strong><span>After check-in you can download or print it.</span></div>
                  </li>
                </ol>
              </section>
              <section className="bk-card bk-next-change">
                <span className="bk-next-icon" aria-hidden="true"><Icon name="calendar" size={18} /></span>
                <div>
                  <strong>Plans changed?</strong>
                  <span>Cancel from My appointments so the time goes back to other patients.</span>
                </div>
                <Link className="button button-outline" to="/appointments">Manage</Link>
              </section>
    </div>
  ) : null;
  const recapCard = bookingSuccess && step < 4 ? (
    <section className="bk-card" aria-labelledby="bk-recap-title">
      <header className="bk-card-heading">
        <h2 id="bk-recap-title">{step - 1}. {steps[step - 1]}</h2>
        <p>This is what you chose. Your booking is already confirmed.</p>
      </header>
      <div className="bk-review">
        <dl>
          {step === 2 && (
            <>
              <div><dt>Date</dt><dd>{formatFullDate(slotDateInAlmaty(bookingSuccess.slot.startAt))}</dd></div>
              <div><dt>Time</dt><dd>{formatTimeInAlmaty(bookingSuccess.slot.startAt)}–{formatTimeInAlmaty(bookingSuccess.slot.endAt)}</dd></div>
              <div><dt>Timezone</dt><dd>Asia/Almaty · UTC+5</dd></div>
            </>
          )}
          {step === 3 && (
            <>
              <div><dt>Patient</dt><dd>{patient ? `${patient.firstName} ${patient.lastName}` : ""}</dd></div>
              <div><dt>Email</dt><dd>{patient?.email || ""}</dd></div>
              <div><dt>Phone</dt><dd>{patient?.phone || "Not provided"}</dd></div>
              <div><dt>Reason for visit</dt><dd>{bookingSuccess.purpose || visitPurpose.trim()}</dd></div>
            </>
          )}
        </dl>
      </div>
      <button className="button button-outline bk-recap-back" type="button" onClick={() => goToStep(4)}>Back to confirmation</button>
    </section>
  ) : null;

  return (
    <div className="bk-page">
      <div className="bk-container">
        <BreadcrumbLabel id="doctor" label={doctor ? doctorName : undefined} />
        <BreadcrumbLabel id="bookingStage" label={bookingSuccess ? "Confirmation" : undefined} />
        {!bookingSuccess && step === 2 ? (
          <Link className="bk-back" to={`/doctors/${doctor?.id ?? ""}`}>← Back to doctor profile</Link>
        ) : null}
        <header className="bk-page-heading">
          <h1>{bookingSuccess ? "Appointment confirmed" : rescheduleFrom ? "Change your appointment" : "Book your appointment"}</h1>
          {rescheduleFrom && !bookingSuccess && (
            <p className="bk-reschedule-note">Your current booking: {formatFullDate(slotDateInAlmaty(rescheduleFrom.startAt))} · {formatTimeInAlmaty(rescheduleFrom.startAt)}–{formatTimeInAlmaty(rescheduleFrom.endAt)}. It stays active until you confirm the new time.</p>
          )}
        </header>

        {doctor ? (
          <div className="bk-layout">
            <div className="bk-main">
              {bookingSuccess ? (step === 4 ? <>{confirmationCard}{nextCards}</> : recapCard) : (<section className="bk-card" aria-labelledby="bk-step-title">
                <header className="bk-card-heading">
                  <h2 id="bk-step-title">{step - 1}. {steps[step - 1]}</h2>
                  <p>{step === 2
                      ? "Pick a day, then a free time."
                      : step === 3
                        ? "Check your contact details so your clinic can reach you."
                        : "Please check every detail before the final confirmation."}</p>
                </header>

                {step === 2 && (
                  <div className="bk-date-time">
                    <div className="bk-dt-calendar">
                      <AvailabilityCalendar slots={slots} selectedDate={date} onDateChange={(nextDate) => {
                        onDateChange(nextDate);
                      }} />
                    </div>
                    <div className="bk-dt-times">
                    {refreshing && <p className="bk-info" role="status">Refreshing appointment availability…</p>}
                    <p className="bk-selected-line">
                      {selectedDate
                        ? `Selected: ${formatDateInAlmaty(selectedDate, { weekday: "short", day: "numeric", month: "long" })} · Asia/Almaty UTC+5`
                        : "Select a date with available appointments."}
                    </p>
                    {selectedDate && <h3>{formatDateInAlmaty(selectedDate, { weekday: "long", day: "numeric", month: "long" })}</h3>}
                    <TimeSlotGrid slots={groupedSlots} selectedSlotId={selectedSlot?.id} onSelect={onSelectSlot} disabled={busy || refreshing} />
                    <p className="bk-info">
                      All times use Asia/Almaty (UTC+5). {selectedTime ? `Selected: ${selectedTime}. ` : ""}
                      Your appointment is not booked until you confirm the review step.
                    </p>
                    </div>
                  </div>
                )}

                {step === 3 && (
                  <div className="bk-patient-details">
                    <div className="bk-grid-2">
                      <label className="bk-field"><span>First Name *</span><input value={patient?.firstName ?? ""} readOnly aria-required="true" /></label>
                      <label className="bk-field"><span>Last Name *</span><input value={patient?.lastName ?? ""} readOnly aria-required="true" /></label>
                    </div>
                    <div className="bk-grid-2">
                    <label className="bk-field">
                      <span>Email Address *</span>
                      <input value={patient?.email ?? ""} readOnly aria-required="true" aria-invalid={!emailValid} aria-describedby={!emailValid ? "bk-email-error" : undefined} />
                      {!emailValid && <small className="field-error" id="bk-email-error">A valid email address is required in your profile.</small>}
                    </label>
                    <label className="bk-field">
                      <span>Phone Number</span>
                      <input value={patient?.phone ?? "Not provided"} readOnly />
                    </label>
                    </div>
                    <div className="bk-grid-2">
                    <div className="bk-field">
                      <label htmlFor="bk-visit-purpose">Reason for visit *</label>
                      <input id="bk-visit-purpose" value={visitPurpose} onChange={(event) => onVisitPurposeChange(event.target.value)} maxLength={300} required aria-required="true" aria-describedby="bk-reason-hint" />
                      <small className="bk-field-hint" id="bk-reason-hint">A short reason is required to submit this booking.</small>
                    </div>
                    <label className="bk-field">
                      <span>Additional notes (optional)</span>
                      <textarea disabled aria-describedby="bk-notes-hint" placeholder="Additional notes are not supported by the booking service." />
                      <small className="bk-field-hint" id="bk-notes-hint">Additional notes are not sent or stored by the existing booking service.</small>
                    </label>
                    </div>
                    <label className="bk-confirm-checkbox">
                      <input type="checkbox" checked={detailsConfirmed} onChange={(event) => setDetailsConfirmed(event.target.checked)} />
                      <span>These details are correct for my appointment.</span>
                    </label>
                  </div>
                )}

                {step === 4 && (
                  <div className="bk-review">
                    <dl>
                      <div><dt>Doctor</dt><dd>{doctorName} · {doctor.category.name}</dd></div>
                      <div><dt>Consultation</dt><dd>In-person · 30 minutes</dd></div>
                      <div><dt>Date & time</dt><dd>{selectedSlot ? `${formatFullDate(slotDateInAlmaty(selectedSlot.startAt))} · ${selectedTime}` : ""}</dd></div>
                      <div><dt>Timezone</dt><dd>Asia/Almaty · UTC+5</dd></div>
                      <div><dt>Clinic</dt><dd>{doctor ? <DoctorLocation {...doctor} /> : "Location not listed"}</dd></div>
                      <div><dt>Patient</dt><dd>{patient ? `${patient.firstName} ${patient.lastName}` : ""}</dd></div>
                      <div><dt>Email</dt><dd>{patient?.email || ""}</dd></div>
                      <div><dt>Phone</dt><dd>{patient?.phone || "Not provided"}</dd></div>
                      {visitPurpose.trim() && <div><dt>Visit reason</dt><dd>{visitPurpose.trim()}</dd></div>}
                      {fee && <div className="bk-review-total"><dt>Total consultation fee</dt><dd>{fee}</dd></div>}
                    </dl>
                    <div className="bk-info">
                      <strong>Ready to confirm?</strong>
                      <span>The appointment is created only when you choose Confirm Appointment below.</span>
                    </div>
                  </div>
                )}

                {error && step === 4 && (
                  <div className="alert error bk-booking-error" role="alert">
                    <strong>Appointment could not be confirmed.</strong>
                    <span>{error}</span>
                    <button className="text-link" type="button" onClick={(event) => {
                      const form = event.currentTarget.closest(".bk-layout")?.querySelector<HTMLFormElement>(".bk-action-form");
                      form?.requestSubmit();
                    }}>Try again</button>
                  </div>
                )}
                {error && step !== 4 && (
                  <div className="alert error bk-booking-error" role="alert">{error}</div>
                )}
              </section>)}

              {bookingSuccess && (
                <div className="bk-action-bar">
                  <span>Booked · {bookingSuccess.reference}</span>
                  <div className="bk-action-group">
                    <button className="button button-outline" type="button" onClick={() => downloadCalendarEvent(bookingSuccess.doctorName, bookingSuccess.slot, office)}>Add to calendar</button>
                    <Link className="button" to="/appointments">View my appointments</Link>
                  </div>
                </div>
              )}
              {!bookingSuccess && <div className="bk-action-bar">
                <span>{fee ? `${fee} · ` : ""}{step === 4 ? "Final confirmation" : "In-person visit · 30 minutes"}</span>
                {step === 4 ? (
                  <form className="bk-action-form" onSubmit={onConfirm}>
                    <button className="button" type="submit" disabled={busy || !selectedSlot || !visitPurpose.trim()}>
                      {busy ? "Confirming…" : "Confirm Appointment"}
                    </button>
                  </form>
                ) : (
                  <button
                    className="button"
                    type="button"
                    disabled={step === 2 ? !selectedSlot : !patientDetailsValid}
                    onClick={() => goToStep(Math.min(4, step + 1) as BookingStep)}
                  >
                    Continue
                  </button>
                )}
              </div>}
            </div>

            <aside className="bk-side">
              <nav className="bk-vsteps" aria-label="Booking steps">
                <div className="bk-vsteps-head" role="progressbar" aria-label="Booking progress" aria-valuemin={1} aria-valuemax={3} aria-valuenow={(bookingSuccess ? 4 : step) - 1}>
                  <span>Your progress</span>
                  <strong>Step {(bookingSuccess ? 4 : step) - 1} of 3</strong>
                </div>
                <ol>
                  {steps.slice(1, 4).map((label, shownIndex) => {
                    const index = shownIndex + 1;
                    const number = (index + 1) as BookingStep;
                    const status = number === step ? "current" : bookingSuccess || number < step ? "completed" : "upcoming";
                    const content = (
                      <>
                        <span className="bk-vstep-icon" aria-hidden="true">
                          <Icon name={status === "completed" ? "check" : stepIcons[index]} size={18} />
                        </span>
                        <span className="bk-vstep-copy">
                          <span className="bk-vstep-label">{label}</span>
                          <span className="bk-vstep-hint">{status === "upcoming" ? `Step ${number - 1}` : stepHints[index]}</span>
                          {status === "current" && (
                            <span className="bk-vstep-dots" aria-label={`${subSteps[number].filter((item) => item.done).length} of ${subSteps[number].length} done`}>
                              {subSteps[number].map((item) => (
                                <span key={item.label} className={item.done ? "is-done" : ""} title={item.label} />
                              ))}
                            </span>
                          )}
                        </span>
                        <span className="sr-only">{status}</span>
                      </>
                    );
                    return (
                      <li key={label} className={`bk-vstep is-${status}`} aria-current={status === "current" ? "step" : undefined}>
                        {status === "completed" || (bookingSuccess && number !== step) ? (
                          <button type="button" className="bk-vstep-row" onClick={() => goToStep(number)} title={bookingSuccess ? `View ${label}` : `Go back to ${label}`}>{content}</button>
                        ) : (
                          <div className="bk-vstep-row">{content}</div>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </nav>
              <section className="bk-summary bk-card" aria-label="Your appointment">
                <h2>Your appointment</h2>
                <div className="bk-summary-doctor">
                  <div className="bk-summary-avatar" aria-hidden="true">{initials(doctor.user?.firstName, doctor.user?.lastName)}</div>
                  <div><strong>{doctorName}</strong><span>{doctor.category.name}</span></div>
                </div>
                {summarySlot && (
                  <div className="bk-summary-time">
                    <strong>{formatFullDate(slotDateInAlmaty(summarySlot.startAt))} · {summaryTime}</strong>
                    <span>Asia/Almaty · UTC+5</span>
                  </div>
                )}
                {office && doctor && <p className="bk-summary-clinic"><DoctorLocation {...doctor} /></p>}
                {fee && <p className="bk-summary-price">{fee}</p>}
                <p className="bk-summary-footnote">{bookingSuccess ? `Confirmed · Booking ID ${bookingSuccess.reference}` : "Not confirmed yet. Review and confirm in the last step."}</p>
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
