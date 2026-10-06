'use client';

import { useEffect, useRef, type FormEvent, type ReactNode } from 'react';
import { Check, Star, X } from 'lucide-react';
import type { ProductFacets, ProductFilter } from '@org/models';
import { formatPrice } from '@org/models/catalog';

export const PRICE_PRESETS: { label: string; min?: number; max?: number }[] = [
  { label: `Under ${formatPrice(25)}`, max: 25 },
  { label: `${formatPrice(25)} – ${formatPrice(50)}`, min: 25, max: 50 },
  { label: `${formatPrice(50)} – ${formatPrice(100)}`, min: 50, max: 100 },
  { label: `${formatPrice(100)} – ${formatPrice(250)}`, min: 100, max: 250 },
  { label: `${formatPrice(250)} & above`, min: 250 },
];

export const RATING_OPTIONS = [4, 3, 2];

/** URL changes the filters ask for; an empty string removes a parameter. */
export type FilterChanges = Partial<
  Record<
    | 'category'
    | 'sub'
    | 'minPrice'
    | 'maxPrice'
    | 'colors'
    | 'sizes'
    | 'rating'
    | 'sale'
    | 'inStock',
    string
  >
>;

const chipClassName =
  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition';
const chipState = (active: boolean) =>
  active
    ? 'border-brand-start bg-brand-start/10 font-medium text-brand-start'
    : 'border-neutral-300 bg-white text-neutral-700 hover:border-brand-start hover:text-brand-start';

const fieldClassName =
  'h-10 w-full rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-800 focus:border-brand-start focus:ring-2 focus:ring-brand-start/20 focus:outline-none';

const toggle = (list: string[] = [], value: string) =>
  list.some((item) => item.toLowerCase() === value.toLowerCase())
    ? list.filter((item) => item.toLowerCase() !== value.toLowerCase())
    : [...list, value];

const has = (list: string[] = [], value: string) =>
  list.some((item) => item.toLowerCase() === value.toLowerCase());

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="border-t border-neutral-200 pt-5 first:border-t-0 first:pt-0">
      <legend className="mb-3 font-poppins text-sm font-semibold text-neutral-900">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function PriceFilter({
  filter,
  facets,
  onChange,
}: {
  filter: ProductFilter;
  facets?: ProductFacets;
  onChange: (changes: FilterChanges) => void;
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (name: string) => {
      const value = Number(form.get(name));
      return form.get(name) !== '' && Number.isFinite(value) && value >= 0
        ? value
        : undefined;
    };
    let min = read('minPrice');
    let max = read('maxPrice');
    if (min !== undefined && max !== undefined && min > max) {
      [min, max] = [max, min];
    }
    onChange({
      minPrice: min === undefined ? '' : String(min),
      maxPrice: max === undefined ? '' : String(max),
    });
  };

  return (
    <Section title="Price">
      <ul className="mb-3 space-y-1.5">
        {PRICE_PRESETS.map((preset) => {
          const active =
            filter.minPrice === preset.min && filter.maxPrice === preset.max;
          return (
            <li key={preset.label}>
              <button
                type="button"
                aria-pressed={active}
                onClick={() =>
                  onChange(
                    active
                      ? { minPrice: '', maxPrice: '' }
                      : {
                          minPrice: preset.min?.toString() ?? '',
                          maxPrice: preset.max?.toString() ?? '',
                        },
                  )
                }
                className={`w-full rounded-md px-2 py-1 text-left text-sm transition ${
                  active
                    ? 'bg-brand-start/10 font-medium text-brand-start'
                    : 'text-neutral-700 hover:bg-neutral-100'
                }`}
              >
                {preset.label}
              </button>
            </li>
          );
        })}
      </ul>
      <form
        key={`${filter.minPrice ?? ''}-${filter.maxPrice ?? ''}`}
        onSubmit={submit}
        className="flex items-end gap-2"
        aria-label="Custom price range"
      >
        <label className="flex-1 text-xs text-neutral-600">
          Min
          <input
            name="minPrice"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            defaultValue={filter.minPrice ?? ''}
            placeholder={facets ? String(facets.minPrice) : '0'}
            className={`${fieldClassName} mt-1`}
          />
        </label>
        <label className="flex-1 text-xs text-neutral-600">
          Max
          <input
            name="maxPrice"
            type="number"
            min={0}
            step="any"
            inputMode="decimal"
            defaultValue={filter.maxPrice ?? ''}
            placeholder={facets?.maxPrice ? String(facets.maxPrice) : 'Any'}
            className={`${fieldClassName} mt-1`}
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-lg bg-brand-start px-3 text-sm font-medium text-white transition hover:bg-brand-end"
        >
          Go
        </button>
      </form>
    </Section>
  );
}

