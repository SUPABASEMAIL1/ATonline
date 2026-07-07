function getStartOfDaySafe(date, timezone) {
  // Convert the given date to a string in the target timezone
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  
  const [yearStr, monthStr, dayStr] = formatter.format(date).split('-');
  
  // We want to find the UTC time that corresponds to 00:00:00 in the target timezone.
  // We can do this by guessing the UTC time and adjusting.
  // A naive guess is UTC midnight.
  let guess = new Date(Date.UTC(parseInt(yearStr), parseInt(monthStr) - 1, parseInt(dayStr), 0, 0, 0));
  
  // Find the offset by formatting our guess
  const guessParts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).formatToParts(guess);
  
  let gYear, gMonth, gDay, gHour, gMinute, gSecond;
  for (const part of guessParts) {
    if (part.type === 'year') gYear = parseInt(part.value);
    if (part.type === 'month') gMonth = parseInt(part.value);
    if (part.type === 'day') gDay = parseInt(part.value);
    if (part.type === 'hour') gHour = parseInt(part.value) % 24;
    if (part.type === 'minute') gMinute = parseInt(part.value);
    if (part.type === 'second') gSecond = parseInt(part.value);
  }
  
  // difference between target 00:00:00 and what the guess actually is in the local time.
  // If guess is 05:00:00 in target timezone, then we need to subtract 5 hours from guess.
  const diffMs = (gHour * 3600 + gMinute * 60 + gSecond) * 1000;
  
  return new Date(guess.getTime() - diffMs);
}

const now = new Date('2026-07-07T05:23:39+05:00'); // 7th July, 5:23 AM PKT
const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
const start = getStartOfDaySafe(yesterday, 'Asia/Karachi');
console.log("Safe Yesterday Start:", start.toISOString());
