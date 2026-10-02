import { openStatus, type OpeningDay } from './opening-hours.model.js';

const weekdays: OpeningDay[] = (
  ['mon', 'tue', 'wed', 'thu', 'fri'] as const
).map((day) => ({ day, open: '08:00', close: '17:00' }));

/** Nairobi is UTC+3 all year; 5 October 2026 is a Monday. */
const nairobi = (isoLocal: string) => new Date(`${isoLocal}+03:00`);

describe('openStatus', () => {
  it('is null when the shop has no hours', () => {
    expect(openStatus([], nairobi('2026-10-05T10:00:00'))).toBeNull();
  });

  it('says when an open shop closes', () => {
    expect(openStatus(weekdays, nairobi('2026-10-05T10:00:00'))).toEqual({
      open: true,
      label: 'Open until 17:00',
    });
  });

  it('uses Nairobi time whatever the server time zone', () => {
    // 05:30 UTC is 08:30 in Nairobi.
    expect(openStatus(weekdays, new Date('2026-10-05T05:30:00Z'))?.open).toBe(
      true,
    );
  });

  it('says when a shop opens later today', () => {
    expect(openStatus(weekdays, nairobi('2026-10-05T07:15:00'))).toEqual({
      open: false,
      label: 'Opens today at 08:00',
    });
  });

  it('treats closing time as closed and looks ahead to tomorrow', () => {
    expect(openStatus(weekdays, nairobi('2026-10-08T17:00:00'))).toEqual({
      open: false,
      label: 'Opens tomorrow at 08:00',
    });
  });

  it('skips closed days to the next opening', () => {
    expect(openStatus(weekdays, nairobi('2026-10-09T18:00:00'))).toEqual({
      open: false,
      label: 'Opens Monday at 08:00',
    });
  });

  it('finds the same day next week for shops open one day a week', () => {
    const saturdays: OpeningDay[] = [
      { day: 'sat', open: '09:00', close: '13:00' },
    ];
    expect(openStatus(saturdays, nairobi('2026-10-10T14:00:00'))?.label).toBe(
      'Opens Saturday at 09:00',
    );
  });
});
