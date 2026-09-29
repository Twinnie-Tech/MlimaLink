import type { ReactNode } from 'react';
import Link from 'next/link';
import { Info, type LucideIcon } from 'lucide-react';

/** Light dashboard building blocks shared by every account page. */

export const inputClassName =
  'w-full rounded-lg border border-neutral-300 bg-white px-3.5 py-2.5 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-brand-start focus:ring-2 focus:ring-brand-start/20 aria-[invalid=true]:border-rose-400';

export const labelClassName =
  'mb-1.5 block text-sm font-medium text-neutral-700';

export const primaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-brand-start px-4 py-2.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-end disabled:cursor-not-allowed disabled:opacity-60';

export const secondaryButtonClassName =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-neutral-700 transition hover:border-brand-start/40 hover:text-brand-start';

export const textLinkClassName =
  'inline-flex items-center gap-1 text-sm font-medium text-brand-start hover:text-brand-end';

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
      className={`rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6 ${className}`}
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

const tones = {
  indigo: 'bg-brand-start/10 text-brand-start',
  rose: 'bg-rose-50 text-rose-500',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  href,
  tone = 'indigo',
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  href?: string;
  tone?: keyof typeof tones;
}) {
  const content = (
    <>
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
      {hint && <p className="mt-1 text-xs text-neutral-400">{hint}</p>}
    </>
  );
  const className =
    'block rounded-xl border border-neutral-200 bg-white p-5 shadow-sm';

  return href ? (
    <Link
      href={href}
      className={`${className} transition hover:-translate-y-0.5 hover:border-brand-start/40 hover:shadow-md`}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
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
    <div className="flex flex-col items-center rounded-xl border border-dashed border-neutral-200 px-6 py-12 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
        <Icon size={26} />
      </span>
      <h3 className="font-poppins text-lg font-semibold text-neutral-900">
        {title}
      </h3>
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
    <p className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <Info size={18} className="mt-0.5 shrink-0 text-amber-500" />
      <span>{children}</span>
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
        {hint && <span className="text-xs text-neutral-400">{hint}</span>}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-rose-600">
          {error}
        </p>
      )}
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
      className={`grid gap-x-8 gap-y-5 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}
    >
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-xs uppercase tracking-wide text-neutral-400">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-sm font-medium text-neutral-900">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function formatMonthYear(iso?: string) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(iso));
}

export function accountType(role: string | null) {
  return role ? role[0].toUpperCase() + role.slice(1) : 'User';
}
