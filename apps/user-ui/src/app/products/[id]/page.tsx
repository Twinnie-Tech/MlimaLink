'use client';

import { useParams, useRouter } from 'next/navigation';
import { ProductDetail } from '@org/shop-feature-product-detail';
import { useShopStore } from '../../shared/store/shop-store';
import { ServicePanel } from '../../shared/widgets/service-panel';

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isWishlisted, toggleWishlist, addToCart } = useShopStore();

  return (
    <ProductDetail
      productId={id}
      onBack={() => router.push('/products')}
      onAddToCart={addToCart}
      isWishlisted={isWishlisted(id)}
      onToggleWishlist={toggleWishlist}
      renderService={(product) => <ServicePanel product={product} />}
    />
  );
}
