function getStartOfDayInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const [yearStr, monthStr, dayStr] = formatter.format(date).split('-');
  const year = parseInt(yearStr);
  const month = parseInt(monthStr) - 1;
  const day = parseInt(dayStr);
  
  const utcDate = new Date(Date.UTC(year, month, day, 12, 0, 0)); 
  
  const tzStr = new Date(utcDate.toLocaleString('en-US', { timeZone: timezone })).getTime();
  const utcStr = new Date(utcDate.toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  const offsetMs = tzStr - utcStr;
  
  return new Date(Date.UTC(year, month, day, 0, 0, 0) - offsetMs);
}

const d = new Date('2026-07-06T23:30:00Z'); // 4:30 AM on July 7 in Karachi
const res = getStartOfDayInTimezone(d, 'Asia/Karachi');
console.log(res.toISOString());
