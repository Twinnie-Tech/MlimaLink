'use client';

import { useRouter } from 'next/navigation';
import { ProductList } from '@org/shop-feature-products';

export default function ProductsPage() {
  const router = useRouter();

  return (
    <ProductList
      onProductSelect={(product) => router.push(`/products/${product.id}`)}
    />
  );
}
