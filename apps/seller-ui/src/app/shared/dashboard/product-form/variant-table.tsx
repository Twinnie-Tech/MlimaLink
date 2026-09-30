'use client';

import { useState } from 'react';
import type { ProductOption } from '@org/models';
import { variantLabel } from '@org/models/catalog';
import { inputClassName } from '../ui';

/** What the seller typed for one combination; checked on submit. */
export type VariantDraft = { price: string; stock: string; sku: string };

export const EMPTY_VARIANT: VariantDraft = { price: '', stock: '', sku: '' };

const cellInput = `${inputClassName} px-2.5 py-1.5`;

export function VariantTable({
  options,
  combinations,
  rows,
  errors,
  basePrice,
  onChange,
}: {
  options: ProductOption[];
  combinations: Record<string, string>[];
  rows: Record<string, VariantDraft>;
  errors: Record<string, string>;
  basePrice: string;
  onChange: (rows: Record<string, VariantDraft>) => void;
}) {
  const [bulkStock, setBulkStock] = useState('');
  const [bulkPrice, setBulkPrice] = useState('');

  const labels = combinations.map((choices) => variantLabel(choices, options));
  const rowFor = (label: string) => rows[label] ?? EMPTY_VARIANT;
  const update = (label: string, field: keyof VariantDraft, value: string) =>
    onChange({ ...rows, [label]: { ...rowFor(label), [field]: value } });

  const applyToAll = () => {
    const next = { ...rows };
    for (const label of labels) {
      next[label] = {
        ...rowFor(label),
        ...(bulkStock !== '' && { stock: bulkStock }),
        ...(bulkPrice !== '' && { price: bulkPrice }),
      };
    }
    onChange(next);
  };

  const totalUnits = labels.reduce((sum, label) => {
    const stock = Number(rowFor(label).stock);
    return Number.isInteger(stock) && stock > 0 ? sum + stock : sum;
  }, 0);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-3 rounded-lg bg-neutral-50 p-3">
        <label className="text-xs font-medium text-neutral-600">
          Stock for all
          <input
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            value={bulkStock}
            onChange={(event) => setBulkStock(event.target.value)}
            placeholder="e.g. 10"
            className={`${cellInput} mt-1 w-28`}
          />
        </label>
        <label className="text-xs font-medium text-neutral-600">
          Price for all
          <input
            type="number"
            min="0"
            step="0.01"
            inputMode="decimal"
            value={bulkPrice}
            onChange={(event) => setBulkPrice(event.target.value)}
            placeholder={basePrice || '0.00'}
            className={`${cellInput} mt-1 w-28`}
          />
        </label>
        <button
          type="button"
          onClick={applyToAll}
          disabled={bulkStock === '' && bulkPrice === ''}
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-neutral-800 hover:bg-neutral-100 disabled:opacity-50 dark:hover:bg-white/5"
        >
          Apply to all {labels.length}
        </button>
        <p className="ml-auto text-xs text-neutral-500">
          {totalUnits} units in stock
        </p>
      </div>

      <div className="scrollbar-thin max-h-[420px] overflow-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="sticky top-0 z-10 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
            <tr>
              {options.map((option) => (
                <th
                  key={option.name}
                  scope="col"
                  className="px-3 py-2 font-medium"
                >
                  {option.name}
                </th>
              ))}
              <th scope="col" className="px-3 py-2 font-medium">
                Price
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                Stock
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                SKU
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200">
            {combinations.map((choices, index) => {
              const label = labels[index];
              const row = rowFor(label);
              const error = errors[label];
              return (
                <tr key={label} className={error ? 'bg-rose-500/5' : undefined}>
                  {options.map((option) => (
                    <td
                      key={option.name}
                      className="px-3 py-2 text-neutral-800"
                    >
                      {choices[option.name]}
                    </td>
                  ))}
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={row.price}
                      onChange={(event) =>
                        update(label, 'price', event.target.value)
                      }
                      placeholder={basePrice || '0.00'}
                      aria-label={`${label} price`}
                      className={`${cellInput} w-24`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      step="1"
                      inputMode="numeric"
                      value={row.stock}
                      onChange={(event) =>
                        update(label, 'stock', event.target.value)
                      }
                      placeholder="0"
                      aria-label={`${label} stock`}
                      aria-invalid={Boolean(error)}
                      title={error}
                      className={`${cellInput} w-20`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <input
                      value={row.sku}
                      onChange={(event) =>
                        update(label, 'sku', event.target.value)
                      }
                      maxLength={40}
                      placeholder="Optional"
                      aria-label={`${label} SKU`}
                      className={`${cellInput} w-28`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Leave a price empty to use the product price. Set stock to 0 for
        combinations you don&apos;t have; shoppers will see them as sold out.
      </p>
    </div>
  );
}
