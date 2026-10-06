'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Flame, Tag } from 'lucide-react';
import type { Product } from '@org/models';
import {
  discountPercent,
  formatPrice,
  imageSrcSet,
  priceRange,
  sizedImage,
} from '@org/models/catalog';
import { listOffers, OFFERS_QUERY_KEY } from '../utils/products-api';

export const OFFER_ROTATE_MS = 6000;
const HERO_SLIDES = 5;

const arrowClassName =
  'flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur transition hover:bg-white/30';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  return reduced;
}

function OfferPrice({ product, large }: { product: Product; large?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className={large ? 'text-2xl font-bold' : 'font-semibold'}>
        {formatPrice(priceRange(product).min)}
      </span>
      <s className={large ? 'text-sm opacity-75' : 'text-xs text-neutral-500'}>
        {formatPrice(product.price)}
      </s>
    </span>
  );
}

function OfferSlide({ product }: { product: Product }) {
  return (
    <div className="grid items-center gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
      <div className="space-y-4 text-white">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-xs font-semibold tracking-wide uppercase backdrop-blur">
          <Flame size={14} aria-hidden />
          Hot deal
        </p>
        <p className="font-poppins text-4xl leading-tight font-bold sm:text-5xl">
          {discountPercent(product)}% off
        </p>
        <div>
          <p className="line-clamp-2 font-poppins text-xl font-semibold">
            {product.name}
          </p>
          {product.shopName && (
            <p className="mt-1 text-sm opacity-80">from {product.shopName}</p>
          )}
        </div>
        <OfferPrice product={product} large />
        <div className="flex flex-wrap gap-3 pt-1">
          <Link
            href={`/products/${product.id}`}
            className="inline-flex items-center rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand-end shadow-sm transition hover:bg-neutral-100"
          >
            Shop this deal
          </Link>
          <Link
            href="/products?sale=1"
            className="inline-flex items-center rounded-full border border-white/60 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            See all offers
          </Link>
        </div>
      </div>
      <Link
        href={`/products/${product.id}`}
        tabIndex={-1}
        aria-hidden
        className="relative mx-auto block aspect-square w-full max-w-72 overflow-hidden rounded-3xl bg-white/95 shadow-xl"
      >
        {product.imageUrl && (
          <img
            src={sizedImage(product.imageUrl, 640)}
            srcSet={imageSrcSet(product.imageUrl, [480, 640, 960])}
            sizes="(min-width: 768px) 288px, 70vw"
            alt=""
            className="h-full w-full object-cover"
          />
        )}
        <span className="absolute top-3 left-3 rounded-full bg-rose-600 px-3 py-1 text-sm font-bold text-white shadow">
          −{discountPercent(product)}%
        </span>
      </Link>
    </div>
  );
}

/** Products on sale: a rotating banner of the biggest discounts and a strip of the rest. */
export function OffersBanner() {
  const { data: offers, isPending } = useQuery({
    queryKey: OFFERS_QUERY_KEY,
    queryFn: listOffers,
    staleTime: 5 * 60_000,
  });
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const reducedMotion = usePrefersReducedMotion();

  const slides = offers?.slice(0, HERO_SLIDES) ?? [];
  const count = slides.length;
  const current = count ? index % count : 0;

  useEffect(() => {
    if (count < 2 || paused || reducedMotion) return;
    const timer = setInterval(
      () => setIndex((value) => (value + 1) % count),
      OFFER_ROTATE_MS,
    );
    return () => clearInterval(timer);
  }, [count, paused, reducedMotion]);

  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Loading offers"
        className="h-72 animate-pulse rounded-3xl bg-gradient-to-r from-brand-start/40 to-brand-end/40"
      />
    );
  }
  if (!offers || count === 0) return null;

  const go = (step: number) => setIndex((current + step + count) % count);

  return (
    <section aria-labelledby="offers-heading" className="space-y-4">
      <h2 id="offers-heading" className="sr-only">
        Offers
      </h2>
      <div
        role="region"
        aria-roledescription="carousel"
        aria-label="Top deals"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-brand-start to-brand-end p-6 shadow-lg sm:p-10"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(255,255,255,0.25),transparent_40%),radial-gradient(circle_at_90%_100%,rgba(255,255,255,0.15),transparent_45%)]"
        />
        <div
          key={slides[current].id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${current + 1} of ${count}`}
          className="relative animate-fade-in motion-reduce:animate-none"
        >
          <OfferSlide product={slides[current]} />
        </div>
        {count > 1 && (
          <div className="relative mt-6 flex items-center justify-between gap-4">
            <div className="flex gap-2">
              {slides.map((product, n) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => setIndex(n)}
                  aria-label={`Show deal ${n + 1}: ${product.name}`}
                  aria-current={n === current ? 'true' : undefined}
                  className={`h-2.5 rounded-full transition-all ${
                    n === current ? 'w-8 bg-white' : 'w-2.5 bg-white/50'
                  }`}
                />
              ))}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => go(-1)}
                aria-label="Previous deal"
                className={arrowClassName}
              >
                <ChevronLeft size={18} aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => go(1)}
                aria-label="Next deal"
                className={arrowClassName}
              >
                <ChevronRight size={18} aria-hidden />
              </button>
            </div>
          </div>
        )}
      </div>

      {offers.length > 1 && (
        <ul
          aria-label="More deals"
          className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2"
        >
          {offers.map((product) => (
            <li key={product.id} className="w-56 shrink-0 snap-start">
              <Link
                href={`/products/${product.id}`}
                className="group flex items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-3 shadow-sm transition hover:border-brand-start/40 hover:shadow-md"
              >
                <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                  {product.imageUrl && (
                    <img
                      src={sizedImage(product.imageUrl, 160)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-600">
                    <Tag size={12} aria-hidden />
                    {discountPercent(product)}% off
                  </span>
                  <span className="block truncate text-sm font-medium text-neutral-900 group-hover:text-brand-start">
                    {product.name}
                  </span>
                  <span className="text-sm text-neutral-900">
                    <OfferPrice product={product} />
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
