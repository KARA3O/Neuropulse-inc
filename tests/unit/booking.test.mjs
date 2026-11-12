import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOOKING, formatSlot, generateDays, isOfferedSlot, parseBlockedDates } from '../../src/server/lib/booking.js';
import { buildIcs } from '../../src/server/lib/ics.js';

// Thursday 12 November 2026, 10:00 in South Africa (08:00 UTC).
const NOW = Date.UTC(2026, 10, 12, 8, 0, 0);

test('slots start the next working day after the 12-hour notice period', () => {
  const days = generateDays(NOW);
  assert.equal(days[0].date, '2026-11-13'); // Friday: today's slots are inside the 12-hour notice window
  assert.equal(days[0].slots[0], '2026-11-13T07:00:00.000Z'); // 09:00 SAST
  assert.equal(days[0].slots.at(-1), '2026-11-13T13:30:00.000Z'); // 15:30 SAST: the last call ends at 16:00
  assert.equal(days[0].slots.length, 14);
});

test('weekends are skipped and the window stops two weeks ahead', () => {
  const days = generateDays(NOW);
  assert.ok(!days.some((d) => ['2026-11-14', '2026-11-15', '2026-11-21', '2026-11-22'].includes(d.date)));
  assert.equal(days[1].date, '2026-11-16'); // Monday
  assert.ok(days.at(-1).date <= '2026-11-26');
  assert.ok(days.every((d) => d.slots.length > 0));
});

test('blocked dates (public holidays) are removed', () => {
  const days = generateDays(NOW, parseBlockedDates('2026-11-13, 2026-11-17;junk'));
  assert.ok(!days.some((d) => d.date === '2026-11-13'));
  assert.ok(!days.some((d) => d.date === '2026-11-17'));
  assert.equal(days[0].date, '2026-11-16');
});

test('only exactly offered slots can be booked', () => {
  assert.equal(isOfferedSlot('2026-11-13T07:00:00.000Z', NOW), true);
  assert.equal(isOfferedSlot('2026-11-13T07:10:00.000Z', NOW), false, 'not on the half hour');
  assert.equal(isOfferedSlot('2026-11-13T06:30:00.000Z', NOW), false, 'before opening (08:30 SAST)');
  assert.equal(isOfferedSlot('2026-11-14T07:00:00.000Z', NOW), false, 'Saturday');
  assert.equal(isOfferedSlot('2026-11-12T12:00:00.000Z', NOW), false, 'inside the notice window');
  assert.equal(isOfferedSlot('2026-11-13T07:00:00Z', NOW), false, 'must be the exact ISO format we generate');
  assert.equal(isOfferedSlot('tomorrow', NOW), false);
  assert.equal(isOfferedSlot(null, NOW), false);
});

test('times are shown in South African time', () => {
  assert.match(formatSlot('2026-11-13T07:00:00.000Z'), /09:00/);
  assert.equal(BOOKING.slotMinutes, 30);
});

test('calendar file has the right times and escapes text', () => {
  const ics = buildIcs({
    uid: 'CALL-ABC@neuropulse', startsAt: '2026-11-13T07:00:00.000Z', minutes: 30, summary: 'Call, with; Neuropulse',
    description: 'Line one\nLine two', organizerEmail: 'hi@example.com', attendeeEmail: 'you@example.com', attendeeName: 'You',
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.includes('DTSTART:20261113T070000Z'));
  assert.ok(ics.includes('DTEND:20261113T073000Z'));
  assert.ok(ics.includes('SUMMARY:Call\\, with\\; Neuropulse'));
  assert.ok(ics.includes('DESCRIPTION:Line one\\nLine two'));
  assert.ok(ics.trim().endsWith('END:VCALENDAR'));
  assert.ok(ics.split('\r\n').every((line) => line.length <= 75), 'lines are folded at 75 characters');
});
