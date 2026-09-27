'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductList } from '@org/shop-feature-products';
import { useShopStore } from '../shared/store/shop-store';

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isWishlisted, toggleWishlist } = useShopStore();

  return (
    <ProductList
      searchTerm={searchParams.get('search') ?? ''}
      onProductSelect={(product) => router.push(`/products/${product.id}`)}
      isWishlisted={isWishlisted}
      onToggleWishlist={toggleWishlist}
    />
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={null}>
      <ProductsContent />
    </Suspense>
  );
}
