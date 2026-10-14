function normalizedName(value: string | null | undefined): string {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

export function getUserInitials(firstName?: string | null, lastName?: string | null): string {
  const first = normalizedName(firstName).split(" ")[0] ?? "";
  const last = normalizedName(lastName).split(" ")[0] ?? "";
  return `${first.charAt(0)}${last.charAt(0)}`.toLocaleUpperCase();
}

export function formatUserDisplayName(firstName?: string | null, lastName?: string | null): string {
  const first = normalizedName(firstName);
  const last = normalizedName(lastName);
  if (first && last) return `${first} ${last.charAt(0)}.`;
  return first || last || "Account";
}
