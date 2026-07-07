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

const now = new Date('2026-07-07T05:23:39+05:00'); // 7th July, 5:23 AM PKT
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const start = getStartOfDayInTimezone(yesterday, 'Asia/Karachi');
const end = getEndOfDayInTimezone(yesterday, 'Asia/Karachi');

console.log("Now:", now.toISOString());
console.log("Yesterday (date object):", yesterday.toISOString());
console.log("Yesterday Start:", start.toISOString());
console.log("Yesterday End:", end.toISOString());
