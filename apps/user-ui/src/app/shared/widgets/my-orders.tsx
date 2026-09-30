'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  Loader2,
  MapPin,
  MessageCircle,
  Package,
  Phone,
} from 'lucide-react';
import type { Order, OrderStatus } from '@org/models';
import { describeChoices, formatPrice, sizedImage } from '@org/models/catalog';
import {
  deliveryStatusLabel,
  mapsLink,
  orderStatusLabel,
  vehicleLabel,
} from '@org/models/delivery';
import {
  EmptyState,
  formatDate,
  secondaryButtonClassName,
} from '../dashboard/ui';
import { AuthRequestError } from '../utils/auth-api';
import {
  MY_ORDERS_KEY,
  cancelMyOrder,
  listMyOrders,
} from '../utils/orders-api';
import { DeliveryTimeline, formatDateTime } from './delivery-timeline';

const STATUS_TONE: Record<OrderStatus, string> = {
  placed: 'bg-brand-start/10 text-brand-start',
  confirmed: 'bg-sky-50 text-sky-700',
  out_for_delivery: 'bg-amber-50 text-amber-700',
  delivered: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-neutral-100 text-neutral-500',
};

const ACTIVE: OrderStatus[] = ['placed', 'confirmed', 'out_for_delivery'];

/** How often open orders are checked for delivery updates. */
const POLL_MS = 30_000;

export const whatsappLink = (phone: string) =>
  `https://wa.me/${phone.replace(/\D/g, '')}`;

/** The shopper's orders, newest first; polled while any is still on its way. */
export function useMyOrders() {
  const query = useQuery({
    queryKey: MY_ORDERS_KEY,
    queryFn: listMyOrders,
    retry: false,
    refetchInterval: (current) =>
      current.state.data?.some((order) => ACTIVE.includes(order.status))
        ? POLL_MS
        : false,
  });
  // The api answers 404 before it's restarted with orders; treat that as no orders yet.
  const missing =
    query.error instanceof AuthRequestError && query.error.status === 404;
  return { ...query, missing };
}

export function MyOrders({
  status,
  limit,
  compact = false,
}: {
  status?: OrderStatus;
  limit?: number;
  compact?: boolean;
}) {
  const { data, isPending, error, missing } = useMyOrders();

  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Loading your orders"
        className="flex justify-center py-8"
      >
        <Loader2 className="animate-spin text-brand-start" size={24} />
      </div>
    );
  }

  if (error && !missing) {
    return (
      <p role="alert" className="text-sm text-rose-600">
        {error instanceof Error ? error.message : 'Couldn’t load your orders.'}
      </p>
    );
  }

  const orders = (data ?? []).filter(
    (order) => !status || order.status === status,
  );

  if (orders.length === 0) {
    return (
      <EmptyState
        icon={Package}
        title={
          status
            ? `No ${orderStatusLabel(status).toLowerCase()} orders`
            : 'No orders yet'
        }
        description="Orders you place will appear here with their delivery status."
        action={{ label: 'Start shopping', href: '/products' }}
      />
    );
  }

  const shown = limit ? orders.slice(0, limit) : orders;

  return compact ? (
    <ul className="divide-y divide-neutral-200" aria-label="Recent orders">
      {shown.map((order) => (
        <li
          key={order.id}
          className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
        >
          <div className="min-w-0">
            <p className="font-medium text-neutral-900">
              {order.number} · {order.shopName}
            </p>
            <p className="text-xs text-neutral-500">
              {formatDate(order.createdAt)} · {formatPrice(order.total)}
            </p>
          </div>
          <StatusPill order={order} />
        </li>
      ))}
    </ul>
  ) : (
    <ul className="space-y-5" aria-label="Your orders">
      {shown.map((order) => (
        <li key={order.id}>
          <OrderCard order={order} />
        </li>
      ))}
    </ul>
  );
}

