import { DoctorLocation as DoctorLocationData, doctorLocationAddress, doctorLocationHeading } from "../lib/doctorLocation";
import "../styles/doctorLocation.css";

type DoctorLocationProps = DoctorLocationData & {
  emptyText?: string;
};

export default function DoctorLocation({ emptyText = "Location not listed", ...location }: DoctorLocationProps) {
  const heading = doctorLocationHeading(location);
  const address = doctorLocationAddress(location);

  if (!heading && !address) {
    return <span className="hp-doctor-location-fallback">{location.office?.trim() || emptyText}</span>;
  }

  return (
    <span className="hp-doctor-location">
      {heading && <span className="hp-doctor-location-heading">{heading}</span>}
      {address && (
        <span className="hp-doctor-location-address">
          <svg viewBox="0 0 20 20" aria-hidden="true">
            <path d="M16 8.3c0 4.4-6 9.2-6 9.2S4 12.7 4 8.3a6 6 0 1 1 12 0Z" />
            <circle cx="10" cy="8" r="2" />
          </svg>
          {address}
        </span>
      )}
    </span>
  );
}
