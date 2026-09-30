'use client';

import { useState, type FormEvent } from 'react';
import { Loader2, TicketPercent, X } from 'lucide-react';
import type { AppliedDiscount } from '@org/models';
import { describeDiscount } from '@org/models/checkout';
import { formatPrice } from '../store/shop-store';

/** Code entry for the order summary, or the applied code with a way to remove it. */
export function DiscountCodeBox({
  code,
  applied,
  error,
  checking,
  onApply,
  onRemove,
}: {
  code: string | null;
  applied?: AppliedDiscount;
  error?: string;
  checking: boolean;
  onApply: (code: string) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.trim()) return;
    onApply(draft);
    setDraft('');
  };

  if (code) {
    return (
      <div className="mt-4">
        <div className="flex items-center justify-between gap-3 rounded-md border border-dashed border-neutral-300 px-3 py-2 text-sm">
          <span className="flex min-w-0 items-center gap-2">
            {checking ? (
              <Loader2
                size={16}
                className="shrink-0 animate-spin text-neutral-500"
                aria-hidden="true"
              />
            ) : (
              <TicketPercent
                size={16}
                className={`shrink-0 ${applied ? 'text-emerald-600 dark:text-emerald-400' : 'text-neutral-500'}`}
                aria-hidden="true"
              />
            )}
            <span className="truncate">
              <span className="font-mono font-semibold text-neutral-900">
                {code}
              </span>
              {applied && (
                <span className="text-neutral-500">
                  {' '}
                  · {describeDiscount(applied)} {applied.shopName}
                </span>
              )}
            </span>
          </span>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove code ${code}`}
            className="shrink-0 text-neutral-400 transition hover:text-rose-600"
          >
            <X size={16} />
          </button>
        </div>
        {checking && (
          <p role="status" className="mt-1.5 text-xs text-neutral-500">
            Checking your code…
          </p>
        )}
        {applied && !checking && (
          <p
            role="status"
            className="mt-1.5 text-xs text-emerald-700 dark:text-emerald-400"
          >
            You save {formatPrice(applied.amount)}.
          </p>
        )}
        {error && !checking && (
          <p
            role="alert"
            className="mt-1.5 text-xs text-rose-600 dark:text-rose-400"
          >
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-4 flex gap-2">
      <label htmlFor="discount-code" className="sr-only">
        Discount code
      </label>
      <input
        id="discount-code"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder="Discount code"
        autoComplete="off"
        maxLength={16}
        className="min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm uppercase placeholder:normal-case focus:border-brand-start focus:outline-none"
      />
      <button
        type="submit"
        disabled={!draft.trim()}
        className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-800 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Apply
      </button>
    </form>
  );
}
