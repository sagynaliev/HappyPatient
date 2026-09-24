const doctorPhotos = [
  "https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=500&q=85",
  "https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=500&q=85",
];

function stableHash(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function getDoctorPhoto(doctorId: string, fallbackIdentity?: string) {
  const identity = doctorId || fallbackIdentity || "unknown-doctor";
  return doctorPhotos[stableHash(identity) % doctorPhotos.length];
}
