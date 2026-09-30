'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Briefcase, Loader2 } from 'lucide-react';
import { imageSrcSet, sizedImage } from '@org/models/catalog';
import { formatProductPrice } from '../../shared/store/shop-store';
import { EmptyState } from '../../shared/widgets/empty-state';
import { ProviderCard } from '../../shared/widgets/provider-card';
import { providerQueryKey } from '../../shared/widgets/service-panel';
import { getProvider } from '../../shared/utils/services-api';

export default function ProviderPage() {
  const { shopId } = useParams<{ shopId: string }>();
  const {
    data: provider,
    isPending,
    error,
  } = useQuery({
    queryKey: providerQueryKey(shopId),
    queryFn: () => getProvider(shopId),
    retry: false,
  });

  if (isPending) {
    return (
      <div
        role="status"
        aria-label="Loading provider"
        className="flex justify-center py-20"
      >
        <Loader2 className="animate-spin text-brand-start" size={28} />
      </div>
    );
  }

  if (error || !provider) {
    return (
      <div className="mx-auto w-[90%] max-w-300 py-10">
        <EmptyState
          icon={Briefcase}
          title={error ? 'Couldn’t load this provider' : 'Provider not found'}
          description={
            error instanceof Error
              ? error.message
              : 'This provider hasn’t set up a profile yet. Browse other services instead.'
          }
        />
        <p className="mt-6 text-center">
          <Link
            href="/products?category=Services"
            className="text-sm font-medium text-brand-start hover:text-brand-end"
          >
            Browse services
          </Link>
        </p>
      </div>
    );
  }

  const { profile, services } = provider;

  return (
    <div className="mx-auto grid w-[90%] max-w-300 gap-8 py-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div>
        <ProviderCard profile={profile} />
      </div>
      <section aria-labelledby="provider-services">
        <h1
          id="provider-services"
          className="mb-5 font-poppins text-2xl font-semibold text-neutral-900"
        >
          Services from {profile.shopName}
        </h1>
        {services.length === 0 ? (
          <p className="text-sm text-neutral-500">
            {profile.shopName} hasn&apos;t listed any services yet.
          </p>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2">
            {services.map((service) => (
              <li key={service.id}>
                <Link
                  href={`/products/${service.id}`}
                  className="group block overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  <div className="aspect-[4/3] overflow-hidden bg-neutral-100">
                    <img
                      src={sizedImage(service.imageUrl, 480)}
                      srcSet={imageSrcSet(service.imageUrl, [320, 480, 640])}
                      sizes="(min-width: 640px) 30vw, 90vw"
                      alt={service.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition group-hover:scale-105"
                    />
                  </div>
                  <div className="p-4">
                    <p className="text-xs text-neutral-500">
                      {service.subCategory}
                    </p>
                    <p className="font-medium text-neutral-900 group-hover:text-brand-start">
                      {service.name}
                    </p>
                    {service.shortDescription && (
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-500">
                        {service.shortDescription}
                      </p>
                    )}
                    <p className="mt-2 flex items-center justify-between text-sm">
                      <span className="font-semibold text-neutral-900">
                        {formatProductPrice(service)}
                      </span>
                      {!service.inStock && (
                        <span className="text-xs text-neutral-500">
                          Fully booked
                        </span>
                      )}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
