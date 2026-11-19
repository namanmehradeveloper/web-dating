/** Formats a local calendar date as YYYY-MM-DD for `<input type="date">`. */
function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Latest selectable date of birth for an 18+ adult today.
 * Updates automatically from the current calendar date (not a hardcoded year).
 * Leap-day overflow (e.g. Feb 29 → non-leap year) clamps to the last valid day of that month.
 */
export function maxAdultDateOfBirth(today = new Date()): string {
  const year = today.getFullYear() - 18;
  const month = today.getMonth();
  const day = today.getDate();
  const date = new Date(year, month, day);
  if (date.getMonth() !== month) {
    // Day overflowed (Feb 29 in a non-leap year) → last day of the intended month.
    date.setFullYear(year, month + 1, 0);
  }
  return formatLocalIsoDate(date);
}

/** Validates the calendar birthday, rather than approximating an 18-year span in milliseconds. */
export function isAdultDateOfBirth(value: string, today = new Date()): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return false;

  const maxAllowed = maxAdultDateOfBirth(today);
  if (value > maxAllowed) return false;

  const thisYear = today.getFullYear();
  const thisMonth = today.getMonth() + 1;
  const thisDay = today.getDate();
  return thisYear - year > 18 || (thisYear - year === 18 && (thisMonth > month || (thisMonth === month && thisDay >= day)));
}
