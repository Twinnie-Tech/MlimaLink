'use client';

import Link from 'next/link';
import { Heart, ShoppingCart, Trash2 } from 'lucide-react';
import { formatPrice, useShopStore } from '../shared/store/shop-store';
import { EmptyState } from '../shared/widgets/empty-state';

export default function WishlistPage() {
  const { ready, wishlist, removeFromWishlist, addToCart, cart } =
    useShopStore();

  if (!ready) return null;

  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
            My Wishlist
          </h1>
          <p className="mt-1 text-neutral-500">
            {wishlist.length} {wishlist.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>
      </div>

      {wishlist.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Tap the heart on any product to save it here for later."
        />
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {wishlist.map((product) => {
            const inCart = cart.some((item) => item.product.id === product.id);
            return (
              <li
                key={product.id}
                className="flex flex-col overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"
              >
                <Link
                  href={`/products/${product.id}`}
                  className="block"
                  tabIndex={-1}
                  aria-hidden="true"
                >
                  <img
                    src={product.imageUrl}
                    alt={product.name}
                    className="h-48 w-full object-cover"
                  />
                </Link>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    {product.category}
                  </span>
                  <Link
                    href={`/products/${product.id}`}
                    className="line-clamp-2 font-poppins font-semibold text-neutral-900 hover:text-brand-start"
                  >
                    {product.name}
                  </Link>
                  <span className="text-lg font-bold text-neutral-800">
                    {formatPrice(product.price)}
                  </span>
                  <div className="mt-auto flex gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => addToCart(product)}
                      disabled={!product.inStock}
                      className="flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-start px-3 py-2.5 text-sm font-medium text-white transition hover:bg-brand-end disabled:cursor-not-allowed disabled:bg-neutral-300"
                    >
                      <ShoppingCart size={16} />
                      {!product.inStock
                        ? 'Out of stock'
                        : inCart
                          ? 'Add another'
                          : 'Add to cart'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeFromWishlist(product.id)}
                      aria-label={`Remove ${product.name} from wishlist`}
                      className="flex w-11 items-center justify-center rounded-md border border-neutral-200 text-neutral-500 transition hover:border-rose-300 hover:text-rose-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
