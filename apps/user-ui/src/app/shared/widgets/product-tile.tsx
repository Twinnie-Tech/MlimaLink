'use client';

import Link from 'next/link';
import { Heart, Star } from 'lucide-react';
import type { Product } from '@org/models';
import { imageSrcSet, sizedImage } from '@org/models/catalog';
import { formatProductPrice, useShopStore } from '../store/shop-store';

/** A product in a grid, linking to its page, with a wishlist toggle. */
export function ProductTile({ product }: { product: Product }) {
  const { isWishlisted, toggleWishlist } = useShopStore();
  const saved = isWishlisted(product.id);

  return (
    <div className="group relative h-full">
      <Link
        href={`/products/${product.id}`}
        className="flex h-full flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
      >
        <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
          {product.imageUrl && (
            <img
              src={sizedImage(product.imageUrl, 480)}
              srcSet={imageSrcSet(product.imageUrl, [320, 480, 640])}
              sizes="(min-width: 1024px) 22vw, (min-width: 640px) 45vw, 90vw"
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            />
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <p className="text-xs text-neutral-500">
            {product.subCategory ?? product.category}
          </p>
          <p className="line-clamp-2 font-medium text-neutral-900 group-hover:text-brand-start">
            {product.name}
          </p>
          {product.reviewCount > 0 && (
            <p className="mt-1 inline-flex items-center gap-1 text-xs text-neutral-600">
              <Star
                size={12}
                className="fill-amber-400 text-amber-400"
                aria-hidden
              />
              {product.rating.toFixed(1)} ({product.reviewCount})
            </p>
          )}
          <p className="mt-auto flex items-center justify-between gap-2 pt-2 text-sm">
            <span className="font-semibold text-neutral-900">
              {formatProductPrice(product)}
            </span>
            {!product.inStock && (
              <span className="text-xs text-neutral-500">Out of stock</span>
            )}
          </p>
        </div>
      </Link>
      <button
        type="button"
        onClick={() => toggleWishlist(product)}
        aria-pressed={saved}
        aria-label={
          saved
            ? `Remove ${product.name} from wishlist`
            : `Save ${product.name} to wishlist`
        }
        className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-neutral-600 shadow-sm backdrop-blur transition hover:text-rose-600"
      >
        <Heart
          size={18}
          className={saved ? 'fill-rose-500 text-rose-500' : ''}
          aria-hidden
        />
      </button>
    </div>
  );
}
