import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { slotDateInAlmaty } from "./AvailabilityCalendar";
import { Doctor, Role } from "../lib/api";
import DoctorLocation from "./DoctorLocation";
import { doctorLocationText } from "../lib/doctorLocation";

type DoctorCardProps = {
  doctor: Doctor;
  canBook: boolean;
  checkingAccess: boolean;
  role?: Role;
  queryString: string;
};

const timeZone = "Asia/Almaty";
const priceFormatter = new Intl.NumberFormat("en-US");

function getAppointmentLabel(value: string) {
  const date = new Date(value);
  const day = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(date);
  return { day, time };
}

function initialsFor(doctor: Doctor) {
  return `${doctor.user.firstName.charAt(0)}${doctor.user.lastName.charAt(0)}`.toLocaleUpperCase();
}

export function DoctorCardSkeleton() {
  return (
    <article className="fd-card fd-card-skeleton" aria-hidden="true">
      <div className="fd-card-top">
        <div className="fd-skeleton fd-skeleton-avatar" />
        <div className="fd-skeleton-copy">
          <div className="fd-skeleton fd-skeleton-line" />
          <div className="fd-skeleton fd-skeleton-line fd-skeleton-short" />
        </div>
      </div>
      <div className="fd-skeleton fd-skeleton-line" />
      <div className="fd-skeleton fd-skeleton-line" />
      <div className="fd-skeleton fd-skeleton-button" />
    </article>
  );
}

export default function DoctorCard({ doctor, canBook, checkingAccess, role, queryString }: DoctorCardProps) {
  const nextSlot = doctor.scheduleSlots[0];
  const available = Boolean(nextSlot);
  const [favorite, setFavorite] = useState(() =>
    (window.localStorage.getItem("hp_favorite_doctors") || "").split(",").includes(doctor.id),
  );
  const doctorName = `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`;
  const profilePath = `/doctors/${encodeURIComponent(doctor.id)}`;
  const schedulePath = nextSlot
    ? `/doctors/${encodeURIComponent(doctor.id)}/schedule?date=${encodeURIComponent(slotDateInAlmaty(nextSlot.startAt))}`
    : `/doctors/${encodeURIComponent(doctor.id)}/schedule`;
  const bookingState = {
    doctorName,
    specialty: doctor.category.name,
    office: doctorLocationText(doctor, ""),
    city: doctor.city,
    clinicName: doctor.clinicName,
    streetAddress: doctor.streetAddress,
    officeNumber: doctor.officeNumber,
    consultationFee: doctor.consultationFee,
    selectedSlotId: nextSlot?.id,
  };
  const nextLabel = nextSlot ? getAppointmentLabel(nextSlot.startAt) : null;
  const bookingPath = `${schedulePath}${queryString ? `&${queryString}` : ""}`;
  const appointmentSlots = doctor.scheduleSlots.slice(0, 3);

  useEffect(() => {
    const favorites = new Set((window.localStorage.getItem("hp_favorite_doctors") || "").split(",").filter(Boolean));
    if (favorite) favorites.add(doctor.id);
    else favorites.delete(doctor.id);
    window.localStorage.setItem("hp_favorite_doctors", [...favorites].join(","));
  }, [doctor.id, favorite]);

  const tone = (doctor.id.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % 4) + 1;

  return (
    <article className="fd-card">
      <div className={`fd-card-cover fd-tone-${tone}`}>
        <div className="fd-avatar" aria-hidden="true">{initialsFor(doctor)}</div>
        <button
          className={`favorite-button${favorite ? " is-favorite" : ""}`}
          type="button"
          aria-label={`${favorite ? "Remove" : "Add"} ${doctorName} ${favorite ? "from" : "to"} favorites`}
          aria-pressed={favorite}
          onClick={() => setFavorite((value) => !value)}
        >
          {favorite ? "♥" : "♡"}
        </button>
      </div>

      <div className="fd-card-top">
        <div className="fd-card-identity">
          <h2>{doctorName}</h2>
          <p className="fd-specialty">{doctor.category.name}</p>
        </div>
      </div>

      <div className="fd-card-meta">
        <DoctorLocation {...doctor} />
      </div>

      <div className="fd-card-badges">
        <span className={`fd-status-badge${available ? " fd-status-success" : " fd-status-neutral"}`}>
          {available ? "Appointments available" : "No appointments listed"}
        </span>
      </div>

      {doctor.consultationFee > 0 && (
        <p className="fd-price">{priceFormatter.format(doctor.consultationFee)} KZT <span>/ consultation</span></p>
      )}

      <p className="fd-next-slot">
        {nextLabel ? `Next: ${nextLabel.day} · ${nextLabel.time} · UTC+5` : "No free time slots yet"}
      </p>

      {appointmentSlots.length > 0 && (
        <div className="fd-time-slots" aria-label={`Available appointments for ${doctorName}`}>
          {appointmentSlots.map((slot) => {
            const slotLabel = getAppointmentLabel(slot.startAt);
            const slotPath = `/doctors/${encodeURIComponent(doctor.id)}/schedule?date=${encodeURIComponent(slotDateInAlmaty(slot.startAt))}`;
            const state = { ...bookingState, selectedSlotId: slot.id };
            return role && role !== "PATIENT" ? (
              <span className="fd-time-chip fd-time-chip-disabled" key={slot.id} aria-label={`${slotLabel.day} at ${slotLabel.time}, booking requires a patient account`}>
                {slotLabel.time}
              </span>
            ) : (
              <Link
                className="fd-time-chip"
                to={role === "PATIENT" ? slotPath : "/login"}
                state={role === "PATIENT" ? state : { from: slotPath, returnState: state }}
                aria-label={`Book ${slotLabel.day} at ${slotLabel.time}`}
                key={slot.id}
              >
                {slotLabel.time}
              </Link>
            );
          })}
        </div>
      )}

      <div className="fd-card-actions">
        <Link
          className="fd-outline-button"
          to={{ pathname: profilePath, search: queryString ? `?${queryString}` : "" }}
          state={{ doctor }}
        >
          View Profile
        </Link>
        {checkingAccess ? (
          <button className="fd-primary-button" type="button" disabled>Checking access…</button>
        ) : !available ? (
          <button className="fd-primary-button" type="button" disabled>Book Appointment</button>
        ) : role && role !== "PATIENT" ? (
          <button className="fd-primary-button" type="button" disabled>Patient account required</button>
        ) : canBook ? (
          <Link className="fd-primary-button" to={schedulePath} state={bookingState}>Book Appointment</Link>
        ) : (
          <Link className="fd-primary-button" to="/login" state={{ from: bookingPath, returnState: bookingState }}>
            Sign in to book
          </Link>
        )}
      </div>
    </article>
  );
}
