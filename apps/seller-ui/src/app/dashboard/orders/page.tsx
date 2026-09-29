'use client';

import { useState } from 'react';
import { ListOrdered, Search } from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  Panel,
  inputClassName,
} from '../../shared/dashboard/ui';

const STATUSES = [
  'All',
  'Pending',
  'Processing',
  'Shipped',
  'Delivered',
  'Cancelled',
] as const;

const COLUMNS = ['Order', 'Customer', 'Date', 'Items', 'Total', 'Status'];

export default function OrdersPage() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All');

  return (
    <>
      <PageHeader
        title="Orders"
        description="Track and fulfil the orders placed with your shop."
      />

      <Panel>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div
            role="group"
            aria-label="Order status"
            className="flex flex-wrap gap-2"
          >
            {STATUSES.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={status === option}
                onClick={() => setStatus(option)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                  status === option
                    ? 'bg-blue-600 text-white'
                    : 'bg-neutral-50 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/[0.08] hover:text-neutral-800'
                }`}
              >
                {option}
              </button>
            ))}
          </div>
          <label className="relative w-full sm:w-64">
            <span className="sr-only">Search orders</span>
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              placeholder="Search by order or customer"
              className={`${inputClassName} pl-9`}
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-xs uppercase tracking-wide text-neutral-500">
                {COLUMNS.map((column) => (
                  <th
                    key={column}
                    scope="col"
                    className="px-3 py-3 font-medium"
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>

        <div className="mt-4">
          <EmptyState
            icon={ListOrdered}
            title={
              status === 'All'
                ? 'No orders yet'
                : `No ${status.toLowerCase()} orders`
            }
            description="Orders from shoppers will appear here with their status, so you can pack, ship and track them."
            action={{
              label: 'Add a product',
              href: '/dashboard/create-product',
            }}
          />
        </div>
      </Panel>
    </>
  );
}
