/** Validates the calendar birthday, rather than approximating an 18-year span in milliseconds. */
export function isAdultDateOfBirth(value: string, today = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return false;
  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1;
  const thisDay = today.getDate();
  return thisYear - year > 18 || (thisYear - year === 18 && (thisMonth > month || (thisMonth === month && thisDay >= day)));
}
