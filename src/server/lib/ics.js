/**
 * Minimal iCalendar (.ics) event, so a confirmed call can be added to Google, Apple or Outlook calendars.
 */
const fmt = (d) => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Fold long lines at 75 characters, as the spec requires. */
const fold = (line) => {
  const parts = [];
  let rest = line;
  while (rest.length > 75) {
    parts.push(rest.slice(0, 75));
    rest = ' ' + rest.slice(75); // continuation lines start with one space
  }
  parts.push(rest);
  return parts.join('\r\n');
};

export function buildIcs({ uid, startsAt, minutes = 30, summary, description, organizerEmail, organizerName, attendeeEmail, attendeeName, url }) {
  const end = new Date(new Date(startsAt).getTime() + minutes * 60_000);
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Neuropulse Inc.//Website//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${esc(uid)}`,
    `DTSTAMP:${fmt(Date.now())}`,
    `DTSTART:${fmt(startsAt)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(summary)}`,
    `DESCRIPTION:${esc(description)}`,
    ...(url ? [`URL:${esc(url)}`] : []),
    ...(organizerEmail ? [`ORGANIZER;CN=${esc(organizerName || 'Neuropulse Inc.')}:mailto:${organizerEmail}`] : []),
    ...(attendeeEmail ? [`ATTENDEE;CN=${esc(attendeeName || attendeeEmail)};ROLE=REQ-PARTICIPANT:mailto:${attendeeEmail}`] : []),
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Neuropulse call in 30 minutes',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}
