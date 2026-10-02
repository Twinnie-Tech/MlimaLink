'use client';

import type { FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Search,
  SearchX,
  Store,
} from 'lucide-react';
import type { ShopFilter } from '@org/models';
import { PRODUCT_CATEGORIES } from '@org/models/catalog';
import { DELIVERY_ZONES } from '@org/models/delivery';
import { listShops, shopsQueryKey } from '../utils/shops-api';
import { EmptyState } from './empty-state';
import { ShopCard } from './shop-card';

type Param = 'search' | 'category' | 'zone' | 'page';

const fieldClassName =
  'h-11 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-800 focus:border-brand-start focus:ring-2 focus:ring-brand-start/20 focus:outline-none';

const pageButtonClassName =
  'inline-flex items-center gap-1 rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-700 transition hover:border-brand-start hover:text-brand-start disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-300 disabled:hover:text-neutral-700';

function SkeletonGrid() {
  return (
    <ul
      role="status"
      aria-label="Loading shops"
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <li
          key={index}
          className="h-80 animate-pulse rounded-2xl border border-neutral-200 bg-white"
        >
          <div className="h-28 rounded-t-2xl bg-neutral-200" />
          <div className="space-y-3 p-5">
            <div className="h-4 w-2/3 rounded bg-neutral-200" />
            <div className="h-3 w-full rounded bg-neutral-100" />
            <div className="h-3 w-1/2 rounded bg-neutral-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Searchable, filterable list of shops. Filters live in the URL so results can be shared. */
export function ShopDirectory() {
  const router = useRouter();
  const params = useSearchParams();
  const search = params.get('search')?.trim();
  const category = params.get('category');
  const zone = params.get('zone');
  const filter: ShopFilter = {
    ...(search && { search }),
    ...(category && { category }),
    ...(zone && { zone }),
  };
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const filtered = Object.keys(filter).length > 0;

  const { data, isPending, isPlaceholderData, error, refetch } = useQuery({
    queryKey: shopsQueryKey(filter, page),
    queryFn: () => listShops(filter, page),
    placeholderData: keepPreviousData,
  });

  const update = (changes: Partial<Record<Param, string>>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // A new search starts again from the first page.
    if (!('page' in changes)) next.delete('page');
    const query = next.toString().replace(/\+/g, '%20');
    router.replace(query ? `/shops?${query}` : '/shops', {
      scroll: 'page' in changes,
    });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const search = new FormData(event.currentTarget).get('search');
    update({ search: typeof search === 'string' ? search.trim() : '' });
  };

  const summary = data
    ? [
        data.total === 1 ? '1 shop' : `${data.total} shops`,
        filter.category && `in ${filter.category}`,
        filter.zone && `around ${filter.zone}`,
        filter.search && `matching “${filter.search}”`,
      ]
        .filter(Boolean)
        .join(' ')
    : '';

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm lg:flex-row lg:items-center">
        <form
          role="search"
          onSubmit={submitSearch}
          className="flex flex-1 gap-2"
        >
          <label className="relative flex-1">
            <span className="sr-only">Search shops</span>
            <Search
              size={18}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
              aria-hidden
            />
            <input
              key={filter.search ?? ''}
              name="search"
              type="search"
              defaultValue={filter.search ?? ''}
              placeholder="Search shops by name or area"
              className={`${fieldClassName} w-full pl-10`}
            />
          </label>
          <button
            type="submit"
            className="h-11 rounded-lg bg-brand-start px-5 text-sm font-medium text-white transition hover:bg-brand-end"
          >
            Search
          </button>
        </form>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="shop-category">
            Category
          </label>
          <select
            id="shop-category"
            value={filter.category ?? ''}
            onChange={(event) => update({ category: event.target.value })}
            className={fieldClassName}
          >
            <option value="">All categories</option>
            {PRODUCT_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor="shop-zone">
            Town
          </label>
          <select
            id="shop-zone"
            value={filter.zone ?? ''}
            onChange={(event) => update({ zone: event.target.value })}
            className={fieldClassName}
          >
            <option value="">All towns</option>
            {DELIVERY_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-sm">
        <p aria-live="polite" className="text-neutral-600">
          {summary}
        </p>
        {filtered && (
          <button
            type="button"
            onClick={() => update({ search: '', category: '', zone: '' })}
            className="font-medium text-brand-start hover:text-brand-end"
          >
            Clear filters
          </button>
        )}
      </div>

      {isPending ? (
        <SkeletonGrid />
      ) : error ? (
        <div className="space-y-4">
          <EmptyState
            icon={Store}
            title="Couldn’t load shops"
            description={
              error instanceof Error
                ? error.message
                : 'Something went wrong. Please try again.'
            }
          />
          <p className="text-center">
            <button
              type="button"
              onClick={() => refetch()}
              className="text-sm font-medium text-brand-start hover:text-brand-end"
            >
              Try again
            </button>
          </p>
        </div>
      ) : data.items.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={SearchX}
            title="No shops match your search"
            description="Try another name, category or town."
            action={{ href: '/shops', label: 'See all shops' }}
          />
        ) : (
          <EmptyState
            icon={Store}
            title="No shops yet"
            description="Shops are opening across Mt Kenya. Be one of the first to sell on MlimaLink."
            action={{ href: '/become-seller', label: 'Open your shop' }}
          />
        )
      ) : (
        <>
          <ul
            aria-label="Shops"
            aria-busy={isPlaceholderData}
            className={`grid gap-6 transition-opacity sm:grid-cols-2 lg:grid-cols-3 ${
              isPlaceholderData ? 'opacity-60' : ''
            }`}
          >
            {data.items.map((shop) => (
              <li key={shop.id}>
                <ShopCard shop={shop} />
              </li>
            ))}
          </ul>

          {data.totalPages > 1 && (
            <nav
              aria-label="Shop pages"
              className="flex items-center justify-center gap-4 pt-2"
            >
              <button
                type="button"
                onClick={() => update({ page: String(page - 1) })}
                disabled={page <= 1}
                className={pageButtonClassName}
              >
                <ChevronLeft size={16} aria-hidden />
                Previous
              </button>
              <span className="text-sm text-neutral-600">
                Page {page} of {data.totalPages}
              </span>
              <button
                type="button"
                onClick={() => update({ page: String(page + 1) })}
                disabled={page >= data.totalPages}
                className={pageButtonClassName}
              >
                Next
                <ChevronRight size={16} aria-hidden />
              </button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
