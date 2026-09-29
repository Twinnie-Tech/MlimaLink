'use client';

import { useState } from 'react';
import { Package } from 'lucide-react';
import { EmptyState, PageHeader, Panel } from '../../../shared/dashboard/ui';

const STATUSES = ['All', 'Processing', 'Shipped', 'Delivered', 'Cancelled'] as const;

export default function OrdersPage() {
  const [status, setStatus] = useState<(typeof STATUSES)[number]>('All');

  return (
    <>
      <PageHeader title="My Orders" description="Track deliveries and look back at past purchases." />

      <Panel>
        <div role="group" aria-label="Order status" className="mb-5 flex flex-wrap gap-2">
          {STATUSES.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={status === option}
              onClick={() => setStatus(option)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                status === option
                  ? 'bg-brand-start text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <EmptyState
          icon={Package}
          title={status === 'All' ? 'No orders yet' : `No ${status.toLowerCase()} orders`}
          description="Orders you place will appear here with their delivery status."
          action={{ label: 'Start shopping', href: '/products' }}
        />
      </Panel>
    </>
  );
}
