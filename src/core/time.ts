export const START_YEAR = 1985;
export const END_YEAR = 2025;
export const WEEKS_PER_MONTH = 4;
export const WEEKS_PER_YEAR = 48;
export const TOTAL_WEEKS = (END_YEAR - START_YEAR + 1) * WEEKS_PER_YEAR;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function yearOf(week: number): number {
  return START_YEAR + Math.floor(week / WEEKS_PER_YEAR);
}

/** Fractional year, e.g. 1990.5 halfway through 1990. */
export function yearFraction(week: number): number {
  return START_YEAR + week / WEEKS_PER_YEAR;
}

export function formatDate(week: number): string {
  const month = Math.floor((week % WEEKS_PER_YEAR) / WEEKS_PER_MONTH);
  const w = (week % WEEKS_PER_MONTH) + 1;
  return `${MONTHS[month]} ${yearOf(week)} · W${w}`;
}

export function formatShortDate(week: number): string {
  const month = Math.floor((week % WEEKS_PER_YEAR) / WEEKS_PER_MONTH);
  return `${MONTHS[month]} ${yearOf(week)}`;
}
