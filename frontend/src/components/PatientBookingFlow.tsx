import { FormEvent, useEffect, useMemo, useState } from "react";
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
};

type BookingStep = 1 | 2 | 3 | 4 | 5;

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
  onConfirm: (event: FormEvent<HTMLFormElement>) => void;
  onSlotTaken: () => void;
};

const steps = ["Consultation Type", "Date & Time", "Patient Details", "Review", "Confirmed"] as const;
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
  onConfirm,
  onSlotTaken,
}: PatientBookingFlowProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryStep = Number(searchParams.get("step"));
  const initialStep = queryStep >= 1 && queryStep <= 4 ? queryStep as BookingStep : 1;
  const [step, setStepState] = useState<BookingStep>(initialStep);
  const [consultationType, setConsultationType] = useState<"in-person" | "">("in-person");
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
    const requestedStep = queryStep >= 1 && queryStep <= 4 ? queryStep as BookingStep : 1;
    const slotIsBookable = Boolean(
      selectedSlot && selectedSlot.status === "FREE" && Date.parse(selectedSlot.startAt) > Date.now(),
    );
    const furthestAllowedStep: BookingStep = !consultationType
      ? 1
      : !slotIsBookable
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
  }, [bookingSuccess, consultationType, patientDetailsValid, queryStep, selectedSlot, setSearchParams]);

  useEffect(() => {
    if (bookingSuccess) setStepState(5);
  }, [bookingSuccess]);

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

  // Small progress dots inside the current step of the vertical stepper.
  const subSteps: Record<number, { label: string; done: boolean }[]> = {
    1: [{ label: "Consultation type", done: Boolean(consultationType) }],
    2: [{ label: "Date", done: Boolean(date) }, { label: "Time", done: Boolean(selectedSlot) }],
    3: [
      { label: "Contact details", done: emailValid },
      { label: "Reason for visit", done: Boolean(visitPurpose.trim()) },
      { label: "Details confirmed", done: detailsConfirmed },
    ],
    4: [{ label: "Details checked", done: true }, { label: "Appointment confirmed", done: false }],
  };
  const stepHints = [
    "In-person visit",
    selectedSlot ? selectedTime : "Pick a day and time",
    "Contact and reason",
    "Check and confirm",
  ];

  function goBack() {
    goToStep(Math.max(1, step - 1) as BookingStep);
  }

  return (
    <div className="bk-page">
      <div className="bk-container">
        <BreadcrumbLabel id="doctor" label={doctor ? doctorName : undefined} />
        {step < 5 ? (
          <Link className="bk-back" to={step === 1 ? `/doctors/${doctor?.id ?? ""}` : "#"} onClick={step === 1 ? undefined : (event) => {
            event.preventDefault();
            goBack();
          }}>
            ← {step === 1 ? "Back to doctor profile" : "Previous step"}
          </Link>
        ) : null}
        <header className="bk-page-heading">
          <h1>{step === 5 ? "Appointment Confirmed!" : "Book your appointment"}</h1>
          {step === 5 && <p>Your appointment is confirmed. Keep these details handy.</p>}
        </header>

        {step === 5 && bookingSuccess ? (
          <section className="bk-confirmation bk-card" aria-labelledby="bk-confirmation-title">
            <div className="bk-confirm-icon" aria-hidden="true">
              <svg viewBox="0 0 32 32"><rect x="5" y="7" width="22" height="20" rx="3" /><path d="M10 4v6m12-6v6M5 13h22m-16 7 3 3 7-7" /></svg>
            </div>
            <span className="bk-badge bk-badge--success">Confirmed</span>
            <h2 id="bk-confirmation-title">You’re all set, {patient?.firstName || "patient"}.</h2>
            <p className="bk-confirm-meta">{bookingSuccess.doctorName} · {doctor?.category.name}</p>
            <dl className="bk-confirm-details">
              <div><dt>Appointment</dt><dd>{formatFullDate(slotDateInAlmaty(bookingSuccess.slot.startAt))}</dd></div>
              <div><dt>Time</dt><dd>{formatTimeInAlmaty(bookingSuccess.slot.startAt)}–{formatTimeInAlmaty(bookingSuccess.slot.endAt)} · UTC+5</dd></div>
              {office && doctor && <div><dt>Location</dt><dd><DoctorLocation {...doctor} /></dd></div>}
              {bookingSuccess.purpose && <div><dt>Reason for visit</dt><dd>{bookingSuccess.purpose}</dd></div>}
              {fee && <div><dt>Consultation fee</dt><dd>{fee}</dd></div>}
            </dl>
            <p className="bk-info bk-info--success">Your appointment is confirmed and attached to your patient account. A confirmation is waiting under the bell.</p>
            <div className="bk-confirm-actions">
              <Link className="button" to="/appointments">View my appointments</Link>
              <button className="button button-outline" type="button" onClick={() => downloadCalendarEvent(bookingSuccess.doctorName, bookingSuccess.slot, office)}>
                Add to calendar
              </button>
            </div>
            <Link className="bk-home-link" to="/search">Book another doctor</Link>
          </section>
        ) : doctor ? (
          <div className="bk-layout">
            <div className="bk-main">
              <section className="bk-card" aria-labelledby="bk-step-title">
                <header className="bk-card-heading">
                  <h2 id="bk-step-title">{step}. {steps[step - 1]}</h2>
                  <p>{step === 1
                    ? "Choose how you would like to meet your doctor."
                    : step === 2
                      ? "Choose an available appointment. Unavailable times cannot be selected."
                      : step === 3
                        ? "Check your contact details so your clinic can reach you."
                        : "Please check every detail before the final confirmation."}</p>
                </header>

                {step === 1 && (
                  <div className="bk-consultation-options" role="radiogroup" aria-label="Consultation type">
                    <label className={`bk-consult-option${consultationType === "in-person" ? " is-selected" : ""}`}>
                      <input
                        type="radio"
                        name="consultation-type"
                        value="in-person"
                        checked={consultationType === "in-person"}
                        onChange={() => setConsultationType("in-person")}
                      />
                      <span className="bk-consult-icon" aria-hidden="true">⌂</span>
                      <span className="bk-consult-copy">
                        <strong>In-person consultation</strong>
                        <span>{office && doctor ? <>Visit <DoctorLocation {...doctor} /></> : "Clinic location not listed"}</span>
                        <small>30 minutes{fee ? ` · ${fee}` : ""}</small>
                      </span>
                      {consultationType === "in-person" && <span className="bk-selected-label">Selected</span>}
                    </label>
                    <div className="bk-consult-option is-disabled" aria-disabled="true">
                      <span className="bk-consult-icon" aria-hidden="true">◌</span>
                      <span className="bk-consult-copy">
                        <strong>Online consultation · Not offered</strong>
                        <span>{doctorName} does not have an online consultation option in the booking system.</span>
                      </span>
                    </div>
                  </div>
                )}

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
              </section>

              <div className="bk-action-bar">
                <span>{fee ? `${fee} · ` : ""}{step === 4 ? "Final confirmation" : `${consultationType === "in-person" ? "In-person" : ""} · 30 minutes`}</span>
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
                    disabled={step === 1 ? !consultationType : step === 2 ? !selectedSlot : !patientDetailsValid}
                    onClick={() => goToStep(Math.min(4, step + 1) as BookingStep)}
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>

            <aside className="bk-side">
              <nav className="bk-vsteps" aria-label="Booking steps">
                <div className="bk-vsteps-head" role="progressbar" aria-label="Booking progress" aria-valuemin={1} aria-valuemax={4} aria-valuenow={step}>
                  <span>Your progress</span>
                  <strong>Step {step} of 4</strong>
                </div>
                <ol>
                  {steps.slice(0, 4).map((label, index) => {
                    const number = (index + 1) as BookingStep;
                    const status = number < step ? "completed" : number === step ? "current" : "upcoming";
                    const content = (
                      <>
                        <span className="bk-vstep-icon" aria-hidden="true">
                          <Icon name={status === "completed" ? "check" : stepIcons[index]} size={18} />
                        </span>
                        <span className="bk-vstep-copy">
                          <span className="bk-vstep-label">{label}</span>
                          <span className="bk-vstep-hint">{status === "upcoming" ? `Step ${number}` : stepHints[index]}</span>
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
                        {status === "completed" ? (
                          <button type="button" className="bk-vstep-row" onClick={() => goToStep(number)} title={`Go back to ${label}`}>{content}</button>
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
                {selectedSlot && (
                  <div className="bk-summary-time">
                    <strong>{formatFullDate(slotDateInAlmaty(selectedSlot.startAt))} · {selectedTime}</strong>
                    <span>Asia/Almaty · UTC+5</span>
                  </div>
                )}
                {office && doctor && <p className="bk-summary-clinic"><DoctorLocation {...doctor} /></p>}
                {fee && <p className="bk-summary-price">{fee}</p>}
                <p className="bk-summary-footnote">Not confirmed yet. Review and confirm in step 4.</p>
              </section>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  );
}
