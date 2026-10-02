export const WEEK_DAYS = [
  { key: 'mon', short: 'Mon', label: 'Monday' },
  { key: 'tue', short: 'Tue', label: 'Tuesday' },
  { key: 'wed', short: 'Wed', label: 'Wednesday' },
  { key: 'thu', short: 'Thu', label: 'Thursday' },
  { key: 'fri', short: 'Fri', label: 'Friday' },
  { key: 'sat', short: 'Sat', label: 'Saturday' },
  { key: 'sun', short: 'Sun', label: 'Sunday' },
] as const;

export type WeekDay = (typeof WEEK_DAYS)[number]['key'];

/** Hours for one open day, as 24-hour "HH:mm" in the shop's local time. Closed days are left out. */
export interface OpeningDay {
  day: WeekDay;
  open: string;
  close: string;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const dayLabel = (day: WeekDay) =>
  WEEK_DAYS.find((weekDay) => weekDay.key === day)?.label ?? day;

/**
 * Checks untrusted input and returns it as OpeningDay[] sorted Monday to Sunday,
 * or a message saying what is wrong. Closing must be after opening on the same day.
 */
export function parseOpeningHours(
  value: unknown,
): { hours: OpeningDay[] } | { error: string } {
  if (!Array.isArray(value)) {
    return { error: 'Opening hours must be a list of days.' };
  }

  const seen = new Set<string>();
  for (const entry of value) {
    const { day, open, close } = (entry ?? {}) as Record<string, unknown>;
    if (!WEEK_DAYS.some((weekDay) => weekDay.key === day)) {
      return { error: 'Opening hours contain an unknown day.' };
    }
    const weekDay = day as WeekDay;
    if (seen.has(weekDay)) {
      return { error: `${dayLabel(weekDay)} is listed more than once.` };
    }
    seen.add(weekDay);
    if (
      typeof open !== 'string' ||
      typeof close !== 'string' ||
      !TIME_PATTERN.test(open) ||
      !TIME_PATTERN.test(close)
    ) {
      return { error: `${dayLabel(weekDay)}: use times like 08:00.` };
    }
    // "HH:mm" strings sort the same way as the times they stand for.
    if (close <= open) {
      return {
        error: `${dayLabel(weekDay)}: closing time must be after opening time.`,
      };
    }
  }

  const order = WEEK_DAYS.map((weekDay) => weekDay.key as string);
  const hours = (value as OpeningDay[])
    .map(({ day, open, close }) => ({ day, open, close }))
    .sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day));
  return { hours };
}

/**
 * Human-readable lines, joining neighbouring days that share hours:
 * ["Mon – Fri: 08:00 – 17:00", "Sat: 09:00 – 13:00"].
 */
export function formatOpeningHours(
  hours: ReadonlyArray<{ day: string; open: string; close: string }>,
): string[] {
  const byDay = new Map<string, { open: string; close: string }>(
    hours.map((entry) => [entry.day, entry]),
  );
  const lines: string[] = [];
  let run: {
    first: WeekDay;
    last: WeekDay;
    open: string;
    close: string;
  } | null = null;

  const flush = () => {
    if (!run) return;
    const days =
      run.first === run.last
        ? shortDay(run.first)
        : `${shortDay(run.first)} – ${shortDay(run.last)}`;
    lines.push(`${days}: ${run.open} – ${run.close}`);
    run = null;
  };

  for (const { key } of WEEK_DAYS) {
    const entry = byDay.get(key);
    if (entry && run && run.open === entry.open && run.close === entry.close) {
      run.last = key;
    } else {
      flush();
      if (entry) {
        run = { first: key, last: key, open: entry.open, close: entry.close };
      }
    }
  }
  flush();
  return lines;
}

/** Opening hours are entered in the shop's local time. */
export const SHOP_TIME_ZONE = 'Africa/Nairobi';

export type OpenStatus = { open: boolean; label: string };

/**
 * Whether a shop is open at `now` and when that changes, e.g. "Open until 17:00"
 * or "Opens tomorrow at 08:00". Null when the seller hasn't set hours.
 */
export function openStatus(
  hours: ReadonlyArray<OpeningDay>,
  now: Date = new Date(),
): OpenStatus | null {
  if (hours.length === 0) return null;

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SHOP_TIME_ZONE,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  const today = WEEK_DAYS.findIndex(
    (weekDay) => weekDay.short === part('weekday'),
  );
  // "HH:mm" strings sort the same way as the times they stand for.
  const time = `${part('hour')}:${part('minute')}`;
  const byDay = new Map(hours.map((entry) => [entry.day as string, entry]));

  const todays = byDay.get(WEEK_DAYS[today]?.key);
  if (todays && todays.open <= time && time < todays.close) {
    return { open: true, label: `Open until ${todays.close}` };
  }
  if (todays && time < todays.open) {
    return { open: false, label: `Opens today at ${todays.open}` };
  }
  for (let ahead = 1; ahead <= 7; ahead++) {
    const weekDay = WEEK_DAYS[(today + ahead) % WEEK_DAYS.length];
    const next = byDay.get(weekDay.key);
    if (next) {
      const when = ahead === 1 ? 'tomorrow' : weekDay.label;
      return { open: false, label: `Opens ${when} at ${next.open}` };
    }
  }
  return { open: false, label: 'Closed' };
}

function shortDay(day: WeekDay): string {
  return WEEK_DAYS.find((weekDay) => weekDay.key === day)?.short ?? day;
}
