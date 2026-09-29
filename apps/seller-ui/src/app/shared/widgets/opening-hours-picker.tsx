'use client';

import {
  WEEK_DAYS,
  parseOpeningHours,
  type OpeningDay,
  type WeekDay,
} from '@org/models/opening-hours';
import { FieldError } from './auth-form';

export type OpeningHoursRow = {
  day: WeekDay;
  isOpen: boolean;
  /** 24-hour "HH:mm", as produced by <input type="time">. */
  open: string;
  close: string;
};

const DEFAULT_OPEN = '08:00';
const DEFAULT_CLOSE = '18:00';

export const emptyOpeningHours = (): OpeningHoursRow[] =>
  WEEK_DAYS.map(({ key }) => ({
    day: key,
    isOpen: false,
    open: DEFAULT_OPEN,
    close: DEFAULT_CLOSE,
  }));

/** The open days, in the shape the auth-service stores. */
export function toOpeningHours(rows: OpeningHoursRow[]): OpeningDay[] {
  return rows
    .filter((row) => row.isOpen)
    .map(({ day, open, close }) => ({ day, open, close }));
}

/** Same rules as the auth-service, so the form catches problems first. */
export function openingHoursError(rows: OpeningHoursRow[]): string | null {
  const result = parseOpeningHours(toOpeningHours(rows));
  return 'error' in result ? result.error : null;
}

const dayLabel = (day: WeekDay | undefined) =>
  WEEK_DAYS.find(({ key }) => key === day)?.label ?? '';

const PRESETS: { label: string; days: WeekDay[] }[] = [
  { label: 'Mon – Fri', days: ['mon', 'tue', 'wed', 'thu', 'fri'] },
  { label: 'Mon – Sat', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
  { label: 'Every day', days: WEEK_DAYS.map(({ key }) => key) },
];

const chipClassName =
  'rounded-full border border-neutral-300 bg-white px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-brand-start hover:text-brand-start';
const timeClassName =
  'w-full min-w-0 rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm text-neutral-900 outline-none focus:border-brand-start focus:ring-2 focus:ring-brand-start/20 disabled:bg-neutral-100';

export function OpeningHoursPicker({
  value,
  onChange,
  error,
}: {
  value: OpeningHoursRow[];
  onChange: (rows: OpeningHoursRow[]) => void;
  error?: string;
}) {
  const firstOpen = value.find((row) => row.isOpen);

  const update = (day: WeekDay, change: Partial<OpeningHoursRow>) =>
    onChange(
      value.map((row) => (row.day === day ? { ...row, ...change } : row)),
    );

  // A newly opened day starts with the hours of the first open day, which is
  // usually what sellers want.
  const toggle = (row: OpeningHoursRow) =>
    update(
      row.day,
      row.isOpen
        ? { isOpen: false }
        : {
            isOpen: true,
            open: firstOpen?.open ?? row.open,
            close: firstOpen?.close ?? row.close,
          },
    );

  const applyPreset = (days: WeekDay[]) => {
    const open = firstOpen?.open ?? DEFAULT_OPEN;
    const close = firstOpen?.close ?? DEFAULT_CLOSE;
    onChange(
      value.map((row) =>
        days.includes(row.day)
          ? { ...row, isOpen: true, open, close }
          : { ...row, isOpen: false },
      ),
    );
  };

  const copyFirstToAll = () => {
    if (!firstOpen) return;
    onChange(
      value.map((row) =>
        row.isOpen
          ? { ...row, open: firstOpen.open, close: firstOpen.close }
          : row,
      ),
    );
  };

  const openCount = value.filter((row) => row.isOpen).length;

  return (
    <fieldset
      aria-describedby={
        error ? 'opening-hours-hint opening-hours-error' : 'opening-hours-hint'
      }
    >
      <legend className="mb-1.5 block text-sm font-medium text-neutral-800">
        Opening hours <span className="text-neutral-400">(optional)</span>
      </legend>
      <p id="opening-hours-hint" className="mb-3 text-sm text-neutral-500">
        Tick the days you&apos;re open and set the times. Unticked days show as
        closed.
      </p>

      <div className="mb-3 flex flex-wrap gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => applyPreset(preset.days)}
            className={chipClassName}
          >
            {preset.label}
          </button>
        ))}
        {openCount > 0 && (
          <button
            type="button"
            onClick={() => onChange(emptyOpeningHours())}
            className={chipClassName}
          >
            Clear
          </button>
        )}
      </div>

      <ul
        className={`divide-y rounded-md border ${
          error
            ? 'divide-rose-200 border-rose-400'
            : 'divide-neutral-200 border-neutral-300'
        }`}
      >
        {value.map((row) => {
          const label = dayLabel(row.day);
          return (
            <li
              key={row.day}
              className="grid grid-cols-[7.5rem_1fr] items-center gap-3 px-3 py-2 sm:grid-cols-[8.5rem_1fr]"
            >
              <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
                <input
                  type="checkbox"
                  checked={row.isOpen}
                  onChange={() => toggle(row)}
                  aria-label={`Open on ${label}`}
                  className="h-4 w-4 accent-brand-start"
                />
                <span className={row.isOpen ? 'font-medium' : ''}>{label}</span>
              </label>
              {row.isOpen ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    step={900}
                    value={row.open}
                    onChange={(e) => update(row.day, { open: e.target.value })}
                    aria-label={`${label} opening time`}
                    className={timeClassName}
                  />
                  <span className="text-neutral-400" aria-hidden="true">
                    –
                  </span>
                  <input
                    type="time"
                    step={900}
                    value={row.close}
                    onChange={(e) => update(row.day, { close: e.target.value })}
                    aria-label={`${label} closing time`}
                    className={timeClassName}
                  />
                </div>
              ) : (
                <span className="text-sm text-neutral-400">Closed</span>
              )}
            </li>
          );
        })}
      </ul>

      {openCount > 1 && (
        <button
          type="button"
          onClick={copyFirstToAll}
          className="mt-2 text-sm font-medium text-brand-start hover:underline"
        >
          Use {dayLabel(firstOpen?.day)}&apos;s hours for all open days
        </button>
      )}

      <FieldError id="opening-hours-error" message={error} />
    </fieldset>
  );
}
