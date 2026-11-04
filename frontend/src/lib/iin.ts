/** Kazakhstan IIN: YYMMDD birth date, century/sex digit, serial and a mod-11 check digit. Mirrors the API check. */
export function isValidIin(value: string) {
  if (!/^\d{12}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  if (month < 1 || month > 12 || day < 1 || day > new Date(Date.UTC(2000, month, 0)).getUTCDate()) return false;
  const weighted = (weights: number[]) => weights.reduce((sum, weight, index) => sum + weight * digits[index], 0) % 11;
  let check = weighted([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  if (check === 10) check = weighted([3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2]);
  return check !== 10 && check === digits[11];
}

export const isValidPhone = (value: string) => /^\+?[\d\s()-]{7,30}$/.test(value) && value.replace(/\D/g, "").length >= 10;