/** Category, availability, price, rating, colour and size filters. A drawer on small screens. */
export function ProductFilters({
  filter,
  facets,
  onChange,
  open,
  onClose,
  resultCount,
}: {
  filter: ProductFilter;
  facets?: ProductFacets;
  onChange: (changes: FilterChanges) => void;
  /** Whether the drawer is showing on small screens; the sidebar always shows on large ones. */
  open: boolean;
  onClose: () => void;
  resultCount?: number;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  const categories = facets?.categories ?? [];
  const categoryOptions =
    filter.category && !categories.includes(filter.category)
      ? [filter.category, ...categories]
      : categories;
  const subCategories = facets?.subCategories ?? [];
  const colours = facets?.colors ?? [];
  const sizes = facets?.sizes ?? [];

  return (
    <aside
      aria-label="Product filters"
      className={`${open ? 'fixed inset-0 z-50 flex' : 'hidden'} lg:static lg:z-auto lg:block`}
    >
      {open && (
        <div
          aria-hidden
          onClick={onClose}
          className="absolute inset-0 bg-black/40 lg:hidden"
        />
      )}
      <div className="relative ml-auto flex h-full w-80 max-w-[85%] flex-col bg-white shadow-xl lg:h-auto lg:w-auto lg:max-w-none lg:rounded-2xl lg:border lg:border-neutral-200 lg:shadow-sm">
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-4 lg:hidden">
          <p className="font-poppins font-semibold text-neutral-900">Filters</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className="rounded-full p-1.5 text-neutral-600 hover:bg-neutral-100"
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          <Section title="Category">
            <select
              aria-label="Filter by category"
              value={filter.category ?? ''}
              onChange={(event) =>
                onChange({ category: event.target.value, sub: '' })
              }
              className={fieldClassName}
            >
              <option value="">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            {filter.category && subCategories.length > 0 && (
              <ul className="mt-3 space-y-1">
                {subCategories.map((sub) => {
                  const active = filter.subCategory === sub;
                  return (
                    <li key={sub}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => onChange({ sub: active ? '' : sub })}
                        className={`flex w-full items-center justify-between rounded-md px-2 py-1 text-left text-sm transition ${
                          active
                            ? 'bg-brand-start/10 font-medium text-brand-start'
                            : 'text-neutral-700 hover:bg-neutral-100'
                        }`}
                      >
                        {sub}
                        {active && <Check size={14} aria-hidden />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title="Availability">
            <div className="space-y-2.5 text-sm text-neutral-700">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={filter.inStock === true}
                  onChange={(event) =>
                    onChange({ inStock: event.target.checked ? '1' : '' })
                  }
                  className="h-4 w-4 accent-brand-start"
                />
                In stock only
              </label>
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={filter.onSale === true}
                  onChange={(event) =>
                    onChange({ sale: event.target.checked ? '1' : '' })
                  }
                  className="h-4 w-4 accent-brand-start"
                />
                On sale
              </label>
            </div>
          </Section>

          <PriceFilter filter={filter} facets={facets} onChange={onChange} />

          <Section title="Customer rating">
            <ul className="space-y-1.5">
              {RATING_OPTIONS.map((rating) => {
                const active = filter.minRating === rating;
                return (
                  <li key={rating}>
                    <button
                      type="button"
                      aria-pressed={active}
                      aria-label={`${rating} stars and up`}
                      onClick={() =>
                        onChange({ rating: active ? '' : String(rating) })
                      }
                      className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm transition ${
                        active
                          ? 'bg-brand-start/10 font-medium text-brand-start'
                          : 'text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      <span className="flex" aria-hidden>
                        {[1, 2, 3, 4, 5].map((star) => (
                          <Star
                            key={star}
                            size={14}
                            className={
                              star <= rating
                                ? 'fill-amber-400 text-amber-400'
                                : 'text-neutral-300'
                            }
                          />
                        ))}
                      </span>
                      & up
                    </button>
                  </li>
                );
              })}
            </ul>
          </Section>

          {colours.length > 0 && (
            <Section title="Colour">
              <ul className="flex flex-wrap gap-2">
                {colours.map(({ label, swatch }) => {
                  const active = has(filter.colors, label);
                  return (
                    <li key={label}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onChange({
                            colors: toggle(filter.colors, label).join(','),
                          })
                        }
                        className={`${chipClassName} ${chipState(active)}`}
                      >
                        <span
                          aria-hidden
                          className="h-3.5 w-3.5 rounded-full bg-neutral-200 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.2)]"
                          style={{ background: swatch ?? label.toLowerCase() }}
                        />
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          {sizes.length > 0 && (
            <Section title="Size">
              <ul className="flex flex-wrap gap-2">
                {sizes.map((size) => {
                  const active = has(filter.sizes, size);
                  return (
                    <li key={size}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          onChange({
                            sizes: toggle(filter.sizes, size).join(','),
                          })
                        }
                        className={`min-w-11 justify-center ${chipClassName} ${chipState(active)}`}
                      >
                        {size}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}
        </div>

        <div className="border-t border-neutral-200 p-4 lg:hidden">
          <button
            type="button"
            onClick={onClose}
            className="h-11 w-full rounded-lg bg-brand-start text-sm font-medium text-white transition hover:bg-brand-end"
          >
            {resultCount === undefined
              ? 'Show results'
              : `Show ${resultCount} ${resultCount === 1 ? 'result' : 'results'}`}
          </button>
        </div>
      </div>
    </aside>
  );
}
