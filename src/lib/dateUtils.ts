import { format } from 'date-fns';

const DEFAULT_TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;

const COUNTRY_CODE_TZ: Record<string, string> = {
  PK: 'Asia/Karachi', AE: 'Asia/Dubai', SA: 'Asia/Riyadh',
  QR: 'Asia/Qatar', KW: 'Asia/Kuwait', OM: 'Asia/Muscat',
  BH: 'Asia/Bahrain', GB: 'Europe/London', US: 'America/New_York',
  CA: 'America/Toronto', AU: 'Australia/Sydney', LK: 'Asia/Colombo',
  BD: 'Asia/Dhaka', IN: 'Asia/Kolkata', AF: 'Asia/Kabul',
  TR: 'Europe/Istanbul', MY: 'Asia/Kuala_Lumpur', SG: 'Asia/Singapore',
  ID: 'Asia/Jakarta', PH: 'Asia/Manila', VN: 'Asia/Ho_Chi_Minh',
  EG: 'Africa/Cairo', ZA: 'Africa/Johannesburg', NG: 'Africa/Lagos',
};

function safeTZ(timezone?: string): string {
  if (!timezone) return DEFAULT_TZ;
  if (timezone.length === 2) return COUNTRY_CODE_TZ[timezone] || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_TZ;
  }
}

export function getTimezone(countryName: string): string {
  const timezones: Record<string, string> = {
    'Pakistan': 'Asia/Karachi',
    'United Arab Emirates': 'Asia/Dubai',
    'Saudi Arabia': 'Asia/Riyadh',
    'United Kingdom': 'Europe/London',
    'United States': 'America/New_York',
    'India': 'Asia/Kolkata',
    'Australia': 'Australia/Sydney',
    'Canada': 'America/Toronto',
    'Singapore': 'Asia/Singapore',
    'Malaysia': 'Asia/Kuala_Lumpur'
  };
  return timezones[countryName] || DEFAULT_TZ;
}

export function formatAppDate(date: Date | string, timezone?: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTZ(timezone),
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }).format(d);
}

export function formatAppTime(date: Date | string, timezone?: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: safeTZ(timezone),
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

export function formatAppDateTime(date: Date | string, timezone?: string): string {
  if (!date) return '';
  return `${formatAppDate(date, timezone)} ${formatAppTime(date, timezone)}`;
}

export function formatAppDateChart(date: Date | string, timezone?: string): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  try {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: safeTZ(timezone) });
  } catch {
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  }
}

export function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTZ(timezone),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const [yearStr, monthStr, dayStr] = formatter.format(date).split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);

  const guess = new Date(Date.UTC(year, month, day, 0, 0, 0));

  const guessParts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTZ(timezone),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(guess);

  let gYear = 0, gMonth = 0, gDay = 0, gHour = 0, gMinute = 0, gSecond = 0;
  for (const part of guessParts) {
    if (part.type === 'year') gYear = parseInt(part.value, 10);
    if (part.type === 'month') gMonth = parseInt(part.value, 10) - 1;
    if (part.type === 'day') gDay = parseInt(part.value, 10);
    if (part.type === 'hour') gHour = parseInt(part.value, 10) % 24;
    if (part.type === 'minute') gMinute = parseInt(part.value, 10);
    if (part.type === 'second') gSecond = parseInt(part.value, 10);
  }

  const localWeGot = Date.UTC(gYear, gMonth, gDay, gHour, gMinute, gSecond);
  const localWeWant = Date.UTC(year, month, day, 0, 0, 0);
  const diffMs = localWeGot - localWeWant;

  return new Date(guess.getTime() - diffMs);
}

export function getEndOfDayInTimezone(date: Date, timezone: string): Date {
  const start = getStartOfDayInTimezone(date, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

export function getStartOfInputDayInTimezone(dateStr: string, timezone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));

  const guessParts = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTZ(timezone),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(guess);

  let gYear = 0, gMonth = 0, gDay = 0, gHour = 0, gMinute = 0, gSecond = 0;
  for (const part of guessParts) {
    if (part.type === 'year') gYear = parseInt(part.value, 10);
    if (part.type === 'month') gMonth = parseInt(part.value, 10) - 1;
    if (part.type === 'day') gDay = parseInt(part.value, 10);
    if (part.type === 'hour') gHour = parseInt(part.value, 10) % 24;
    if (part.type === 'minute') gMinute = parseInt(part.value, 10);
    if (part.type === 'second') gSecond = parseInt(part.value, 10);
  }

  const localWeGot = Date.UTC(gYear, gMonth, gDay, gHour, gMinute, gSecond);
  const localWeWant = Date.UTC(y, m - 1, d, 0, 0, 0);
  const diffMs = localWeGot - localWeWant;

  return new Date(guess.getTime() - diffMs);
}

export function getEndOfInputDayInTimezone(dateStr: string, timezone: string): Date {
  const start = getStartOfInputDayInTimezone(dateStr, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}


export function formatInTimeZone(date: Date | string, tz: string, format: string): string {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  try { return d.toLocaleDateString("en-GB", { timeZone: safeTZ(tz) }); } catch { return d.toLocaleDateString(); }
}
