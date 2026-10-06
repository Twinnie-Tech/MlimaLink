'use client';

import { useCallback, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { PackageSearch, SearchX, SlidersHorizontal, X } from 'lucide-react';
import type { ProductFilter } from '@org/models';
import { PRODUCT_SORTS, formatPrice, isProductSort } from '@org/models/catalog';
import { ProductGrid } from '@org/shop-shared-ui';
import { useShopStore } from '../store/shop-store';
import {
  getProductFacets,
  listProducts,
  productFacetsQueryKey,
  productsQueryKey,
} from '../utils/products-api';
import { OffersBanner } from './offers-banner';
import { Pagination } from './pagination';
import { ProductFilters, type FilterChanges } from './product-filters';

type Param = keyof FilterChanges | 'search' | 'sort' | 'page';

const list = (value: string | null) =>
  value
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean) ?? [];

const amount = (value: string | null) => {
  if (value === null || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : undefined;
};

/** The product filter described by the page URL. */
export function readProductFilter(params: URLSearchParams): ProductFilter {
  const search = params.get('search')?.trim();
  const category = params.get('category');
  const subCategory = params.get('sub');
  const minPrice = amount(params.get('minPrice'));
  const maxPrice = amount(params.get('maxPrice'));
  const colors = list(params.get('colors'));
  const sizes = list(params.get('sizes'));
  const rating = Number(params.get('rating'));
  const sort = params.get('sort');
  return {
    ...(search && { searchTerm: search }),
    ...(category && { category }),
    ...(category && subCategory && { subCategory }),
    ...(minPrice !== undefined && { minPrice }),
    ...(maxPrice !== undefined && { maxPrice }),
    ...(colors.length > 0 && { colors }),
    ...(sizes.length > 0 && { sizes }),
    ...(rating >= 1 && rating <= 5 && { minRating: rating }),
    ...(params.get('sale') === '1' && { onSale: true }),
    ...(params.get('inStock') === '1' && { inStock: true }),
    ...(isProductSort(sort) && sort !== 'newest' && { sort }),
  };
}

function priceLabel(min?: number, max?: number) {
  if (min !== undefined && max !== undefined) {
    return `${formatPrice(min)} – ${formatPrice(max)}`;
  }
  return min !== undefined
    ? `${formatPrice(min)} & above`
    : `Under ${formatPrice(max ?? 0)}`;
}

function SkeletonGrid() {
  return (
    <ul
      role="status"
      aria-label="Loading products"
      className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <li
          key={index}
          className="h-80 animate-pulse rounded-lg border border-neutral-200 bg-white"
        >
          <div className="h-48 rounded-t-lg bg-neutral-200" />
          <div className="space-y-3 p-4">
            <div className="h-4 w-2/3 rounded bg-neutral-200" />
            <div className="h-3 w-1/2 rounded bg-neutral-100" />
            <div className="h-5 w-1/3 rounded bg-neutral-200" />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** The product catalogue with filters, sorting and pages. Everything lives in the URL so results can be shared. */
export function ProductBrowser() {
  const router = useRouter();
  const params = useSearchParams();
  const { isWishlisted, toggleWishlist } = useShopStore();
  const [filtersOpen, setFiltersOpen] = useState(false);

  const filter = readProductFilter(params);
  const page = Math.max(1, Math.floor(Number(params.get('page'))) || 1);
  const facetFilter = {
    ...(filter.category && { category: filter.category }),
    ...(filter.searchTerm && { searchTerm: filter.searchTerm }),
  };

  const { data, isPending, isPlaceholderData, error, refetch } = useQuery({
    queryKey: productsQueryKey(filter, page),
    queryFn: () => listProducts(filter, page),
    placeholderData: keepPreviousData,
  });
  const { data: facets } = useQuery({
    queryKey: productFacetsQueryKey(facetFilter),
    queryFn: () => getProductFacets(facetFilter),
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });

  const update = (changes: Partial<Record<Param, string>>) => {
    const next = new URLSearchParams(params.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    // Any new filter starts again from the first page.
    if (!('page' in changes)) next.delete('page');
    const query = next.toString().replace(/\+/g, '%20');
    router.replace(query ? `/products?${query}` : '/products', {
      scroll: 'page' in changes,
    });
  };
  const closeFilters = useCallback(() => setFiltersOpen(false), []);

  const colors = filter.colors ?? [];
  const sizes = filter.sizes ?? [];
  const chips: { label: string; remove: Partial<Record<Param, string>> }[] = [
    ...(filter.searchTerm
      ? [{ label: `“${filter.searchTerm}”`, remove: { search: '' } }]
      : []),
    ...(filter.category
      ? [{ label: filter.category, remove: { category: '', sub: '' } }]
      : []),
    ...(filter.subCategory
      ? [{ label: filter.subCategory, remove: { sub: '' } }]
      : []),
    ...(filter.minPrice !== undefined || filter.maxPrice !== undefined
      ? [
          {
            label: priceLabel(filter.minPrice, filter.maxPrice),
            remove: { minPrice: '', maxPrice: '' },
          },
        ]
      : []),
    ...colors.map((colour) => ({
      label: colour,
      remove: {
        colors: colors.filter((item) => item !== colour).join(','),
      },
    })),
    ...sizes.map((size) => ({
      label: `Size ${size}`,
      remove: { sizes: sizes.filter((item) => item !== size).join(',') },
    })),
    ...(filter.minRating
      ? [{ label: `${filter.minRating}★ & up`, remove: { rating: '' } }]
      : []),
    ...(filter.onSale ? [{ label: 'On sale', remove: { sale: '' } }] : []),
    ...(filter.inStock ? [{ label: 'In stock', remove: { inStock: '' } }] : []),
  ];
  const filtered = chips.length > 0;
  const clearAll = () =>
    update({
      search: '',
      category: '',
      sub: '',
      minPrice: '',
      maxPrice: '',
      colors: '',
      sizes: '',
      rating: '',
      sale: '',
      inStock: '',
    });

  return (
    <div className="mx-auto w-[90%] max-w-300 space-y-8 py-8">
      <header>
        <h1 className="font-poppins text-3xl font-bold text-neutral-900">
          Our Products
        </h1>
        <p className="mt-1 text-neutral-600">
          Fresh finds from shops across Mt Kenya, delivered by local riders.
        </p>
      </header>

      {!filtered && page === 1 && <OffersBanner />}

      <div className="grid gap-8 lg:grid-cols-[260px_minmax(0,1fr)]">
        <ProductFilters
          filter={filter}
          facets={facets}
          onChange={update}
          open={filtersOpen}
          onClose={closeFilters}
          resultCount={data?.total}
        />

        <section aria-label="Results" className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setFiltersOpen(true)}
                className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-sm font-medium text-neutral-700 lg:hidden"
              >
                <SlidersHorizontal size={16} aria-hidden />
                Filters
                {filtered && (
                  <span className="rounded-full bg-brand-start px-1.5 text-xs text-white">
                    {chips.length}
                  </span>
                )}
              </button>
              <p aria-live="polite" className="text-sm text-neutral-600">
                {data &&
                  `Showing ${data.items.length} of ${data.total} products`}
                {data && filter.searchTerm && (
                  <> for &ldquo;{filter.searchTerm}&rdquo;</>
                )}
              </p>
            </div>
            <label className="flex items-center gap-2 text-sm text-neutral-600">
              Sort by
              <select
                value={filter.sort ?? 'newest'}
                onChange={(event) =>
                  update({
                    sort:
                      event.target.value === 'newest' ? '' : event.target.value,
                  })
                }
                className="h-10 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-800 focus:border-brand-start focus:ring-2 focus:ring-brand-start/20 focus:outline-none"
              >
                {PRODUCT_SORTS.map((sort) => (
                  <option key={sort.id} value={sort.id}>
                    {sort.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {filtered && (
            <ul aria-label="Active filters" className="flex flex-wrap gap-2">
              {chips.map((chip) => (
                <li key={chip.label}>
                  <button
                    type="button"
                    onClick={() => update(chip.remove)}
                    aria-label={`Remove filter ${chip.label}`}
                    className="inline-flex items-center gap-1.5 rounded-full bg-brand-start/10 px-3 py-1 text-sm font-medium text-brand-start transition hover:bg-brand-start/20"
                  >
                    {chip.label}
                    <X size={14} aria-hidden />
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={clearAll}
                  className="px-2 py-1 text-sm font-medium text-neutral-600 underline-offset-2 hover:text-brand-start hover:underline"
                >
                  Clear all
                </button>
              </li>
            </ul>
          )}

          {isPending ? (
            <SkeletonGrid />
          ) : error ? (
            <div className="flex flex-col items-center rounded-xl border border-neutral-200 bg-white px-6 py-16 text-center">
              <PackageSearch size={30} className="mb-4 text-brand-start" />
              <h2 className="font-poppins text-xl font-semibold text-neutral-900">
                Couldn’t load products
              </h2>
              <p className="mt-2 max-w-sm text-neutral-500">
                {error instanceof Error
                  ? error.message
                  : 'Something went wrong. Please try again.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-6 rounded-md bg-brand-start px-6 py-3 font-medium text-white transition hover:bg-brand-end"
              >
                Try again
              </button>
            </div>
          ) : data.items.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-neutral-200 bg-white px-6 py-16 text-center">
              <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
                <SearchX size={30} />
              </span>
              <h2 className="font-poppins text-xl font-semibold text-neutral-900">
                {filtered
                  ? 'No products match these filters'
                  : 'No products yet'}
              </h2>
              <p className="mt-2 max-w-sm text-neutral-500">
                {filtered
                  ? 'Try a wider price range, another colour or fewer filters.'
                  : 'Shops are adding listings every day. Check back soon.'}
              </p>
              {filtered && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="mt-6 rounded-md bg-brand-start px-6 py-3 font-medium text-white transition hover:bg-brand-end"
                >
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div
                aria-busy={isPlaceholderData}
                className={`transition-opacity ${isPlaceholderData ? 'opacity-60' : ''}`}
              >
                <ProductGrid
                  products={data.items}
                  onProductSelect={(product) =>
                    router.push(`/products/${product.id}`)
                  }
                  isWishlisted={isWishlisted}
                  onToggleWishlist={toggleWishlist}
                />
              </div>
              <Pagination
                page={Math.min(page, Math.max(data.totalPages, 1))}
                totalPages={data.totalPages}
                onPageChange={(next) => update({ page: String(next) })}
                label="Product pages"
              />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
