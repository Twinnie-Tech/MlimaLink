'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, Loader2, ShoppingCart } from 'lucide-react';
import type { DeliveryAddress } from '@org/models';
import { describeChoices, formatPrice } from '@org/models/catalog';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import { DELIVERY_ZONES, parseDeliveryAddress } from '@org/models/delivery';
import { useUser } from '../hooks/use-user';
import { useShopStore } from '../store/shop-store';
import {
  Field,
  describedBy,
  inputClassName,
  primaryButtonClassName,
} from '../dashboard/ui';
import {
  MY_ORDERS_KEY,
  placeOrders,
  quoteCheckout,
  toCheckoutItems,
} from '../utils/orders-api';
import { rememberReturnTo } from '../utils/return-to';
import { EmptyState } from './empty-state';

/** The last address used at checkout, so the next order is quicker. */
export const DELIVERY_ADDRESS_KEY = 'mlimalink-delivery-address';

type AddressForm = {
  recipientName: string;
  phone: string;
  zone: string;
  area: string;
  street: string;
  notes: string;
};

const emptyAddress: AddressForm = {
  recipientName: '',
  phone: '',
  zone: '',
  area: '',
  street: '',
  notes: '',
};

function savedAddress(): AddressForm {
  try {
    const saved = JSON.parse(
      localStorage.getItem(DELIVERY_ADDRESS_KEY) ?? 'null',
    ) as Partial<AddressForm> | null;
    return { ...emptyAddress, ...saved };
  } catch {
    return emptyAddress;
  }
}

