'use client';

import Link from 'next/link';
import {
  Heart,
  Phone,
  ShoppingCart,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import { imageSrcSet, listingTerms, sizedImage } from '@org/models/catalog';
import { formatProductPrice, useShopStore } from '../store/shop-store';
import { EmptyState } from './empty-state';

const cartButtonClassName =
  'flex flex-1 items-center justify-center gap-2 rounded-md bg-brand-start px-3 py-2.5 text-sm font-medium text-white transition hover:bg-brand-end disabled:cursor-not-allowed disabled:bg-neutral-300';

/** Saved products with add-to-cart and remove actions, or an empty state. */
export function WishlistGrid({
  gridClassName = 'sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
}: {
  gridClassName?: string;
}) {
  const { wishlist, removeFromWishlist, addToCart, cart } = useShopStore();

  if (wishlist.length === 0) {
    return (
      <EmptyState
        icon={Heart}
        title="Your wishlist is empty"
        description="Tap the heart on any product to save it here for later."
      />
    );
  }

  return (
    <ul className={`grid gap-6 ${gridClassName}`}>
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
                src={sizedImage(product.imageUrl, 480)}
                srcSet={imageSrcSet(product.imageUrl, [320, 480, 640, 960])}
                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                alt={product.name}
                loading="lazy"
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
                {formatProductPrice(product)}
              </span>
              <div className="mt-auto flex gap-2 pt-2">
                {listingTerms(product).contactSeller && product.inStock ? (
                  <Link
                    href={`/products/${product.id}`}
                    className={cartButtonClassName}
                  >
                    <Phone size={16} />
                    Contact seller
                  </Link>
                ) : product.options?.length && product.inStock ? (
                  <Link
                    href={`/products/${product.id}`}
                    className={cartButtonClassName}
                  >
                    <SlidersHorizontal size={16} />
                    Choose options
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => addToCart(product)}
                    disabled={!product.inStock}
                    className={cartButtonClassName}
                  >
                    <ShoppingCart size={16} />
                    {!product.inStock
                      ? 'Out of stock'
                      : inCart
                        ? 'Add another'
                        : 'Add to cart'}
                  </button>
                )}
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
  );
}
