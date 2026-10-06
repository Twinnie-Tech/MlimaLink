'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';

/** The first and last page, the current page and its neighbours; `null` marks a gap. */
export function pageNumbers(
  page: number,
  totalPages: number,
  siblings = 1,
): (number | null)[] {
  const shown = new Set([1, totalPages]);
  for (let n = page - siblings; n <= page + siblings; n++) {
    if (n >= 1 && n <= totalPages) shown.add(n);
  }
  const sorted = [...shown].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  sorted.forEach((n, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && n - previous === 2) result.push(n - 1);
    else if (previous !== undefined && n - previous > 2) result.push(null);
    result.push(n);
  });
  return result;
}

const stepClassName =
  'inline-flex h-10 items-center gap-1 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 transition hover:border-brand-start hover:text-brand-start disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700';

const numberClassName =
  'inline-flex h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-medium transition';

export function Pagination({
  page,
  totalPages,
  onPageChange,
  label,
}: {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  /** Names the navigation landmark, e.g. "Product pages". */
  label: string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav
      aria-label={label}
      className="flex flex-wrap items-center justify-center gap-2 pt-4"
    >
      <button
        type="button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={stepClassName}
      >
        <ChevronLeft size={16} aria-hidden />
        Previous
      </button>
      <ol className="hidden items-center gap-2 sm:flex">
        {pageNumbers(page, totalPages).map((n, index) =>
          n === null ? (
            <li
              key={`gap-${index}`}
              aria-hidden
              className="px-1 text-neutral-400"
            >
              …
            </li>
          ) : (
            <li key={n}>
              <button
                type="button"
                onClick={() => onPageChange(n)}
                aria-current={n === page ? 'page' : undefined}
                aria-label={`Page ${n}`}
                className={`${numberClassName} ${
                  n === page
                    ? 'border-brand-start bg-brand-start text-white'
                    : 'border-neutral-300 bg-white text-neutral-700 hover:border-brand-start hover:text-brand-start'
                }`}
              >
                {n}
              </button>
            </li>
          ),
        )}
      </ol>
      <span className="text-sm text-neutral-600 sm:hidden">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={stepClassName}
      >
        Next
        <ChevronRight size={16} aria-hidden />
      </button>
    </nav>
  );
}
