export type DoctorLocation = {
  city?: string | null;
  clinicName?: string | null;
  streetAddress?: string | null;
  officeNumber?: string | null;
  office?: string | null;
};

export function doctorLocationHeading(location: DoctorLocation) {
  return [location.city?.trim(), location.clinicName?.trim()].filter(Boolean).join(" · ");
}

export function doctorLocationAddress(location: DoctorLocation) {
  return [location.streetAddress?.trim(), location.officeNumber?.trim()].filter(Boolean).join(", ");
}

export function doctorLocationText(location: DoctorLocation, fallback = "Location not listed") {
  const heading = doctorLocationHeading(location);
  const address = doctorLocationAddress(location);
  const structuredLocation = [heading, address].filter(Boolean).join(", ");
  return structuredLocation || location.office?.trim() || fallback;
}
