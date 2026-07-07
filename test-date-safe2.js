function getStartOfDayInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const [yearStr, monthStr, dayStr] = formatter.format(date).split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10) - 1;
  const day = parseInt(dayStr, 10);
  
  // We want the UTC time such that in the target timezone, it is YYYY-MM-DD 00:00:00.
  // Start with a guess: the UTC time is YYYY-MM-DD 00:00:00 UTC.
  const guess = new Date(Date.UTC(year, month, day, 0, 0, 0));
  
  // What is the local time of this guess?
  const guessParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
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
  
  // We have the local time of our guess: gYear, gMonth, gDay, gHour, gMinute, gSecond.
  // We wanted it to be year, month, day, 0, 0, 0.
  // Let's compute the difference in milliseconds between the local time we got and the local time we want.
  // We can do this by treating both as UTC dates and subtracting.
  const localWeGot = Date.UTC(gYear, gMonth, gDay, gHour, gMinute, gSecond);
  const localWeWant = Date.UTC(year, month, day, 0, 0, 0);
  
  // If localWeGot > localWeWant, our guess was too far "ahead" in local time.
  // So we need to subtract the difference from the guess.
  const diffMs = localWeGot - localWeWant;
  
  return new Date(guess.getTime() - diffMs);
}

const startPKT = getStartOfDayInTimezone(new Date('2026-07-06T12:00:00Z'), 'Asia/Karachi');
console.log("PKT Start:", startPKT.toISOString()); // Should be 2026-07-05T19:00:00.000Z

const startEDT = getStartOfDayInTimezone(new Date('2026-07-06T12:00:00Z'), 'America/New_York');
console.log("EDT Start:", startEDT.toISOString()); // Should be 2026-07-06T04:00:00.000Z
