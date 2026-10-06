'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Bike,
  Briefcase,
  CalendarDays,
  Clock,
  ExternalLink,
  Globe,
  Loader2,
  MapPin,
  Package,
  Search,
  Store,
} from 'lucide-react';
import type { ShopDetail } from '@org/models';
import { imageSrcSet, sizedImage } from '@org/models/catalog';
import { formatOpeningHours, openStatus } from '@org/models/opening-hours';
import { useTrackShopVisit } from '../../shared/hooks/use-track-page-view';
import { formatPrice } from '../../shared/store/shop-store';
import { AuthRequestError } from '../../shared/utils/auth-api';
import { getShop, shopQueryKey } from '../../shared/utils/shops-api';
import { EmptyState } from '../../shared/widgets/empty-state';
import { ProductTile } from '../../shared/widgets/product-tile';
import { ReviewsSection } from '../../shared/widgets/reviews-section';
import {
  OpenBadge,
  ShopAvatar,
  ShopRating,
  bannerFallback,
} from '../../shared/widgets/shop-card';

/** Shops with more listings than this get a search box. */
const SEARCH_THRESHOLD = 6;

const PLATFORM_LABELS: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  x: 'X',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  whatsapp: 'WhatsApp',
  linkedin: 'LinkedIn',
};

const platformLabel = (platform: string) =>
  PLATFORM_LABELS[platform.toLowerCase()] ??
  platform.charAt(0).toUpperCase() + platform.slice(1);

const cardClassName =
  'rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm';
const cardHeadingClassName =
  'flex items-center gap-2 font-poppins font-semibold text-neutral-900';

