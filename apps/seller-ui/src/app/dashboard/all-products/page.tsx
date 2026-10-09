'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  PackageSearch,
  Search,
  SquarePlus,
  Trash2,
} from 'lucide-react';
import type { Product } from '@org/models';
import {
  PRODUCT_CATEGORIES,
  priceRange,
  sizedImage,
} from '@org/models/catalog';
import {
  EmptyState,
  PageHeader,
  Panel,
  formatMoney,
  inputClassName,
  primaryButtonClassName,
} from '../../shared/dashboard/ui';
import {
  MY_PRODUCTS_KEY as PRODUCTS_KEY,
  deleteProduct,
  listMyProducts,
} from '../../shared/utils/products-api';
import { AuthRequestError } from '../../shared/utils/seller-api';

const LOW_STOCK = 5;

type StockFilter = 'all' | 'in' | 'low' | 'out';

function stockStatus(stock: number) {
  if (stock === 0) {
    return { label: 'Out of stock', tone: 'bg-rose-500/10 text-rose-700' };
  }
  if (stock <= LOW_STOCK) {
    return { label: 'Low stock', tone: 'bg-amber-500/10 text-amber-800' };
  }
  return { label: 'In stock', tone: 'bg-emerald-500/10 text-emerald-700' };
}

function optionSummary(product: Product) {
  return (product.options ?? [])
    .map((option) => `${option.values.length} ${option.name.toLowerCase()}`)
    .join(' · ');
}

function priceText(product: Product) {
  const { min, max } = priceRange(product);
  return min === max
    ? formatMoney(min)
    : `${formatMoney(min)} – ${formatMoney(max)}`;
}

function matches(
  product: Product,
  search: string,
  category: string,
  stock: StockFilter,
) {
  const units = product.stock ?? 0;
  if (category && product.category !== category) return false;
  if (stock === 'in' && units === 0) return false;
  if (stock === 'low' && (units === 0 || units > LOW_STOCK)) return false;
  if (stock === 'out' && units !== 0) return false;
  const term = search.trim().toLowerCase();
  return (
    !term ||
    [product.name, product.subCategory, ...(product.tags ?? [])].some((text) =>
      text?.toLowerCase().includes(term),
    )
  );
}

export default function AllProductsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [stock, setStock] = useState<StockFilter>('all');
  const [confirming, setConfirming] = useState<string | null>(null);

  const {
    data: products,
    isPending,
    error,
  } = useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: listMyProducts,
  });

  const removeMutation = useMutation({
    mutationFn: deleteProduct,
    onSuccess: (_, id) => {
      setConfirming(null);
      queryClient.setQueryData<Product[]>(PRODUCTS_KEY, (current) =>
        current?.filter((product) => product.id !== id),
      );
    },
  });

  const visible = (products ?? []).filter((product) =>
    matches(product, search, category, stock),
  );

  return (
    <>
      <PageHeader
        title="All Products"
        description="Manage prices, stock and visibility for everything you sell."
        actions={
          <Link
            href="/dashboard/create-product"
            className={primaryButtonClassName}
          >
            <SquarePlus size={16} /> Create product
          </Link>
        }
      />

      <Panel>
        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px_160px]">
          <label className="relative">
            <span className="sr-only">Search products</span>
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search products"
              className={`${inputClassName} pl-9`}
            />
          </label>
          <label>
            <span className="sr-only">Filter by category</span>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={inputClassName}
            >
              <option value="">All categories</option>
              {PRODUCT_CATEGORIES.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by stock</span>
            <select
              value={stock}
              onChange={(event) => setStock(event.target.value as StockFilter)}
              className={inputClassName}
            >
              <option value="all">Any stock</option>
              <option value="in">In stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
          </label>
        </div>

        {removeMutation.error && (
          <p
            role="alert"
            className="mb-4 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700"
          >
            {removeMutation.error instanceof AuthRequestError
              ? removeMutation.error.message
              : 'Could not remove the product. Please try again.'}
          </p>
        )}

        {isPending ? (
          <div
            role="status"
            aria-label="Loading your products"
            className="flex justify-center py-14"
          >
            <Loader2 className="animate-spin text-blue-600" size={28} />
          </div>
        ) : error ? (
          <p role="alert" className="py-10 text-center text-sm text-rose-600">
            {error instanceof AuthRequestError
              ? error.message
              : 'Could not load your products.'}
          </p>
        ) : products.length === 0 ? (
          <EmptyState
            icon={PackageSearch}
            title="No products yet"
            description="Products you create will be listed here, with their price, stock and sales at a glance."
            action={{
              label: 'Create your first product',
              href: '/dashboard/create-product',
            }}
          />
        ) : visible.length === 0 ? (
          <p className="py-10 text-center text-sm text-neutral-500">
            No products match these filters.
          </p>
        ) : (
          <ul
            className="divide-y divide-neutral-200"
            aria-label="Your products"
          >
            {visible.map((product) => {
              const status = stockStatus(product.stock ?? 0);
              const summary = optionSummary(product);
              return (
                <li
                  key={product.id}
                  className="flex flex-wrap items-center gap-4 py-4 first:pt-0 last:pb-0"
                >
                  <img
                    src={sizedImage(product.imageUrl, 128)}
                    alt=""
                    loading="lazy"
                    className="h-16 w-16 shrink-0 rounded-lg border border-neutral-200 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-neutral-900">
                      {product.name}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {product.category} › {product.subCategory}
                    </p>
                    {summary && (
                      <p className="mt-0.5 text-xs text-neutral-500">
                        {summary} · {product.variants?.length} combinations
                      </p>
                    )}
                  </div>
                  <div className="w-36 text-right">
                    <p className="font-medium text-neutral-900">
                      {priceText(product)}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {product.stock ?? 0} in stock
                    </p>
                  </div>
                  <span
                    className={`w-24 rounded-full px-2.5 py-1 text-center text-xs font-medium ${status.tone}`}
                  >
                    {status.label}
                  </span>
                  {confirming === product.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => removeMutation.mutate(product.id)}
                        disabled={removeMutation.isPending}
                        className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500 disabled:opacity-60"
                      >
                        {removeMutation.isPending ? 'Removing…' : 'Remove'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirming(null)}
                        className="rounded-lg px-2 py-1.5 text-xs text-neutral-600 hover:bg-neutral-100 dark:hover:bg-white/5"
                      >
                        Keep
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirming(product.id)}
                      aria-label={`Remove ${product.name}`}
                      className="rounded-lg p-2 text-neutral-500 hover:bg-neutral-100 hover:text-rose-600 dark:hover:bg-white/5"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