function StatusPill({ order }: { order: Order }) {
  const label =
    order.status === 'confirmed' && order.delivery
      ? deliveryStatusLabel(order.delivery.status)
      : orderStatusLabel(order.status);
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[order.status]}`}
    >
      {label}
    </span>
  );
}

export function OrderCard({ order }: { order: Order }) {
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const cancel = useMutation({
    mutationFn: () => cancelMyOrder(order.id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: MY_ORDERS_KEY }),
  });
  const delivery = order.delivery;
  const rider = delivery?.rider;
  const showCode =
    order.deliveryCode &&
    (order.status === 'confirmed' || order.status === 'out_for_delivery');

  return (
    <article
      aria-label={`Order ${order.number}`}
      className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm"
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-poppins font-semibold text-neutral-900">
            {order.number}
          </h3>
          <p className="text-xs text-neutral-500">
            {order.shopName} · placed {formatDate(order.createdAt)}
          </p>
        </div>
        <StatusPill order={order} />
      </header>

      <ul className="mt-4 space-y-3">
        {order.items.map((item, index) => (
          <li key={index} className="flex items-center gap-3 text-sm">
            {item.imageUrl && (
              <img
                src={sizedImage(item.imageUrl, 96)}
                alt=""
                className="h-12 w-12 shrink-0 rounded-md object-cover"
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="font-medium text-neutral-800">{item.name}</p>
              <p className="text-xs text-neutral-500">
                {item.quantity} × {formatPrice(item.unitPrice)}
                {item.choices && ` · ${describeChoices(item.choices)}`}
              </p>
            </div>
            <span className="text-neutral-700">
              {formatPrice(item.total - item.discount)}
            </span>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid gap-x-6 gap-y-1 border-t border-neutral-200 pt-3 text-sm text-neutral-600 sm:grid-cols-2">
        <div className="flex justify-between">
          <dt>Delivery</dt>
          <dd>{formatPrice(order.deliveryFee)}</dd>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-emerald-700">
            <dt>Discount</dt>
            <dd>−{formatPrice(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between font-semibold text-neutral-900">
          <dt>Total</dt>
          <dd>{formatPrice(order.total)}</dd>
        </div>
        {order.onDelivery > 0 && (
          <div className="flex justify-between">
            <dt>Pay on delivery</dt>
            <dd>{formatPrice(order.onDelivery)}</dd>
          </div>
        )}
      </dl>

      <p className="mt-3 flex items-start gap-2 text-sm text-neutral-600">
        <MapPin size={16} className="mt-0.5 shrink-0 text-neutral-400" />
        <span>
          {order.address.recipientName}, {order.address.area},{' '}
          {order.address.zone}
          {order.address.street && ` · ${order.address.street}`}
        </span>
      </p>

      {showCode && (
        <div className="mt-4 rounded-lg border border-brand-start/30 bg-brand-start/5 px-4 py-3">
          <p className="text-xs uppercase tracking-wide text-neutral-500">
            Delivery code
          </p>
          <p
            className="font-poppins text-2xl font-semibold tracking-[0.3em] text-brand-start"
            data-testid={`delivery-code-${order.number}`}
          >
            {order.deliveryCode}
          </p>
          <p className="text-xs text-neutral-500">
            Give this to the rider only once you have your order.
          </p>
        </div>
      )}

      {order.status === 'placed' && (
        <p className="mt-4 text-sm text-neutral-500">
          Waiting for {order.shopName} to confirm your order.
        </p>
      )}

      {delivery && order.status !== 'cancelled' && (
        <section
          aria-label="Delivery"
          className="mt-4 space-y-3 rounded-lg bg-neutral-50 px-4 py-3"
        >
          {rider ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="flex items-center gap-2 text-sm text-neutral-700">
                <Bike size={16} className="text-brand-start" />
                <span>
                  <span className="font-medium">{rider.name}</span>
                  {rider.vehicle && ` · ${vehicleLabel(rider.vehicle)}`}
                </span>
              </p>
              {order.status !== 'delivered' && (
                <div className="flex gap-2">
                  <a
                    href={`tel:${rider.phone}`}
                    className={secondaryButtonClassName}
                    aria-label={`Call ${rider.name}`}
                  >
                    <Phone size={14} /> Call
                  </a>
                  <a
                    href={whatsappLink(rider.phone)}
                    target="_blank"
                    rel="noreferrer"
                    className={secondaryButtonClassName}
                    aria-label={`WhatsApp ${rider.name}`}
                  >
                    <MessageCircle size={14} /> WhatsApp
                  </a>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-neutral-600">
              {order.shopName} is finding a rider for your order.
            </p>
          )}
          {delivery.lastLocation && (
            <a
              href={mapsLink(delivery.lastLocation)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-start hover:text-brand-end"
            >
              <MapPin size={14} /> See where the rider is (updated{' '}
              {formatDateTime(delivery.lastLocation.at)})
            </a>
          )}
          <DeliveryTimeline events={delivery.events} />
        </section>
      )}

      {order.status === 'placed' && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {confirming ? (
            <>
              <span className="text-sm text-neutral-700">
                Cancel this order?
              </span>
              <button
                type="button"
                onClick={() => cancel.mutate()}
                disabled={cancel.isPending}
                className="rounded-lg bg-rose-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-rose-700 disabled:opacity-60"
              >
                {cancel.isPending ? 'Cancelling…' : 'Yes, cancel'}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className={secondaryButtonClassName}
              >
                Keep it
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-sm font-medium text-rose-600 hover:text-rose-700"
            >
              Cancel order
            </button>
          )}
          {cancel.error && (
            <p role="alert" className="w-full text-sm text-rose-600">
              {cancel.error instanceof Error
                ? cancel.error.message
                : 'Couldn’t cancel this order.'}
            </p>
          )}
        </div>
      )}
    </article>
  );
}
