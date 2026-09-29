import type { ReactNode } from 'react';
import Link from 'next/link';
import { Info, type LucideIcon } from 'lucide-react';

/** Dark dashboard building blocks shared by every seller dashboard page. */

export const inputClassName =
  'w-full rounded-lg border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/30 aria-[invalid=true]:border-rose-500/70';

export const labelClassName = 'mb-1.5 block text-sm font-medium text-neutral-700';

export const primaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-800 transition hover:border-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/[0.08]';

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
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-neutral-200 px-6 py-14 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <Icon size={26} />
      </span>
      <h3 className="font-poppins text-lg font-semibold text-neutral-900">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm text-neutral-500">{description}</p>
      {action && (
        <Link href={action.href} className={`mt-6 ${primaryButtonClassName}`}>
          {action.label}
        </Link>
      )}
    </div>
  );
}

/** Explains that a feature's screen is ready but saving it isn't connected yet. */
export function NotLiveNotice({ children }: { children: ReactNode }) {
  return (
    <p className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800">
      <Info size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span>{children}</span>
    </p>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-xs text-rose-600 dark:text-rose-400">
      {message}
    </p>
  );
}

export function Field({
  id,
  label,
  hint,
  error,
  children,
  className = '',
}: {
  id: string;
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className={labelClassName}>
          {label}
        </label>
        {hint && <span className="text-xs text-neutral-500">{hint}</span>}
      </div>
      {children}
      <FieldError id={`${id}-error`} message={error} />
    </div>
  );
}

/** Props that tie an input to its Field error for screen readers. */
export function describedBy(id: string, error?: string) {
  return {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${id}-error` : undefined,
  };
}

export function DetailList({
  items,
  columns = 2,
}: {
  items: { label: string; value: ReactNode }[];
  columns?: 1 | 2;
}) {
  return (
    <dl
      className={`grid gap-x-8 gap-y-4 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs uppercase tracking-wide text-neutral-500">
            {item.label}
          </dt>
          <dd className="mt-1 break-words whitespace-pre-line text-sm font-medium text-neutral-900">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function formatMoney(amount: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}
