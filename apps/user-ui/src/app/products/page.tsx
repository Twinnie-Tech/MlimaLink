'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ProductList } from '@org/shop-feature-products';

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  return (
    <ProductList
      initialSearchTerm={searchParams.get('search') ?? ''}
      onProductSelect={(product) => router.push(`/products/${product.id}`)}
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
