/**
 * Discovery-call availability. Slots are generated on the fly from these rules, so there is
 * nothing to maintain: edit BOOKING below to change your hours.
 *
 * All times are South Africa Standard Time (UTC+2, no daylight saving). Slots are stored in the
 * database and sent to the browser as UTC ISO strings; the browser shows them in SAST.
 */
export const BOOKING = {
  weekdays: [1, 2, 3, 4, 5],   // Monday to Friday (0 = Sunday)
  openHour: 9,                 // first call starts at 09:00
  closeHour: 16,               // last call ends at 16:00
  slotMinutes: 30,
  daysAhead: 14,               // how far ahead people can book
  minLeadHours: 12,            // no bookings with less than this notice
  utcOffsetHours: 2,           // SAST
  timezone: 'Africa/Johannesburg',
  timezoneLabel: 'South Africa time (SAST)',
};

const HOUR = 3_600_000;
const MINUTE = 60_000;
const DAY = 86_400_000;
const pad = (n) => String(n).padStart(2, '0');

/** "2026-12-24, 2026-12-25" from the BOOKING_BLOCKED_DATES variable -> Set of YYYY-MM-DD. */
export function parseBlockedDates(text) {
  return new Set(
    String(text || '')
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s)),
  );
}

/**
 * Bookable days, each with its slot start times (UTC ISO strings).
 * @param {number} now epoch milliseconds
 * @param {Set<string>} blocked dates (YYYY-MM-DD, South African date) with no calls, such as public holidays
 * @returns {{ date: string, slots: string[] }[]}
 */
export function generateDays(now = Date.now(), blocked = new Set(), rules = BOOKING) {
  const offset = rules.utcOffsetHours * HOUR;
  const sastNow = new Date(now + offset);
  const todayMidnight = Date.UTC(sastNow.getUTCFullYear(), sastNow.getUTCMonth(), sastNow.getUTCDate()); // SAST midnight, shifted
  const earliest = now + rules.minLeadHours * HOUR;
  const days = [];

  for (let d = 0; d <= rules.daysAhead; d++) {
    const midnight = todayMidnight + d * DAY;
    const day = new Date(midnight);
    const date = `${day.getUTCFullYear()}-${pad(day.getUTCMonth() + 1)}-${pad(day.getUTCDate())}`;
    if (!rules.weekdays.includes(day.getUTCDay()) || blocked.has(date)) continue;

    const slots = [];
    for (let m = rules.openHour * 60; m + rules.slotMinutes <= rules.closeHour * 60; m += rules.slotMinutes) {
      const startUtc = midnight + m * MINUTE - offset;
      if (startUtc >= earliest) slots.push(new Date(startUtc).toISOString());
    }
    if (slots.length) days.push({ date, slots });
  }
  return days;
}

/** True when `iso` is exactly one of the currently offered slots. */
export function isOfferedSlot(iso, now = Date.now(), blocked = new Set(), rules = BOOKING) {
  if (typeof iso !== 'string') return false;
  const normal = new Date(iso);
  if (Number.isNaN(normal.getTime()) || normal.toISOString() !== iso) return false;
  return generateDays(now, blocked, rules).some((d) => d.slots.includes(iso));
}

/** "Monday 16 November, 09:00" in South African time. */
export function formatSlot(iso, rules = BOOKING) {
  return new Intl.DateTimeFormat('en-ZA', {
    weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: rules.timezone,
  }).format(new Date(iso));
}
