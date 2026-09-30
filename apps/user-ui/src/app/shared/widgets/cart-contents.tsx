'use client';

import Link from 'next/link';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import type { PaymentOption } from '@org/models';
import {
  choiceImage,
  describeChoices,
  dueNowShare,
  paymentLabel,
  paymentOptionsOf,
} from '@org/models/catalog';
import { paymentSplit } from '@org/models/checkout';
import {
  cartItemPrice,
  cartLineId,
  cartPaymentOption,
  formatPrice,
  useShopStore,
} from '../store/shop-store';
import { useCartDiscount } from '../store/use-cart-discount';
import { DiscountCodeBox } from './discount-code-box';
import { EmptyState } from './empty-state';

/** Cart lines with quantity and payment controls plus the order summary, or an empty state. */
export function CartContents({
  layoutClassName = 'lg:grid-cols-[1fr_340px]',
}: {
  layoutClassName?: string;
}) {
  const {
    cart,
    cartCount,
    updateCartQuantity,
    setCartPaymentOption,
    removeFromCart,
  } = useShopStore();
  const discount = useCartDiscount();

  if (cart.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="Your cart is empty"
        description="Products you add to your cart will show up here."
      />
    );
  }

  const totals = paymentSplit(
    cart.map((item, index) => ({
      total: cartItemPrice(item) * item.quantity,
      share: dueNowShare(cartPaymentOption(item)),
      discount: discount.lineDiscounts[index],
    })),
  );

  return (
    <div className={`grid items-start gap-8 ${layoutClassName}`}>
      <ul className="flex flex-col gap-4">
        {cart.map((item, index) => {
          const { product, quantity, variant } = item;
          const lineId = cartLineId(item);
          const price = cartItemPrice(item);
          const choices = variant ? describeChoices(variant.choices) : '';
          const lineName = choices
            ? `${product.name} (${choices})`
            : product.name;
          const accepted = paymentOptionsOf(product);
          const payment = cartPaymentOption(item);
          const lineDiscount = discount.lineDiscounts[index];
          return (
            <li
              key={lineId}
              className="flex gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
            >
              <Link
                href={`/products/${product.id}`}
                className="shrink-0"
                tabIndex={-1}
                aria-hidden="true"
              >
                <img
                  src={choiceImage(product, variant?.choices ?? {})}
                  alt={product.name}
                  className="h-24 w-24 rounded-md object-cover"
                />
              </Link>

              <div className="flex flex-1 flex-col gap-1">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <Link
                      href={`/products/${product.id}`}
                      className="font-poppins font-semibold text-neutral-900 hover:text-brand-start"
                    >
                      {product.name}
                    </Link>
                    {choices && (
                      <p className="text-sm text-neutral-700">{choices}</p>
                    )}
                    <p className="text-sm text-neutral-500">
                      {product.category}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeFromCart(lineId)}
                    aria-label={`Remove ${lineName} from cart`}
                    className="text-neutral-400 transition hover:text-rose-600"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>

                <div className="text-sm text-neutral-600">
                  {accepted.length > 1 ? (
                    <label className="inline-flex items-center gap-2">
                      <span>Pay by</span>
                      <select
                        value={payment}
                        onChange={(event) =>
                          setCartPaymentOption(
                            lineId,
                            event.target.value as PaymentOption,
                          )
                        }
                        aria-label={`How to pay for ${lineName}`}
                        className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-sm text-neutral-800"
                      >
                        {accepted.map((option) => (
                          <option key={option} value={option}>
                            {paymentLabel(option)}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <span>{paymentLabel(payment)}</span>
                  )}
                </div>

                <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                  <div className="flex items-center rounded-md border border-neutral-200">
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(lineId, quantity - 1)}
                      disabled={quantity <= 1}
                      aria-label={`Decrease quantity of ${lineName}`}
                      className="flex h-9 w-9 items-center justify-center text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Minus size={16} />
                    </button>
                    <output
                      aria-label={`Quantity of ${lineName}`}
                      className="w-10 text-center font-medium"
                    >
                      {quantity}
                    </output>
                    <button
                      type="button"
                      onClick={() => updateCartQuantity(lineId, quantity + 1)}
                      aria-label={`Increase quantity of ${lineName}`}
                      className="flex h-9 w-9 items-center justify-center text-neutral-600 transition hover:bg-neutral-100"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-neutral-900">
                      {formatPrice(price * quantity)}
                    </p>
                    {quantity > 1 && (
                      <p className="text-xs text-neutral-500">
                        {formatPrice(price)} each
                      </p>
                    )}
                    {lineDiscount > 0 && (
                      <p className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                        −{formatPrice(lineDiscount)} with {discount.code}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm lg:sticky lg:top-6">
        <h2 className="font-poppins text-lg font-semibold text-neutral-900">
          Order Summary
        </h2>
        <dl className="mt-4 space-y-3 text-neutral-600">
          <div className="flex justify-between">
            <dt>Items</dt>
            <dd>{cartCount}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Subtotal</dt>
            <dd data-testid="cart-subtotal">{formatPrice(totals.subtotal)}</dd>
          </div>
          {totals.discount > 0 && (
            <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
              <dt>Discount ({discount.code})</dt>
              <dd data-testid="cart-discount">
                −{formatPrice(totals.discount)}
              </dd>
            </div>
          )}
          <div className="flex justify-between">
            <dt>Shipping</dt>
            <dd>Calculated at checkout</dd>
          </div>
          <div className="flex justify-between border-t border-neutral-200 pt-3 text-base font-semibold text-neutral-900">
            <dt>Total</dt>
            <dd data-testid="cart-total">{formatPrice(totals.total)}</dd>
          </div>
          {totals.onDelivery > 0 && (
            <>
              <div className="flex justify-between text-sm">
                <dt>Pay now</dt>
                <dd data-testid="cart-pay-now">{formatPrice(totals.payNow)}</dd>
              </div>
              <div className="flex justify-between text-sm">
                <dt>Pay on delivery</dt>
                <dd data-testid="cart-pay-on-delivery">
                  {formatPrice(totals.onDelivery)}
                </dd>
              </div>
            </>
          )}
        </dl>

        <DiscountCodeBox
          code={discount.code}
          applied={discount.applied}
          error={discount.error}
          checking={discount.checking}
          onApply={discount.apply}
          onRemove={discount.remove}
        />

        <button
          type="button"
          disabled
          className="mt-6 w-full cursor-not-allowed rounded-md bg-brand-start/60 py-3 font-poppins font-medium text-white"
        >
          Proceed to Checkout
        </button>
        <p className="mt-2 text-center text-xs text-neutral-500">
          Checkout is coming soon.
        </p>
        <Link
          href="/products"
          className="mt-4 block text-center text-sm font-medium text-brand-start hover:underline"
        >
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
