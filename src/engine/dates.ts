// Timezone-safe date helpers: a date is an integer count of days since 1970-01-01 (UTC).
const MS = 86_400_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const toDay = (iso: string): number => Math.round(Date.parse(iso.slice(0, 10) + 'T00:00:00Z') / MS);
export const toIso = (day: number): string => new Date(day * MS).toISOString().slice(0, 10);
export const ym = (day: number): string => toIso(day).slice(0, 7);

/** 23 Nov 2026 */
export const fmt = (day: number | null | undefined): string => {
  if (day === null || day === undefined || Number.isNaN(day)) return '-';
  const d = new Date(day * MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
/** 23 Nov */
export const fmtShort = (day: number | null | undefined): string => {
  if (day === null || day === undefined || Number.isNaN(day)) return '-';
  const d = new Date(day * MS);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
};
export const monthLabel = (ymStr: string): string => {
  const [y, m] = ymStr.split('-');
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
};
export const MONTH_NAMES = MONTHS;
