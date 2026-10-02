import Link from 'next/link';
import { Clock, MapPin, Package, Star } from 'lucide-react';
import type { ShopSummary } from '@org/models';
import { imageSrcSet, sizedImage } from '@org/models/catalog';
import { openStatus, type OpenStatus } from '@org/models/opening-hours';

/** Soft highlights over the brand gradient for shops without a cover banner. */
export const bannerFallback =
  'h-full w-full bg-[radial-gradient(circle_at_15%_20%,rgba(255,255,255,0.35),transparent_40%),radial-gradient(circle_at_85%_90%,rgba(255,255,255,0.2),transparent_45%)]';

export const shopInitials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();

/** The shop's logo, or its initials on the brand gradient when it has none. */
export function ShopAvatar({
  shop,
  className,
}: {
  shop: Pick<ShopSummary, 'name' | 'avatarUrl'>;
  className: string;
}) {
  return shop.avatarUrl ? (
    <img
      src={sizedImage(shop.avatarUrl, 160)}
      alt=""
      className={`relative z-10 rounded-full border-4 border-white bg-white object-cover shadow-md ${className}`}
    />
  ) : (
    <span
      aria-hidden="true"
      className={`relative z-10 flex items-center justify-center rounded-full border-4 border-white bg-gradient-to-br from-brand-start to-brand-end font-poppins font-semibold text-white shadow-md ${className}`}
    >
      {shopInitials(shop.name)}
    </span>
  );
}

/** "4.5 (12 reviews)", or "New shop" before the first review. */
export function ShopRating({
  shop,
}: {
  shop: Pick<ShopSummary, 'rating' | 'reviewCount'>;
}) {
  if (shop.reviewCount === 0) {
    return <span className="text-neutral-500">New shop</span>;
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Star size={15} className="fill-amber-400 text-amber-400" aria-hidden />
      <span className="font-medium text-neutral-800">
        {shop.rating.toFixed(1)}
      </span>
      <span className="text-neutral-500">
        ({shop.reviewCount} {shop.reviewCount === 1 ? 'review' : 'reviews'})
      </span>
    </span>
  );
}

export function OpenBadge({ status }: { status: OpenStatus | null }) {
  if (!status) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        status.open
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-neutral-100 text-neutral-600'
      }`}
    >
      <Clock size={12} aria-hidden />
      {status.label}
    </span>
  );
}

/** A shop in the directory: banner, logo, category, town, rating and opening status. */
export function ShopCard({ shop, now }: { shop: ShopSummary; now?: Date }) {
  return (
    <Link
      href={`/shops/${shop.id}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-lg"
    >
      <div className="relative h-28 shrink-0 overflow-hidden bg-gradient-to-r from-brand-start to-brand-end">
        {shop.coverBanner ? (
          <img
            src={sizedImage(shop.coverBanner, 640)}
            srcSet={imageSrcSet(shop.coverBanner, [400, 640, 960])}
            sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={bannerFallback} aria-hidden />
        )}
        <span className="absolute top-3 right-3 rounded-full bg-white/90 px-2.5 py-1 text-xs font-medium text-neutral-800 backdrop-blur">
          {shop.category}
        </span>
      </div>

      <div className="flex flex-1 flex-col px-5 pb-5">
        <ShopAvatar shop={shop} className="-mt-8 h-16 w-16 text-lg" />
        <h2 className="mt-3 font-poppins text-lg font-semibold text-neutral-900 group-hover:text-brand-start">
          {shop.name}
        </h2>
        {shop.bio && (
          <p className="mt-1 line-clamp-2 text-sm text-neutral-600">
            {shop.bio}
          </p>
        )}

        <ul className="mt-3 space-y-1.5 text-sm text-neutral-600">
          <li className="flex items-start gap-1.5">
            <MapPin size={15} className="mt-0.5 shrink-0" aria-hidden />
            <span className="line-clamp-1">
              {shop.address}
              {shop.deliveryZone && !shop.address.includes(shop.deliveryZone)
                ? ` · ${shop.deliveryZone}`
                : ''}
            </span>
          </li>
          <li className="flex items-center gap-1.5">
            <Package size={15} className="shrink-0" aria-hidden />
            {shop.productCount === 1
              ? '1 listing'
              : `${shop.productCount} listings`}
          </li>
        </ul>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-sm">
          <ShopRating shop={shop} />
          <OpenBadge status={openStatus(shop.openingHours, now)} />
        </div>
      </div>
    </Link>
  );
}
