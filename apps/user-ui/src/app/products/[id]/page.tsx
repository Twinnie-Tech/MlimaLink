'use client';

import { useParams, useRouter } from 'next/navigation';
import { ProductDetail } from '@org/shop-feature-product-detail';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  return (
    <ProductDetail productId={id} onBack={() => router.push('/products')} />
  );
}
