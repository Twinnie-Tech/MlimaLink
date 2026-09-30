'use client';

import { useQuery } from '@tanstack/react-query';
import type { Product } from '@org/models';
import { getProvider } from '../utils/services-api';
import { ProviderCard } from './provider-card';
import { ServiceRequestForm } from './service-request-form';

export const providerQueryKey = (shopId: string) => ['provider', shopId];

/** The provider's profile and a request form, shown on service listings. */
export function ServicePanel({ product }: { product: Product }) {
  const shopId = product.shopId;
  const { data: provider } = useQuery({
    queryKey: providerQueryKey(shopId ?? ''),
    queryFn: () => getProvider(shopId ?? ''),
    enabled: Boolean(shopId),
    staleTime: 5 * 60_000,
    retry: false,
  });

  return (
    <div className="my-6 space-y-4">
      {provider && <ProviderCard profile={provider.profile} showProfileLink />}
      {product.inStock && <ServiceRequestForm product={product} />}
    </div>
  );
}