function ShopSidebar({ shop }: { shop: ShopDetail }) {
  const hours = formatOpeningHours(shop.openingHours);
  const memberSince = new Date(shop.createdAt).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <aside className="space-y-5">
      <section aria-labelledby="shop-about" className={cardClassName}>
        <h2 id="shop-about" className={cardHeadingClassName}>
          <Store size={18} className="text-brand-start" aria-hidden />
          About
        </h2>
        <p className="mt-3 text-sm whitespace-pre-line text-neutral-700">
          {shop.bio ?? `${shop.name} sells ${shop.category} on MlimaLink.`}
        </p>
        <ul className="mt-4 space-y-2 text-sm text-neutral-600">
          <li className="flex items-start gap-2">
            <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden />
            {shop.address}
          </li>
          <li className="flex items-center gap-2">
            <CalendarDays size={16} className="shrink-0" aria-hidden />
            On MlimaLink since {memberSince}
          </li>
          {shop.website && (
            <li className="flex items-center gap-2">
              <Globe size={16} className="shrink-0" aria-hidden />
              <a
                href={shop.website}
                target="_blank"
                rel="noreferrer"
                className="truncate font-medium text-brand-start hover:text-brand-end"
              >
                {shop.website.replace(/^https?:\/\/(www\.)?/, '')}
              </a>
            </li>
          )}
        </ul>
        {shop.socialLinks.length > 0 && (
          <ul aria-label="Social media" className="mt-4 flex flex-wrap gap-2">
            {shop.socialLinks.map((link) => (
              <li key={link.url}>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1 text-xs font-medium text-neutral-700 transition hover:border-brand-start hover:text-brand-start"
                >
                  {platformLabel(link.platform)}
                  <ExternalLink size={12} aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="shop-hours" className={cardClassName}>
        <h2 id="shop-hours" className={cardHeadingClassName}>
          <Clock size={18} className="text-brand-start" aria-hidden />
          Opening hours
        </h2>
        {hours.length === 0 ? (
          <p className="mt-3 text-sm text-neutral-600">
            This shop hasn&apos;t shared its hours yet. You can still order
            online at any time.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5 text-sm text-neutral-700">
            {hours.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="shop-delivery" className={cardClassName}>
        <h2 id="shop-delivery" className={cardHeadingClassName}>
          <Bike size={18} className="text-brand-start" aria-hidden />
          Delivery
        </h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">Ships from</dt>
            <dd className="font-medium text-neutral-900">
              {shop.deliveryZone ?? 'Not set yet'}
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-neutral-600">Delivery fee</dt>
            <dd className="font-medium text-neutral-900">
              {formatPrice(shop.deliveryFee)} per order
            </dd>
          </div>
        </dl>
        <p className="mt-3 text-xs text-neutral-500">
          A local rider brings your order. Give them your private delivery code
          when it arrives.
        </p>
      </section>
    </aside>
  );
}

export default function ShopPage() {
  const { id } = useParams<{ id: string }>();
  const [query, setQuery] = useState('');
  const queryClient = useQueryClient();
  const {
    data: shop,
    isPending,
    error,
  } = useQuery({
    queryKey: shopQueryKey(id),
    queryFn: () => getShop(id),
    retry: false,
  });
  useTrackShopVisit(shop?.id);

  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Loading shop"
        className="flex justify-center py-20"
      >
        <Loader2 className="animate-spin text-brand-start" size={28} />
      </div>
    );
  }

  if (error || !shop) {
    const missing = error instanceof AuthRequestError && error.status === 404;
    return (
      <div className="mx-auto w-[90%] max-w-300 py-10">
        <EmptyState
          icon={Store}
          title={missing ? 'Shop not found' : 'Couldn’t load this shop'}
          description={
            missing
              ? 'This shop may have closed or the link is wrong.'
              : error instanceof Error
                ? error.message
                : 'Something went wrong. Please try again.'
          }
          action={{ href: '/shops', label: 'Browse shops' }}
        />
      </div>
    );
  }

  const term = query.trim().toLowerCase();
  const products = term
    ? shop.products.filter((product) =>
        [product.name, product.subCategory, product.category].some((text) =>
          text?.toLowerCase().includes(term),
        ),
      )
    : shop.products;

  return (
    <div>
      <div className="relative h-44 overflow-hidden bg-gradient-to-r from-brand-start to-brand-end sm:h-60">
        {shop.coverBanner ? (
          <img
            src={sizedImage(shop.coverBanner, 1600)}
            srcSet={imageSrcSet(shop.coverBanner, [800, 1200, 1600, 2000])}
            sizes="100vw"
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <div className={bannerFallback} aria-hidden />
        )}
      </div>

      <div className="mx-auto w-[90%] max-w-300">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <ShopAvatar
            shop={shop}
            className="-mt-12 h-24 w-24 shrink-0 text-2xl sm:-mt-14 sm:h-28 sm:w-28"
          />
          <div className="min-w-0 flex-1 sm:pt-4">
            <p className="text-xs font-medium tracking-wide text-brand-start uppercase">
              {shop.category}
            </p>
            <h1 className="mt-1 font-poppins text-3xl font-bold text-neutral-900">
              {shop.name}
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-600">
              <ShopRating shop={shop} />
              <span className="inline-flex items-center gap-1">
                <MapPin size={15} aria-hidden />
                {shop.deliveryZone ?? shop.address}
              </span>
              <span className="inline-flex items-center gap-1">
                <Package size={15} aria-hidden />
                {shop.productCount === 1
                  ? '1 listing'
                  : `${shop.productCount} listings`}
              </span>
              <OpenBadge status={openStatus(shop.openingHours)} />
            </div>
          </div>
          {shop.isProvider && (
            <Link
              href={`/providers/${shop.id}`}
              className="inline-flex items-center gap-2 self-start rounded-full border border-neutral-300 px-5 py-2.5 text-sm font-medium text-neutral-800 transition hover:border-brand-start hover:text-brand-start sm:mt-4"
            >
              <Briefcase size={16} aria-hidden />
              Services profile
            </Link>
          )}
        </header>

        <div className="grid gap-8 py-10 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section aria-labelledby="shop-products">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <h2
                id="shop-products"
                className="font-poppins text-xl font-semibold text-neutral-900"
              >
                Products from {shop.name}
              </h2>
              {shop.products.length > SEARCH_THRESHOLD && (
                <label className="relative w-full sm:w-64">
                  <span className="sr-only">Search this shop</span>
                  <Search
                    size={16}
                    className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search this shop"
                    className="h-10 w-full rounded-lg border border-neutral-300 bg-white pr-3 pl-9 text-sm focus:border-brand-start focus:ring-2 focus:ring-brand-start/20 focus:outline-none"
                  />
                </label>
              )}
            </div>

            {shop.products.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-neutral-300 bg-white px-6 py-12 text-center text-sm text-neutral-600">
                {shop.name} hasn&apos;t listed anything yet. Check back soon.
              </p>
            ) : products.length === 0 ? (
              <p className="py-12 text-center text-sm text-neutral-600">
                Nothing in this shop matches “{query.trim()}”.
              </p>
            ) : (
              <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
                {products.map((product) => (
                  <li key={product.id}>
                    <ProductTile product={product} />
                  </li>
                ))}
              </ul>
            )}
            {shop.products.length < shop.productCount && !term && (
              <p className="mt-5 text-center text-xs text-neutral-500">
                Showing the newest {shop.products.length} of {shop.productCount}{' '}
                listings.
              </p>
            )}

            <div className="mt-10">
              <ReviewsSection
                target={{ kind: 'shops', id: shop.id }}
                subject={shop.name}
                returnTo={`/shops/${shop.id}`}
                onSaved={() =>
                  queryClient.invalidateQueries({
                    queryKey: shopQueryKey(shop.id),
                  })
                }
              />
            </div>
          </section>

          <ShopSidebar shop={shop} />
        </div>
      </div>
    </div>
  );
}