/** Delivery address and a per-shop summary priced by the server, then places one order per shop. */
export function CheckoutForm() {
  const { ready, cart, discountCode, clearCart } = useShopStore();
  const { user, isLoading } = useUser();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const items = useMemo(() => toCheckoutItems(cart), [cart]);

  const quote = useQuery({
    queryKey: ['checkout-quote', items, discountCode],
    queryFn: () => quoteCheckout(items, discountCode),
    enabled: ready && items.length > 0,
    retry: false,
  });

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors },
  } = useForm<AddressForm>({ defaultValues: emptyAddress });

  useEffect(() => {
    const saved = savedAddress();
    reset({
      ...saved,
      recipientName: saved.recipientName || getValues('recipientName'),
    });
  }, [reset, getValues]);

  useEffect(() => {
    if (user && !getValues('recipientName')) {
      reset({ ...getValues(), recipientName: user.name });
    }
  }, [user, reset, getValues]);

  const mutation = useMutation({
    mutationFn: placeOrders,
    onSuccess: async (response) => {
      clearCart();
      await queryClient.invalidateQueries({ queryKey: MY_ORDERS_KEY });
      const numbers = response.data.map((order) => order.number).join(',');
      router.push(`/dashboard/orders?placed=${encodeURIComponent(numbers)}`);
    },
  });

  if (!ready || isLoading) {
    return (
      <div role="status" aria-label="Loading checkout" className="py-16">
        <Loader2 className="mx-auto animate-spin text-brand-start" size={28} />
      </div>
    );
  }

  if (cart.length === 0) {
    return mutation.isSuccess ? (
      <div role="status" className="py-16 text-center text-neutral-600">
        Order placed. Taking you to your orders…
      </div>
    ) : (
      <EmptyState
        icon={ShoppingCart}
        title="Your cart is empty"
        description="Add products to your cart, then come back here to check out."
      />
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md rounded-xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
        <p className="font-poppins text-lg font-semibold text-neutral-900">
          Log in to check out
        </p>
        <p className="mt-1 text-sm text-neutral-600">
          We need your account to send you order updates and your delivery code.
        </p>
        <Link
          href="/login"
          onClick={() => rememberReturnTo('/checkout')}
          className={`mt-5 ${primaryButtonClassName}`}
        >
          Log in to continue
        </Link>
      </div>
    );
  }

  const onSubmit = (form: AddressForm) => {
    const parsed = parseDeliveryAddress(form);
    if ('error' in parsed) {
      setFormError(parsed.error);
      return;
    }
    setFormError(null);
    localStorage.setItem(DELIVERY_ADDRESS_KEY, JSON.stringify(form));
    const address: DeliveryAddress = parsed.address;
    // Only send a code the server accepted, so a stale code doesn't block the order.
    const code = quote.data?.discountCode;
    mutation.mutate({ items, address, ...(code && { discountCode: code }) });
  };

  const data = quote.data;
  const shops = data?.groups.length ?? 0;
  const error =
    formError ??
    (mutation.error instanceof Error ? mutation.error.message : null);

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      aria-label="Checkout"
      className="grid items-start gap-8 lg:grid-cols-[1fr_380px]"
    >
      <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="font-poppins text-lg font-semibold text-neutral-900">
          Delivery address
        </h2>
        <p className="mt-1 text-sm text-neutral-500">
          A rider brings your order here. They&apos;ll call this number when
          they&apos;re close.
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Field
            id="recipientName"
            label="Who’s receiving it?"
            error={errors.recipientName?.message}
          >
            <input
              {...describedBy('recipientName', errors.recipientName?.message)}
              autoComplete="name"
              className={inputClassName}
              {...register('recipientName', {
                validate: (value) =>
                  value.trim().length >= 2 || 'Enter the recipient’s name',
              })}
            />
          </Field>
          <Field id="phone" label="Phone number" error={errors.phone?.message}>
            <input
              {...describedBy('phone', errors.phone?.message)}
              type="tel"
              autoComplete="tel"
              placeholder="+254712345678"
              className={inputClassName}
              {...register('phone', {
                required: 'Enter a phone number',
              })}
            />
          </Field>
          <Field id="zone" label="Town" error={errors.zone?.message}>
            <select
              {...describedBy('zone', errors.zone?.message)}
              className={inputClassName}
              {...register('zone', {
                required: 'Choose the town to deliver to',
              })}
            >
              <option value="">Choose a town</option>
              {DELIVERY_ZONES.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
          </Field>
          <Field id="area" label="Estate or area" error={errors.area?.message}>
            <input
              {...describedBy('area', errors.area?.message)}
              placeholder="e.g. Kilimani"
              className={inputClassName}
              {...register('area', {
                validate: (value) =>
                  value.trim().length >= 2 || 'Enter the estate or area',
              })}
            />
          </Field>
          <Field
            id="street"
            label="Street, building and house number"
            hint="Optional"
            className="sm:col-span-2"
          >
            <input
              id="street"
              autoComplete="street-address"
              maxLength={120}
              className={inputClassName}
              {...register('street')}
            />
          </Field>
          <Field
            id="notes"
            label="Directions for the rider"
            hint="Optional"
            className="sm:col-span-2"
          >
            <textarea
              id="notes"
              rows={2}
              maxLength={300}
              placeholder="e.g. Blue gate next to the chemist"
              className={inputClassName}
              {...register('notes')}
            />
          </Field>
        </div>
      </section>

      <aside className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
        <h2 className="font-poppins text-lg font-semibold text-neutral-900">
          Order summary
        </h2>

        {quote.isPending && (
          <div role="status" aria-label="Pricing your order" className="py-8">
            <Loader2
              className="mx-auto animate-spin text-brand-start"
              size={24}
            />
          </div>
        )}

        {quote.error && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
          >
            {quote.error instanceof Error
              ? quote.error.message
              : 'We couldn’t price your order.'}{' '}
            <Link href="/cart" className="font-medium underline">
              Review your cart
            </Link>
          </div>
        )}

        {data && (
          <>
            {shops > 1 && (
              <p className="mt-2 text-sm text-neutral-500">
                Your cart has items from {shops} shops, so you&apos;ll get{' '}
                {shops} orders, each with its own delivery.
              </p>
            )}
            <ul className="mt-4 space-y-5">
              {data.groups.map((group) => (
                <li
                  key={group.shopId}
                  aria-label={`From ${group.shopName}`}
                  className="border-b border-neutral-200 pb-4 last:border-b-0"
                >
                  <p className="text-sm font-semibold text-neutral-900">
                    {group.shopName}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-neutral-600">
                    {group.items.map((item, index) => (
                      <li key={index} className="flex justify-between gap-3">
                        <span className="min-w-0">
                          {item.quantity} × {item.name}
                          {item.choices && (
                            <span className="text-neutral-400">
                              {' '}
                              ({describeChoices(item.choices)})
                            </span>
                          )}
                        </span>
                        <span className="shrink-0">
                          {formatPrice(item.total - item.discount)}
                        </span>
                      </li>
                    ))}
                    <li className="flex justify-between gap-3">
                      <span className="flex items-center gap-1.5">
                        <Bike size={14} /> Delivery
                      </span>
                      <span>
                        {group.deliveryFee > 0
                          ? formatPrice(group.deliveryFee)
                          : 'Free'}
                      </span>
                    </li>
                  </ul>
                </li>
              ))}
            </ul>

            {data.discountError && (
              <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                Your code {discountCode} wasn&apos;t applied:{' '}
                {data.discountError}
              </p>
            )}

            <dl className="mt-4 space-y-2 text-sm text-neutral-600">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatPrice(data.subtotal)}</dd>
              </div>
              {data.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <dt>Discount ({data.discountCode})</dt>
                  <dd>−{formatPrice(data.discount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Delivery</dt>
                <dd data-testid="checkout-delivery">
                  {formatPrice(data.deliveryFee)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold text-neutral-900">
                <dt>Total</dt>
                <dd data-testid="checkout-total">{formatPrice(data.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Due now (includes delivery)</dt>
                <dd>{formatPrice(data.payNow)}</dd>
              </div>
              {data.onDelivery > 0 && (
                <div className="flex justify-between">
                  <dt>Pay on delivery</dt>
                  <dd>{formatPrice(data.onDelivery)}</dd>
                </div>
              )}
            </dl>
            <p
              data-testid="checkout-fee-split"
              className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-500"
            >
              Your total includes a {PLATFORM_FEE_PERCENT}% MlimaLink service
              fee of {formatPrice(data.platformFee)}. The{' '}
              {shops > 1 ? 'shops receive' : 'shop receives'}{' '}
              {formatPrice(data.sellerEarnings)} and riders get the delivery
              fee.
            </p>
          </>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-sm text-rose-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={!data || mutation.isPending}
          className={`mt-6 w-full ${primaryButtonClassName}`}
        >
          {mutation.isPending
            ? 'Placing your order…'
            : shops > 1
              ? `Place ${shops} orders`
              : 'Place order'}
        </button>
        <p className="mt-3 text-xs text-neutral-500">
          Each shop confirms your order and tells you how to pay the amount due
          now. When the rider arrives, give them the delivery code from your
          orders page.
        </p>
      </aside>
    </form>
  );
}
