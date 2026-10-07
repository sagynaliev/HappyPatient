import { useState } from "react";
import { Link } from "react-router-dom";
import { Doctor, Role } from "../lib/api";
import { getDoctorPhoto } from "../lib/doctorImages";

type DoctorCardProps = {
  doctor: Doctor;
  canBook: boolean;
  checkingAccess: boolean;
  role?: Role;
  queryString: string;
};

function formatAppointment(value: string) {
  const date = new Date(value);
  const time = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  const day = date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return { day, time };
}

export function DoctorCardSkeleton() {
  return (
    <article className="doctor-card doctor-card-skeleton" aria-hidden="true">
      <div className="doctor-card-photo skeleton" />
      <div className="doctor-card-content">
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
        <div className="skeleton skeleton-line" />
        <div className="skeleton skeleton-line short" />
      </div>
    </article>
  );
}

export default function DoctorCard({ doctor, canBook, checkingAccess, role, queryString }: DoctorCardProps) {
  const [favorites, setFavorites] = useState(() => {
    const stored = window.localStorage.getItem("hp_favorite_doctors");
    return new Set(stored ? stored.split("|").filter(Boolean) : []);
  });
  const isFavorite = favorites.has(doctor.id);
  const nextSlot = doctor.scheduleSlots?.[0];
  const nextAppointment = nextSlot ? formatAppointment(nextSlot.startAt) : null;
  const doctorName = `Dr. ${doctor.user.firstName} ${doctor.user.lastName}`;
  const schedulePath = nextSlot
    ? `/doctors/${encodeURIComponent(doctor.id)}/schedule?date=${encodeURIComponent(nextSlot.startAt.slice(0, 10))}`
    : `/doctors/${encodeURIComponent(doctor.id)}/schedule`;
  const bookingState = {
    doctorName,
    specialty: doctor.category.name,
    office: doctor.office || "",
    selectedSlotId: nextSlot?.id,
  };

  function toggleFavorite() {
    setFavorites((current) => {
      const updated = new Set(current);
      if (updated.has(doctor.id)) updated.delete(doctor.id);
      else updated.add(doctor.id);
      window.localStorage.setItem("hp_favorite_doctors", Array.from(updated).join("|"));
      return updated;
    });
  }

  return (
    <article className="doctor-card">
      <div className="doctor-card-photo-wrap">
        <img className="doctor-card-photo" src={getDoctorPhoto(doctor.id, doctor.user.email)} alt="" />
      </div>

      <div className="doctor-card-content">
        <div className="doctor-card-identity">
          <div>
            <h2>{doctorName}</h2>
            <p className="doctor-card-specialty">{doctor.category.name}</p>
          </div>
          <button
            className={`favorite-button${isFavorite ? " is-favorite" : ""}`}
            type="button"
            aria-label={isFavorite ? `Remove ${doctorName} from favorites` : `Add ${doctorName} to favorites`}
            aria-pressed={isFavorite}
            onClick={toggleFavorite}
          >
            <span aria-hidden="true">{isFavorite ? "♥" : "♡"}</span>
          </button>
        </div>

        <div className="doctor-card-facts">
          <p><span className="fact-symbol" aria-hidden="true">⌖</span>{doctor.office || "Clinic location not listed"}</p>
          <p><span className="fact-symbol" aria-hidden="true">◷</span>Visit type not listed</p>
        </div>

        <div className={`doctor-next-availability${nextAppointment ? "" : " is-unavailable"}`} aria-live="polite">
          <span className="availability-indicator" aria-hidden="true" />
          {nextAppointment ? (
            <span>
              <strong>Next available</strong>
              <span>{nextAppointment.day} · {nextAppointment.time}</span>
            </span>
          ) : (
            <span><strong>No times published</strong><span>Check back later for availability.</span></span>
          )}
        </div>

        <div className="doctor-card-footer">
          <div className="doctor-unlisted-details">
            <span>Rating &amp; reviews not listed</span>
            <span>Experience not listed</span>
            <span>Price not listed</span>
          </div>
          {checkingAccess ? (
            <button className="button doctor-book-button" type="button" disabled>Checking access…</button>
          ) : !nextSlot ? (
            <button className="button doctor-book-button" type="button" disabled title="This doctor has not published a free appointment time.">
              No appointment times
            </button>
          ) : role && role !== "PATIENT" ? (
            <button className="button doctor-book-button" type="button" disabled title="Appointment booking is available to patient accounts.">
              Patient account required
            </button>
          ) : canBook ? (
            <Link
              className="button doctor-book-button"
              to={schedulePath}
              state={bookingState}
            >
              Book appointment
            </Link>
          ) : (
            <Link
              className="button doctor-book-button"
              to="/login"
              state={{
                from: `${schedulePath}${queryString ? `&${queryString}` : ""}`,
                returnState: bookingState,
              }}
            >
              Sign in to book
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
