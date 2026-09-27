'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductList } from '@org/shop-feature-products';
import { useShopStore } from '../shared/store/shop-store';

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isWishlisted, toggleWishlist } = useShopStore();

  const handleCategoryChange = (category: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (category) {
      params.set('category', category);
    } else {
      params.delete('category');
    }
    const query = params.toString().replace(/\+/g, '%20');
    router.replace(query ? `/products?${query}` : '/products', {
      scroll: false,
    });
  };

  return (
    <ProductList
      searchTerm={searchParams.get('search') ?? ''}
      category={searchParams.get('category') ?? ''}
      onCategoryChange={handleCategoryChange}
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
