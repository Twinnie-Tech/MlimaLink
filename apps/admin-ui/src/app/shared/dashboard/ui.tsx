import type { ReactNode } from 'react';
import { Info, Loader2, type LucideIcon } from 'lucide-react';
import type { OrderStatus } from '@org/models';

/** Dashboard building blocks shared by every admin page. */

export const inputClassName =
  'w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 aria-[invalid=true]:border-rose-500/70';

export const labelClassName =
  'mb-1.5 block text-sm font-medium text-neutral-700';

export const primaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-60 dark:hover:bg-white/[0.08]';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-poppins text-2xl font-semibold text-neutral-900 sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className = '',
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-xl border border-neutral-200 bg-white p-5 sm:p-6 ${className}`}
    >
      {(title || action) && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            {title && (
              <h2 className="font-poppins text-lg font-semibold text-neutral-900">
                {title}
              </h2>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'blue',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: 'blue' | 'emerald' | 'violet' | 'amber';
}) {
  const tones = {
    blue: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
    emerald: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
    violet: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
    amber: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  };
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-neutral-500">{label}</span>
        <span
          className={`flex h-9 w-9 items-center justify-center rounded-lg ${tones[tone]}`}
        >
          <Icon size={18} />
        </span>
      </div>
      <p className="mt-3 font-poppins text-2xl font-semibold text-neutral-900">
        {value}
      </p>
      {hint && <p className="mt-1 text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-neutral-200 px-6 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <Icon size={26} />
      </span>
      <h3 className="font-poppins text-lg font-semibold text-neutral-900">
        {title}
      </h3>
      <p className="mt-1.5 max-w-sm text-sm text-neutral-500">{description}</p>
    </div>
  );
}

/** Marks a page whose content is an example until it is wired to live data. */
export function PreviewNotice({ children }: { children: ReactNode }) {
  return (
    <p
      role="note"
      className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
    >
      <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export function Loading({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="flex justify-center py-12">
      <Loader2 className="animate-spin text-blue-600" size={26} />
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
    >
      {message}
    </p>
  );
}

export const STATUS_TONE: Record<OrderStatus, string> = {
  placed: 'bg-blue-500/10 text-blue-700',
  confirmed: 'bg-sky-500/10 text-sky-700',
  out_for_delivery: 'bg-amber-500/10 text-amber-700',
  delivered: 'bg-emerald-500/10 text-emerald-700',
  cancelled: 'bg-neutral-500/10 text-neutral-600',
};

export function Badge({
  tone,
  children,
}: {
  tone: string;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2.5 py-1 text-xs font-medium whitespace-nowrap ${tone}`}
    >
      {children}
    </span>
  );
}

/** A plain table with a header row; rows are passed as children. */
export function DataTable({
  label,
  columns,
  children,
  minWidth = 640,
}: {
  label: string;
  columns: string[];
  children: ReactNode;
  minWidth?: number;
}) {
  return (
    <div className="-mx-2 overflow-x-auto">
      <table
        aria-label={label}
        className="w-full text-left text-sm"
        style={{ minWidth }}
      >
        <thead className="text-xs text-neutral-500 uppercase">
          <tr>
            {columns.map((column) => (
              <th key={column} scope="col" className="px-2 py-2 font-medium">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-200">{children}</tbody>
      </table>
    </div>
  );
}

export const cellClassName = 'px-2 py-2.5 align-top text-neutral-700';

export function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatNumber(value: number) {
  return new Intl.NumberFormat('en-US').format(value);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
