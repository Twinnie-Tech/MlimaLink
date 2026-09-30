'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CloudOff,
  ListOrdered,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';
import type { Order, OrderStatus } from '@org/models';
import { ORDER_STATUSES } from '@org/models/delivery';
import { DeliverySettingsPanel } from '../../shared/dashboard/delivery-settings-panel';
import { SellerOrderCard } from '../../shared/dashboard/order-card';
import {
  EmptyState,
  PageHeader,
  Panel,
  inputClassName,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';
import { AuthRequestError } from '../../shared/utils/seller-api';
import { SHOP_ORDERS_KEY, listShopOrders } from '../../shared/utils/orders-api';

/** How often open orders are checked for rider updates. */
const POLL_MS = 30_000;

type Filter = OrderStatus | 'all';

const isMissingRoute = (error: unknown) =>
  error instanceof AuthRequestError && error.status === 404;

export default function OrdersPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const { data, isPending, error, refetch, isRefetching } = useQuery({
    queryKey: SHOP_ORDERS_KEY,
    queryFn: listShopOrders,
    retry: (failures, failure) =>
      !(
        failure instanceof AuthRequestError &&
        failure.status >= 400 &&
        failure.status < 500
      ) && failures < 2,
    refetchInterval: (query) =>
      query.state.data?.some(
        (order) =>
          order.status === 'confirmed' || order.status === 'out_for_delivery',
      )
        ? POLL_MS
        : false,
  });
  const orders = isMissingRoute(error) ? [] : data;
  const loadError = isMissingRoute(error) ? null : error;

  const counts = new Map<Filter, number>([['all', orders?.length ?? 0]]);
  for (const order of orders ?? []) {
    counts.set(order.status, (counts.get(order.status) ?? 0) + 1);
  }
  const term = search.trim().toLowerCase();
  const shown = (orders ?? []).filter(
    (order) =>
      (filter === 'all' || order.status === filter) &&
      (!term ||
        order.number.toLowerCase().includes(term) ||
        order.buyerName.toLowerCase().includes(term)),
  );

  const replace = (next: Order, note?: string) => {
    queryClient.setQueryData<Order[]>(SHOP_ORDERS_KEY, (current) =>
      current?.map((order) => (order.id === next.id ? next : order)),
    );
    setMessage(note ?? null);
  };

  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'All' },
    ...ORDER_STATUSES,
  ];

  return (
    <>
      <PageHeader
        title="Orders"
        description="Confirm new orders, then get a rider to deliver them. Shoppers are emailed at every step."
        actions={
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isRefetching}
            className={secondaryButtonClassName}
          >
            <RefreshCw
              size={15}
              className={isRefetching ? 'animate-spin' : undefined}
            />
            Refresh
          </button>
        }
      />

      <div className="space-y-6">
        <DeliverySettingsPanel />

        <Panel>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
            <div
              role="tablist"
              aria-label="Filter orders"
              className="flex flex-wrap gap-2"
            >
              {filters.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="tab"
                  aria-selected={filter === option.id}
                  onClick={() => setFilter(option.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    filter === option.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:hover:bg-white/10'
                  }`}
                >
                  {option.label} ({counts.get(option.id) ?? 0})
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
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by order or customer"
                className={`${inputClassName} pl-9`}
              />
            </label>
          </div>

          {message && (
            <p
              role="status"
              className="mb-4 rounded-lg bg-emerald-500/10 px-4 py-2.5 text-sm text-emerald-700 dark:text-emerald-400"
            >
              {message}
            </p>
          )}

          {isPending ? (
            <div
              role="status"
              aria-label="Loading your orders"
              className="flex justify-center py-14"
            >
              <Loader2 className="animate-spin text-blue-600" size={28} />
            </div>
          ) : loadError ? (
            <div
              role="alert"
              className="flex flex-col items-center px-6 py-12 text-center"
            >
              <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400">
                <CloudOff size={22} />
              </span>
              <p className="font-poppins font-semibold text-neutral-900">
                Couldn&apos;t load your orders
              </p>
              <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
                {loadError instanceof AuthRequestError
                  ? loadError.message
                  : 'Something went wrong while loading your orders.'}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isRefetching}
                className={`${secondaryButtonClassName} mt-5`}
              >
                {isRefetching ? 'Trying again…' : 'Try again'}
              </button>
            </div>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={ListOrdered}
              title={orders?.length ? 'No matching orders' : 'No orders yet'}
              description={
                orders?.length
                  ? 'Pick another tab or clear the search to see the rest of your orders.'
                  : 'Orders from shoppers appear here. Confirm each one, then get a rider to deliver it.'
              }
              action={
                orders?.length
                  ? undefined
                  : {
                      label: 'Add a product',
                      href: '/dashboard/create-product',
                    }
              }
            />
          ) : (
            <ul className="divide-y divide-neutral-200" aria-label="Orders">
              {shown.map((order) => (
                <SellerOrderCard
                  key={order.id}
                  order={order}
                  onUpdated={replace}
                />
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </>
  );
}
