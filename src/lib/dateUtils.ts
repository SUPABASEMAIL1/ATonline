import { getCountryByCode } from './countries';

/**
 * Formats a date/time string according to the selected country's timezone
 * and enforces a 12-hour format (AM/PM).
 */
export function formatInTimeZone(
  date: Date | string | number,
  options: Intl.DateTimeFormatOptions = {},
  countryCode?: string
): string {
  if (!date) return '-';
  try {
    const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
    if (!(d instanceof Date) || isNaN(d.getTime())) return '-';

    const country = countryCode ? getCountryByCode(countryCode) : undefined;
    const timezone = country?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

    return new Intl.DateTimeFormat('en-US', {
      ...options,
      timeZone: timezone,
    }).format(d);
  } catch (err) {
    console.error('Error formatting date in timezone:', err);
    return '-';
  }
}

/**
 * Standard Date Format: MMM dd, yyyy
 * Example: Apr 07, 2026
 */
export function formatAppDate(date: Date | string | number, countryCode?: string): string {
  return formatInTimeZone(date, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }, countryCode);
}

/**
 * Standard Time Format: hh:mm:ss AM/PM
 * Example: 03:45:10 PM
 */
export function formatAppTime(date: Date | string | number, countryCode?: string, showSeconds = true): string {
  return formatInTimeZone(date, {
    hour: '2-digit',
    minute: '2-digit',
    second: showSeconds ? '2-digit' : undefined,
    hour12: true,
  }, countryCode);
}

/**
 * Standard Full Format: MMM dd, yyyy, hh:mm AM/PM
 * Example: Apr 07, 2026, 03:45 PM
 */
export function formatAppDateTime(date: Date | string | number, countryCode?: string): string {
  return formatInTimeZone(date, {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }, countryCode);
}

/**
 * Short Date Format for tables/compact views
 */
export function formatAppDateShort(date: Date | string | number, countryCode?: string): string {
    return formatInTimeZone(date, {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric',
    }, countryCode);
}

/**
 * Chart Date Format: MM/dd
 */
export function formatAppDateChart(date: Date | string | number, countryCode?: string): string {
  return formatInTimeZone(date, {
    month: '2-digit',
    day: '2-digit',
  }, countryCode);
}

/**
 * Get the configured country timezone string from a country code.
 * Falls back to system timezone if no country code or country not found.
 */
export function getTimezone(countryCode?: string): string {
  if (countryCode) {
    const country = getCountryByCode(countryCode);
    if (country?.timezone) return country.timezone;
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Returns the start of the given date's day (midnight 00:00:00.000) in the
 * target timezone, expressed as a UTC Date object suitable for comparison
 * against ISO UTC timestamps stored in the database.
 *
 * Example: if timezone is Asia/Karachi (UTC+5) and the current local time there
 * is 2026-06-29, this returns `new Date('2026-06-29T00:00:00.000Z')` — i.e. the
 * UTC epoch at which that day *starts* in Karachi.
 */
export function getStartOfDayInTimezone(date: Date, timezone: string): Date {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const year = parseInt(parts.find(p => p.type === 'year')!.value);
  const month = parseInt(parts.find(p => p.type === 'month')!.value) - 1;
  const day = parseInt(parts.find(p => p.type === 'day')!.value);
  return new Date(Date.UTC(year, month, day, 0, 0, 0, 0));
}

/**
 * Returns the end of the given date's day (23:59:59.999) in the target
 * timezone, expressed as a UTC Date object.
 */
export function getEndOfDayInTimezone(date: Date, timezone: string): Date {
  const start = getStartOfDayInTimezone(date, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}

/**
 * Returns the very end of a given Day.js-style string date (YYYY-MM-DD parsed
 * as local date input) at 23:59:59.999 in the configured timezone as a UTC Date.
 */
export function getEndOfInputDayInTimezone(dateStr: string, timezone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 23, 59, 59, 999));
}

/**
 * Returns midnight (00:00:00.000) of a given date string (YYYY-MM-DD parsed as
 * local date input) in the configured timezone as a UTC Date.
 */
export function getStartOfInputDayInTimezone(dateStr: string, timezone: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0, 0));
}
