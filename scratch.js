const timezone = 'Asia/Karachi';

function getStartOfDayInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const formattedStr = formatter.format(date);
  const [yearStr, monthStr, dayStr] = formattedStr.split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1;
  const day = parseInt(dayStr);
  
  const utcDate = new Date(Date.UTC(year, month, day, 12, 0, 0));
  
  const tzStr = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone })).getTime();
  const utcStr = new Date(utcDate.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const offsetMs = tzStr - utcStr;
  
  return new Date(Date.UTC(year, month, day, 0, 0, 0) - offsetMs);
}
function getEndOfDayInTimezone(date, timezone) {
  const start = getStartOfDayInTimezone(date, timezone);
  return new Date(start.getTime() + 24 * 60 * 60 * 1000 - 1);
}
const now = new Date();
const start = getStartOfDayInTimezone(now, timezone);
const end = getEndOfDayInTimezone(now, timezone);
console.log("Start:", start.toISOString());
console.log("End:", end.toISOString());
