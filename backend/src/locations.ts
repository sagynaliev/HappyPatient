import { prisma } from './prisma';

/** The clinic's place tree: city -> clinic -> floor -> office. Doctors are placed in offices. */
export type LocationKind = 'city' | 'clinic' | 'floor' | 'office';
export const LOCATION_LEVELS: LocationKind[] = ['city', 'clinic', 'floor', 'office'];
/** The level a location of each kind must sit under (a city has none). */
export const PARENT_KIND: Record<LocationKind, LocationKind | null> = { city: null, clinic: 'city', floor: 'clinic', office: 'floor' };

type Node = { id: string; name: string; kind: string; parentId: string | null; active: boolean };
type Db = Pick<typeof prisma, 'location'>;

export async function loadLocations(db: Db = prisma) {
  const locations = ((await db.location.findMany({ select: { id: true, name: true, kind: true, parentId: true, active: true } })) ?? []) as Node[];
  return new Map(locations.map((item) => [item.id, item]));
}

/** An office with its floor, clinic and city, or null when the chain is broken. */
export function officePath(byId: Map<string, Node>, officeId: string) {
  const office = byId.get(officeId);
  const floor = office?.parentId ? byId.get(office.parentId) : undefined;
  const clinic = floor?.parentId ? byId.get(floor.parentId) : undefined;
  const city = clinic?.parentId ? byId.get(clinic.parentId) : undefined;
  if (office?.kind !== 'office' || floor?.kind !== 'floor' || clinic?.kind !== 'clinic' || city?.kind !== 'city') return null;
  return { office, floor, clinic, city };
}

/** Patients can be sent to an office only when it and every level above it are active. */
export const pathActive = (path: ReturnType<typeof officePath>) => Boolean(path && path.office.active && path.floor.active && path.clinic.active && path.city.active);

/** Offices patients must not be sent to: inactive themselves, under an inactive level, or detached from the tree. */
export async function inactiveOfficeIds() {
  const byId = await loadLocations();
  return [...byId.values()].filter((item) => item.kind === 'office' && !pathActive(officePath(byId, item.id))).map((item) => item.id);
}

/** An active office with its place names, ready to copy onto a doctor. */
export async function activeOffice(locationId: string, db: Db = prisma) {
  const path = officePath(await loadLocations(db), locationId);
  if (!path || !pathActive(path)) return null;
  return { id: path.office.id, name: path.office.name, floor: path.floor.name, clinic: path.clinic.name, city: path.city.name };
}

/** The doctor's place fields as patients see them, copied from an office (or cleared). */
export function doctorPlaceFields(office: { id: string; name: string; clinic: string; city: string } | null) {
  return office
    ? { locationId: office.id, office: office.name, officeNumber: office.name, clinicName: office.clinic, city: office.city }
    : { locationId: null, office: null, officeNumber: null };
}

/** Every office at or under a location. */
export function officesUnder(byId: Map<string, Node>, rootId: string) {
  const children = new Map<string, string[]>();
  for (const item of byId.values()) if (item.parentId) children.set(item.parentId, [...(children.get(item.parentId) ?? []), item.id]);
  const result: string[] = [];
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    if (byId.get(id)?.kind === 'office') result.push(id);
    stack.push(...(children.get(id) ?? []));
  }
  return result;
}

/** Active offices sorted by city, clinic, floor and room, for office pickers. */
export async function activeOfficeList() {
  const byId = await loadLocations();
  const list = [...byId.values()]
    .filter((item) => item.kind === 'office')
    .map((item) => officePath(byId, item.id))
    .filter((path): path is NonNullable<typeof path> => pathActive(path))
    .map((path) => ({ id: path.office.id, name: path.office.name, floor: path.floor.name, clinic: path.clinic.name, city: path.city.name }));
  const byNumber = (a: string, b: string) => a.localeCompare(b, undefined, { numeric: true });
  return list.sort((a, b) => a.city.localeCompare(b.city) || a.clinic.localeCompare(b.clinic) || byNumber(a.floor, b.floor) || byNumber(a.name, b.name));
}
