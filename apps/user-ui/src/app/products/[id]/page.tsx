'use client';

import { useParams, useRouter } from 'next/navigation';
import { ProductDetail } from '@org/shop-feature-product-detail';
import { useTrackProductView } from '../../shared/hooks/use-track-page-view';
import { useShopStore } from '../../shared/store/shop-store';
import { RecommendedProducts } from '../../shared/widgets/recommended-products';
import { ReviewsSection } from '../../shared/widgets/reviews-section';
import { ServicePanel } from '../../shared/widgets/service-panel';

/** Sample catalogue products have short ids and can't be reviewed. */
const isListing = (id: string) => /^[a-f\d]{24}$/i.test(id);

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isWishlisted, toggleWishlist, addToCart } = useShopStore();
  useTrackProductView(id);

  return (
    <>
      <ProductDetail
        productId={id}
        onBack={() => router.push('/products')}
        onAddToCart={addToCart}
        isWishlisted={isWishlisted(id)}
        onToggleWishlist={toggleWishlist}
        renderService={(product) => <ServicePanel product={product} />}
      />
      <div className="mx-auto max-w-[1200px] px-6 pb-12">
        {isListing(id) && (
          <ReviewsSection
            target={{ kind: 'products', id }}
            subject="this product"
            returnTo={`/products/${id}`}
          />
        )}
        <RecommendedProducts exclude={id} />
      </div>
    </>
  );
}
