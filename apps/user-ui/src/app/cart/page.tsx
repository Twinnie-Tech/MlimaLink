'use client';

import Link from 'next/link';
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { formatPrice, useShopStore } from '../shared/store/shop-store';
import { EmptyState } from '../shared/widgets/empty-state';

export default function CartPage() {
  const {
    ready,
    cart,
    cartCount,
    cartSubtotal,
    updateCartQuantity,
    removeFromCart,
  } = useShopStore();

  if (!ready) return null;

  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
        Shopping Cart
      </h1>
      <p className="mb-8 mt-1 text-neutral-500">
        {cartCount} {cartCount === 1 ? 'item' : 'items'} in your cart
      </p>

      {cart.length === 0 ? (
        <EmptyState
          icon={ShoppingCart}
          title="Your cart is empty"
          description="Products you add to your cart will show up here."
        />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[1fr_340px]">
          <ul className="flex flex-col gap-4">
            {cart.map(({ product, quantity }) => (
              <li
                key={product.id}
                className="flex gap-4 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
              >
                <Link
                  href={`/products/${product.id}`}
                  className="shrink-0"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <img
                    src={product.imageUrl}
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
                      <p className="text-sm text-neutral-500">
                        {product.category}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(product.id)}
                      aria-label={`Remove ${product.name} from cart`}
                      className="text-neutral-400 transition hover:text-rose-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>

                  <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div className="flex items-center rounded-md border border-neutral-200">
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQuantity(product.id, quantity - 1)
                        }
                        disabled={quantity <= 1}
                        aria-label={`Decrease quantity of ${product.name}`}
                        className="flex h-9 w-9 items-center justify-center text-neutral-600 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus size={16} />
                      </button>
                      <output
                        aria-label={`Quantity of ${product.name}`}
                        className="w-10 text-center font-medium"
                      >
                        {quantity}
                      </output>
                      <button
                        type="button"
                        onClick={() =>
                          updateCartQuantity(product.id, quantity + 1)
                        }
                        aria-label={`Increase quantity of ${product.name}`}
                        className="flex h-9 w-9 items-center justify-center text-neutral-600 transition hover:bg-neutral-100"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-neutral-900">
                        {formatPrice(product.price * quantity)}
                      </p>
                      {quantity > 1 && (
                        <p className="text-xs text-neutral-500">
                          {formatPrice(product.price)} each
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
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
                <dt>Shipping</dt>
                <dd>Calculated at checkout</dd>
              </div>
              <div className="flex justify-between border-t border-neutral-200 pt-3 text-base font-semibold text-neutral-900">
                <dt>Subtotal</dt>
                <dd data-testid="cart-subtotal">{formatPrice(cartSubtotal)}</dd>
              </div>
            </dl>
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
      )}
    </div>
  );
}
