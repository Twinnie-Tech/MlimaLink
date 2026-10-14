'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { ProductGrid } from '@org/shop-shared-ui';
import { useUser } from '../hooks/use-user';
import { useShopStore } from '../store/shop-store';
import {
  getRecommendations,
  recommendationsQueryKey,
} from '../utils/recommendations-api';

/**
 * "Recommended for you" row for signed-in shoppers. Recommendations are a nice-to-have,
 * so the row stays hidden while loading, on errors, and when there's nothing to suggest.
 */
export function RecommendedProducts({ exclude }: { exclude?: string }) {
  const router = useRouter();
  const { user } = useUser();
  const { isWishlisted, toggleWishlist } = useShopStore();
  const { data: products } = useQuery({
    queryKey: recommendationsQueryKey(exclude),
    queryFn: () => getRecommendations(exclude),
    enabled: Boolean(user),
    staleTime: 5 * 60_000,
    retry: false,
  });

  if (!user || !products?.length) return null;

  return (
    <section aria-labelledby="recommended-heading" className="mt-10">
      <h2
        id="recommended-heading"
        className="mb-5 flex items-center gap-2 font-poppins text-xl font-semibold text-neutral-900"
      >
        <Sparkles size={20} aria-hidden className="text-brand-start" />
        Recommended for you
      </h2>
      <ProductGrid
        products={products}
        onProductSelect={(product) => router.push(`/products/${product.id}`)}
        isWishlisted={isWishlisted}
        onToggleWishlist={toggleWishlist}
      />
    </section>
  );
}
