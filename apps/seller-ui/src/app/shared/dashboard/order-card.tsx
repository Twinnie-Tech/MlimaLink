'use client';

import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Bike, Loader2, MapPin, MessageCircle, Phone } from 'lucide-react';
import type { DeliveryEvent, Order, OrderStatus } from '@org/models';
import { describeChoices } from '@org/models/catalog';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import {
  ORDER_NOTE_MAX,
  canRequestDelivery,
  canSellerMoveOrder,
  deliveryStatusLabel,
  mapsLink,
  orderStatusLabel,
  vehicleLabel,
} from '@org/models/delivery';
import { AuthRequestError } from '../utils/seller-api';
import {
  listAvailableRiders,
  requestDelivery,
  updateShopOrder,
  withdrawDeliveryRequest,
} from '../utils/orders-api';
import {
  formatDate,
  formatMoney,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from './ui';

export const STATUS_TONE: Record<OrderStatus, string> = {
  placed: 'bg-blue-500/10 text-blue-700',
  confirmed: 'bg-sky-500/10 text-sky-700',
  out_for_delivery: 'bg-amber-500/10 text-amber-700',
  delivered: 'bg-emerald-500/10 text-emerald-700',
  cancelled: 'bg-neutral-500/10 text-neutral-600',
};

const chipClassName =
  'inline-flex items-center gap-1.5 rounded-lg border border-neutral-200 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 dark:hover:bg-white/5';

const whatsappLink = (phone: string) =>
  `https://wa.me/${phone.replace(/[^\d]/g, '')}`;

const dateTime = (iso: string) =>
  new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));

const errorText = (error: unknown, fallback: string) =>
  error instanceof AuthRequestError ? error.message : fallback;

function ContactChips({ phone, label }: { phone: string; label: string }) {
  return (
    <>
      <a
        href={`tel:${phone}`}
        className={chipClassName}
        aria-label={`Call ${label}`}
      >
        <Phone size={14} /> {phone}
      </a>
      <a
        href={whatsappLink(phone)}
        target="_blank"
        rel="noreferrer"
        className={chipClassName}
        aria-label={`WhatsApp ${label}`}
      >
        <MessageCircle size={14} /> WhatsApp
      </a>
    </>
  );
}

