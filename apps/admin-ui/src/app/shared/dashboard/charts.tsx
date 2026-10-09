import type { ChartSlice } from '@org/models';

/** Small SVG charts for the admin dashboard. Each also renders its numbers as a hidden table for screen readers. */

export const CHART_COLORS = [
  '#3b82f6',
  '#8b5cf6',
  '#10b981',
  '#f59e0b',
  '#f43f5e',
  '#94a3b8',
];

export type Series = { name: string; color: string; values: number[] };

const WIDTH = 600;
const HEIGHT = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 56 };
const TICKS = 4;

/** Rounds up to 1, 2, 2.5 or 5 times a power of ten so the axis has tidy labels. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * magnitude >= value) ?? 10;
  return step * magnitude;
}

function Axes({
  max,
  labels,
  format,
}: {
  max: number;
  labels: string[];
  format: (value: number) => string;
}) {
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const band = (WIDTH - PAD.left - PAD.right) / labels.length;
  return (
    <g aria-hidden="true">
      {Array.from({ length: TICKS + 1 }, (_, i) => {
        const value = (max / TICKS) * i;
        const y = PAD.top + plotHeight - (value / max) * plotHeight;
        return (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y}
              y2={y}
              className="stroke-neutral-200"
              strokeDasharray={i === 0 ? undefined : '3 4'}
            />
            <text
              x={PAD.left - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-neutral-500 text-[11px]"
            >
              {format(value)}
            </text>
          </g>
        );
      })}
      {labels.map((label, i) => (
        <text
          key={label + i}
          x={PAD.left + band * i + band / 2}
          y={HEIGHT - 8}
          textAnchor="middle"
          className="fill-neutral-500 text-[11px]"
        >
          {label}
        </text>
      ))}
    </g>
  );
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-neutral-600">
      {items.map((item) => (
        <li key={item.name} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 rounded-sm"
            style={{ backgroundColor: item.color }}
          />
          {item.name}
        </li>
      ))}
    </ul>
  );
}

function DataSummary({
  label,
  labels,
  series,
  format,
}: {
  label: string;
  labels: string[];
  series: Series[];
  format: (value: number) => string;
}) {
  return (
    <table className="sr-only">
      <caption>{label}</caption>
      <thead>
        <tr>
          <th scope="col">Month</th>
          {series.map((s) => (
            <th key={s.name} scope="col">
              {s.name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {labels.map((name, i) => (
          <tr key={name + i}>
            <th scope="row">{name}</th>
            {series.map((s) => (
              <td key={s.name}>{format(s.values[i] ?? 0)}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function BarChart({
  label,
  labels,
  series,
  format = String,
}: {
  label: string;
  labels: string[];
  series: Series[];
  format?: (value: number) => string;
}) {
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const band = (WIDTH - PAD.left - PAD.right) / labels.length;
  const barWidth = Math.min(28, (band * 0.7) / series.length);
  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
      >
        <Axes max={max} labels={labels} format={format} />
        {labels.map((name, i) =>
          series.map((s, j) => {
            const value = s.values[i] ?? 0;
            const height = (value / max) * plotHeight;
            const groupWidth = barWidth * series.length;
            const x =
              PAD.left + band * i + (band - groupWidth) / 2 + barWidth * j;
            return (
              <rect
                key={`${name}-${s.name}`}
                x={x}
                y={PAD.top + plotHeight - height}
                width={barWidth - 2}
                height={height}
                rx={3}
                fill={s.color}
              >
                <title>{`${s.name}, ${name}: ${format(value)}`}</title>
              </rect>
            );
          }),
        )}
      </svg>
      <Legend items={series} />
      <DataSummary
        label={label}
        labels={labels}
        series={series}
        format={format}
      />
    </figure>
  );
}

export function LineChart({
  label,
  labels,
  series,
  format = String,
}: {
  label: string;
  labels: string[];
  series: Series[];
  format?: (value: number) => string;
}) {
  const max = niceMax(Math.max(0, ...series.flatMap((s) => s.values)));
  const plotHeight = HEIGHT - PAD.top - PAD.bottom;
  const band = (WIDTH - PAD.left - PAD.right) / labels.length;
  const point = (value: number, i: number) => ({
    x: PAD.left + band * i + band / 2,
    y: PAD.top + plotHeight - (value / max) * plotHeight,
  });
  return (
    <figure>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={label}
      >
        <Axes max={max} labels={labels} format={format} />
        {series.map((s) => {
          const points = labels.map((_, i) => point(s.values[i] ?? 0, i));
          return (
            <g key={s.name}>
              <polyline
                points={points.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="none"
                stroke={s.color}
                strokeWidth={2.5}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {points.map((p, i) => (
                <circle key={i} cx={p.x} cy={p.y} r={4} fill={s.color}>
                  <title>{`${s.name}, ${labels[i]}: ${format(s.values[i] ?? 0)}`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>
      <Legend items={series} />
      <DataSummary
        label={label}
        labels={labels}
        series={series}
        format={format}
      />
    </figure>
  );
}

const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function DonutChart({
  label,
  slices,
  centerLabel = 'Total',
}: {
  label: string;
  slices: ChartSlice[];
  centerLabel?: string;
}) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  let offset = 0;
  return (
    <figure className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <svg
        viewBox="0 0 160 160"
        className="h-40 w-40 shrink-0"
        role="img"
        aria-label={label}
      >
        <circle
          cx={80}
          cy={80}
          r={RADIUS}
          fill="none"
          strokeWidth={22}
          className="stroke-neutral-200"
        />
        {total > 0 &&
          slices.map((slice, i) => {
            const length = (slice.value / total) * CIRCUMFERENCE;
            const dash = `${length} ${CIRCUMFERENCE - length}`;
            const circle = (
              <circle
                key={slice.label}
                cx={80}
                cy={80}
                r={RADIUS}
                fill="none"
                stroke={CHART_COLORS[i % CHART_COLORS.length]}
                strokeWidth={22}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                transform="rotate(-90 80 80)"
              >
                <title>{`${slice.label}: ${slice.value}`}</title>
              </circle>
            );
            offset += length;
            return circle;
          })}
        <text
          x={80}
          y={76}
          textAnchor="middle"
          className="fill-neutral-900 font-poppins text-[22px] font-semibold"
        >
          {total.toLocaleString('en-US')}
        </text>
        <text
          x={80}
          y={96}
          textAnchor="middle"
          className="fill-neutral-500 text-[11px]"
        >
          {centerLabel}
        </text>
      </svg>
      <ul className="w-full space-y-2 text-sm">
        {slices.map((slice, i) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{
                backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
              }}
            />
            <span className="flex-1 text-neutral-700">{slice.label}</span>
            <span className="font-medium text-neutral-900">
              {slice.value.toLocaleString('en-US')}
            </span>
            <span className="w-11 text-right text-xs text-neutral-500">
              {total ? Math.round((slice.value / total) * 100) : 0}%
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Rows of labelled bars, e.g. accounts per country. */
export function HorizontalBars({
  rows,
  series,
}: {
  rows: { label: string; values: number[] }[];
  series: { name: string; color: string }[];
}) {
  const max = Math.max(
    1,
    ...rows.map((r) => r.values.reduce((a, b) => a + b, 0)),
  );
  return (
    <div>
      <ul className="space-y-3">
        {rows.map((row) => {
          const total = row.values.reduce((a, b) => a + b, 0);
          return (
            <li key={row.label}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-neutral-700">{row.label}</span>
                <span className="text-neutral-500">
                  {series
                    .map((s, i) => `${row.values[i]} ${s.name.toLowerCase()}`)
                    .join(' · ')}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="flex h-2 overflow-hidden rounded-full bg-neutral-100"
                style={{ width: `${Math.max((total / max) * 100, 2)}%` }}
              >
                {row.values.map((value, i) => (
                  <span
                    key={series[i].name}
                    style={{
                      width: total ? `${(value / total) * 100}%` : 0,
                      backgroundColor: series[i].color,
                    }}
                  />
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      <Legend items={series} />
    </div>
  );
}
