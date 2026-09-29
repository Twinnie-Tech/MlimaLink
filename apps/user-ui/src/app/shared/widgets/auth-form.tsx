import type { ReactNode } from 'react';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';

export function labelClassName(hasError: boolean) {
  return `mb-1.5 block text-sm font-medium ${hasError ? 'text-rose-600' : 'text-neutral-700'}`;
}

export function inputClassName(hasError: boolean) {
  return `w-full rounded-md border px-4 py-2.5 outline-none transition focus:ring-2 ${
    hasError
      ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/20'
      : 'border-neutral-300 focus:border-brand-start focus:ring-brand-start/20'
  }`;
}

export const submitButtonClassName =
  'w-full rounded-md bg-neutral-900 py-3 font-poppins font-medium text-white transition hover:bg-neutral-800 dark:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60';

export const textLinkClassName =
  'font-medium text-brand-start transition hover:text-brand-end hover:underline';

/** Page title with breadcrumb and a centred white card, shared by the auth pages. */
export function AuthShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="px-4 py-12">
      <h1 className="text-center font-poppins text-4xl font-semibold text-neutral-900">
        {title}
      </h1>
      <nav
        aria-label="Breadcrumb"
        className="mt-2 text-center text-neutral-600"
      >
        <Link href="/" className="transition hover:text-brand-start">
          Home
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          .
        </span>
        <span aria-current="page">{title}</span>
      </nav>

      <div className="mx-auto mt-6 w-full max-w-md rounded-lg bg-white p-8 shadow-md">
        {children}
      </div>
    </div>
  );
}

export function AuthDivider({ label }: { label: string }) {
  return (
    <div className="my-6 flex items-center gap-3 text-sm text-neutral-500">
      <span className="h-px flex-1 bg-neutral-300" />
      <span>{label}</span>
      <span className="h-px flex-1 bg-neutral-300" />
    </div>
  );
}

export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-rose-600">
      {message}
    </p>
  );
}

export function ServerError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p
      role="alert"
      className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
    >
      {message}
    </p>
  );
}

export function PasswordToggle({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? 'Hide password' : 'Show password'}
      className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-neutral-500 hover:text-neutral-800"
    >
      {visible ? <EyeOff size={20} /> : <Eye size={20} />}
    </button>
  );
}