function Timeline({ events }: { events: DeliveryEvent[] }) {
  if (events.length === 0) return null;
  return (
    <ol
      aria-label="Delivery updates"
      className="space-y-1.5 border-l border-neutral-200 pl-4"
    >
      {[...events].reverse().map((event, index) => (
        <li key={`${event.at}-${index}`} className="relative text-sm">
          <span
            aria-hidden="true"
            className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${
              index === 0 ? 'bg-blue-600' : 'bg-neutral-300'
            }`}
          />
          <span className="font-medium text-neutral-800">
            {deliveryStatusLabel(event.status)}
          </span>{' '}
          <span className="text-xs text-neutral-500">{dateTime(event.at)}</span>
          {event.note && (
            <p className="text-xs text-neutral-500">{event.note}</p>
          )}
        </li>
      ))}
    </ol>
  );
}

/** Choose a rider in the shop's town, or post the job for the first taker. */
function RequestRider({
  order,
  onUpdated,
}: {
  order: Order;
  onUpdated: (next: Order, message?: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>('');
  const riders = useQuery({
    queryKey: ['seller-riders'],
    queryFn: listAvailableRiders,
    enabled: open,
    retry: false,
  });
  const send = useMutation({
    mutationFn: () => requestDelivery(order.id, choice || undefined),
    onSuccess: (response) => {
      setOpen(false);
      onUpdated(response.data, response.message);
    },
  });

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={primaryButtonClassName}
      >
        <Bike size={16} />
        {order.delivery?.status === 'declined'
          ? 'Find another rider'
          : 'Get a rider'}
      </button>
    );
  }

  return (
    <fieldset className="space-y-3 rounded-lg border border-neutral-200 p-4">
      <legend className="px-1 text-sm font-medium text-neutral-900">
        Who should deliver {order.number}?
      </legend>
      <label className="flex cursor-pointer items-start gap-3 text-sm">
        <input
          type="radio"
          name={`rider-${order.id}`}
          checked={choice === ''}
          onChange={() => setChoice('')}
          className="mt-1 accent-blue-600"
        />
        <span>
          <span className="block font-medium text-neutral-900">
            Post to all nearby riders
          </span>
          <span className="block text-xs text-neutral-500">
            Every available rider in your town is emailed; the first to accept
            gets it.
          </span>
        </span>
      </label>

      {riders.isPending ? (
        <div role="status" aria-label="Loading riders" className="py-2">
          <Loader2 className="animate-spin text-blue-600" size={18} />
        </div>
      ) : riders.error ? (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {errorText(riders.error, 'Couldn’t load riders.')}
        </p>
      ) : riders.data.length === 0 ? (
        <p className="text-sm text-neutral-500">
          No riders are online in your town right now. Posting the job emails
          them when they are.
        </p>
      ) : (
        riders.data.map((rider) => (
          <label
            key={rider.id}
            className="flex cursor-pointer items-start gap-3 text-sm"
          >
            <input
              type="radio"
              name={`rider-${order.id}`}
              checked={choice === rider.id}
              onChange={() => setChoice(rider.id)}
              className="mt-1 accent-blue-600"
            />
            <span>
              <span className="block font-medium text-neutral-900">
                {rider.name}
              </span>
              <span className="block text-xs text-neutral-500">
                {rider.vehicle ? `${vehicleLabel(rider.vehicle)} · ` : ''}
                {rider.completedDeliveries}{' '}
                {rider.completedDeliveries === 1 ? 'delivery' : 'deliveries'} ·{' '}
                {rider.phone}
              </span>
            </span>
          </label>
        ))
      )}

      {send.error && (
        <p role="alert" className="text-sm text-rose-600 dark:text-rose-400">
          {errorText(
            send.error,
            'Couldn’t send the request. Please try again.',
          )}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => send.mutate()}
          disabled={send.isPending}
          className={primaryButtonClassName}
        >
          {send.isPending
            ? 'Sending…'
            : choice
              ? 'Offer to this rider'
              : 'Post the job'}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={secondaryButtonClassName}
        >
          Not now
        </button>
      </div>
    </fieldset>
  );
}

export function SellerOrderCard({
  order,
  onUpdated,
}: {
  order: Order;
  onUpdated: (next: Order, message?: string) => void;
}) {
  const [note, setNote] = useState('');
  const move = useMutation({
    mutationFn: (status: 'confirmed' | 'cancelled') =>
      updateShopOrder(order.id, status, note.trim() || undefined),
    onSuccess: (response) => {
      setNote('');
      onUpdated(response.data, response.message);
    },
  });
  const withdraw = useMutation({
    mutationFn: () => withdrawDeliveryRequest(order.id),
    onSuccess: (response) => onUpdated(response.data, response.message),
  });

  const delivery = order.delivery;
  const canConfirm = canSellerMoveOrder(order.status, 'confirmed');
  const canCancel =
    canSellerMoveOrder(order.status, 'cancelled') &&
    delivery?.status !== 'picked_up';
  const waiting =
    delivery && (delivery.status === 'open' || delivery.status === 'offered');
  const riderOnJob =
    delivery?.rider &&
    (delivery.status === 'assigned' ||
      delivery.status === 'picked_up' ||
      delivery.status === 'delivered');

  return (
    <li className="py-5 first:pt-0 last:pb-0">
      <article aria-label={`Order ${order.number}`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-medium text-neutral-900">{order.number}</p>
            <p className="text-xs text-neutral-500">
              {order.buyerName} · {formatDate(order.createdAt)}
            </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[order.status]}`}
          >
            {order.status === 'confirmed' && delivery
              ? deliveryStatusLabel(delivery.status)
              : orderStatusLabel(order.status)}
          </span>
        </div>

        <ul className="mt-3 space-y-1 text-sm text-neutral-700">
          {order.items.map((item, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span>
                {item.quantity} × {item.name}
                {item.choices && (
                  <span className="text-neutral-500">
                    {' '}
                    ({describeChoices(item.choices)})
                  </span>
                )}
              </span>
              <span>{formatMoney(item.total - item.discount)}</span>
            </li>
          ))}
        </ul>

        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600">
          <span>
            Total{' '}
            <span className="font-medium text-neutral-900">
              {formatMoney(order.total)}
            </span>
          </span>
          <span>Due now {formatMoney(order.payNow)}</span>
          {order.onDelivery > 0 && (
            <span>Collect on delivery {formatMoney(order.onDelivery)}</span>
          )}
          <span>Delivery fee {formatMoney(order.deliveryFee)}</span>
          {order.discountCode && <span>Code {order.discountCode}</span>}
        </div>
        <p
          aria-label="Your earnings"
          className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-neutral-600"
        >
          <span>
            MlimaLink fee ({PLATFORM_FEE_PERCENT}%) −
            {formatMoney(order.platformFee)}
          </span>
          <span>
            You receive{' '}
            <span className="font-medium text-emerald-700">
              {formatMoney(order.sellerEarnings)}
            </span>
          </span>
        </p>

        <p className="mt-3 flex items-start gap-2 text-sm text-neutral-700">
          <MapPin size={16} className="mt-0.5 shrink-0 text-neutral-500" />
          <span>
            {order.address.recipientName} · {order.address.area},{' '}
            {order.address.zone}
            {order.address.street && ` · ${order.address.street}`}
            {order.address.notes && (
              <span className="block text-xs text-neutral-500">
                {order.address.notes}
              </span>
            )}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <ContactChips phone={order.address.phone} label={order.buyerName} />
        </div>

        {delivery && order.status !== 'cancelled' && (
          <section
            aria-label="Delivery"
            className="mt-4 space-y-3 rounded-lg bg-neutral-50 px-4 py-3"
          >
            {waiting && (
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                <span className="text-neutral-700">
                  {delivery.offeredTo
                    ? `Waiting for ${delivery.offeredTo.name} to answer.`
                    : 'Posted to riders in your town. Waiting for someone to accept.'}
                </span>
                <button
                  type="button"
                  onClick={() => withdraw.mutate()}
                  disabled={withdraw.isPending}
                  className={secondaryButtonClassName}
                >
                  {withdraw.isPending ? 'Withdrawing…' : 'Withdraw request'}
                </button>
              </div>
            )}
            {delivery.status === 'declined' && (
              <p className="text-sm text-neutral-700">
                The rider couldn&apos;t take it. Pick someone else or post it to
                everyone.
              </p>
            )}
            {riderOnJob && delivery.rider && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="mr-2 flex items-center gap-1.5 text-neutral-800">
                  <Bike size={16} className="text-blue-600" />
                  <span className="font-medium">{delivery.rider.name}</span>
                  {delivery.rider.vehicle &&
                    ` · ${vehicleLabel(delivery.rider.vehicle)}`}
                </span>
                {delivery.status !== 'delivered' && (
                  <ContactChips
                    phone={delivery.rider.phone}
                    label={delivery.rider.name}
                  />
                )}
              </div>
            )}
            {delivery.lastLocation && (
              <a
                href={mapsLink(delivery.lastLocation)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                <MapPin size={14} /> Rider&apos;s last location (
                {dateTime(delivery.lastLocation.at)})
              </a>
            )}
            {withdraw.error && (
              <p
                role="alert"
                className="text-sm text-rose-600 dark:text-rose-400"
              >
                {errorText(withdraw.error, 'Couldn’t withdraw the request.')}
              </p>
            )}
            <Timeline events={delivery.events} />
          </section>
        )}

        {canRequestDelivery(order.status, delivery?.status) && (
          <div className="mt-4">
            <RequestRider order={order} onUpdated={onUpdated} />
          </div>
        )}

        {(canConfirm || canCancel) && (
          <div className="mt-4 space-y-3">
            <div>
              <label
                htmlFor={`note-${order.id}`}
                className="mb-1.5 block text-xs font-medium text-neutral-600"
              >
                Message to {order.buyerName} (optional)
              </label>
              <textarea
                id={`note-${order.id}`}
                rows={2}
                value={note}
                maxLength={ORDER_NOTE_MAX}
                onChange={(event) => setNote(event.target.value)}
                placeholder={
                  canConfirm
                    ? 'e.g. Thanks! Pay the amount due to M-Pesa till 123456 and we’ll send it today.'
                    : 'e.g. Sorry, we can’t deliver this after all.'
                }
                className={inputClassName}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {canConfirm && (
                <button
                  type="button"
                  onClick={() => move.mutate('confirmed')}
                  disabled={move.isPending}
                  className={primaryButtonClassName}
                >
                  {move.isPending && move.variables === 'confirmed'
                    ? 'Saving…'
                    : 'Confirm order'}
                </button>
              )}
              {canCancel && (
                <button
                  type="button"
                  onClick={() => move.mutate('cancelled')}
                  disabled={move.isPending}
                  className={secondaryButtonClassName}
                >
                  {move.isPending && move.variables === 'cancelled'
                    ? 'Saving…'
                    : 'Cancel order'}
                </button>
              )}
            </div>
            {move.error && (
              <p
                role="alert"
                className="text-sm text-rose-600 dark:text-rose-400"
              >
                {errorText(
                  move.error,
                  'Couldn’t update the order. Please try again.',
                )}
              </p>
            )}
          </div>
        )}
      </article>
    </li>
  );
}
