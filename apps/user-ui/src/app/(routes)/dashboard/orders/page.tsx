'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import type { OrderStatus } from '@org/models';
import { ORDER_STATUSES } from '@org/models/delivery';
import { PageHeader, Panel } from '../../../shared/dashboard/ui';
import { MyOrders } from '../../../shared/widgets/my-orders';

function PlacedNotice() {
  const placed = useSearchParams().get('placed');
  if (!placed) return null;
  const numbers = placed.split(',').filter(Boolean);
  return (
    <p
      role="status"
      className="mb-6 flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
    >
      <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600" />
      <span>
        Thanks! We&apos;ve sent{' '}
        {numbers.length > 1
          ? `orders ${numbers.join(', ')}`
          : `order ${placed}`}{' '}
        to the {numbers.length > 1 ? 'shops' : 'shop'}. You&apos;ll get an email
        when it&apos;s confirmed and when a rider is on the way.
      </span>
    </p>
  );
}

export default function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | 'all'>('all');
  const tabs = [{ id: 'all' as const, label: 'All' }, ...ORDER_STATUSES];

  return (
    <>
      <PageHeader
        title="My Orders"
        description="Track deliveries and look back at past purchases."
      />

      <Suspense>
        <PlacedNotice />
      </Suspense>

      <Panel>
        <div
          role="group"
          aria-label="Order status"
          className="mb-5 flex flex-wrap gap-2"
        >
          {tabs.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={status === option.id}
              onClick={() => setStatus(option.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                status === option.id
                  ? 'bg-brand-start text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <MyOrders status={status === 'all' ? undefined : status} />
      </Panel>
    </>
  );
}
