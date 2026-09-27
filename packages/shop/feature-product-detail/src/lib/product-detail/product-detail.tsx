import { useEffect, useState } from 'react';
import { Product } from '@org/models';
import { useProduct } from '@org/shop-data';
import {
  LoadingSpinner,
  ErrorMessage,
  WishlistButton,
} from '@org/shop-shared-ui';
import styles from './product-detail.module.css';

const ADDED_FEEDBACK_MS = 1500;

export interface ProductDetailProps {
  productId?: string;
  onBack?: () => void;
  onAddToCart?: (product: Product) => void;
  isWishlisted?: boolean;
  onToggleWishlist?: (product: Product) => void;
}

export function ProductDetail({
  productId,
  onBack,
  onAddToCart,
  isWishlisted = false,
  onToggleWishlist,
}: ProductDetailProps = {}) {
  const { product, loading, error } = useProduct(productId);
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [justAdded]);

  const handleBackClick = () => {
    onBack?.();
  };

  const handleAddToCart = () => {
    if (!product) return;
    onAddToCart?.(product);
    setJustAdded(true);
  };

  const handleRetry = () => {
    // Force re-fetch by navigating to the same URL
    window.location.reload();
  };

  const getStars = () => {
    if (!product) return [];
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(i < Math.floor(product.rating));
    }
    return stars;
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} onRetry={handleRetry} />;
  }

  if (!product) {
    return <ErrorMessage message="Product not found" onRetry={handleRetry} />;
  }

  return (
    <div className={styles['product-detail-container']}>
      <button className={styles['back-button']} onClick={handleBackClick}>
        ← Back to Products
      </button>

      <div className={styles['product-detail']}>
        <div className={styles['product-image']}>
          <img src={product.imageUrl} alt={product.name} />
          {!product.inStock && (
            <div className={styles['out-of-stock-overlay']}>Out of Stock</div>
          )}
        </div>

        <div className={styles['product-info']}>
          <div className={styles['product-category']}>{product.category}</div>
          <h1 className={styles['product-name']}>{product.name}</h1>

          <div className={styles['product-rating']}>
            <span className={styles['stars']}>
              {getStars().map((filled, index) => (
                <span key={index} className={filled ? styles['filled'] : ''}>
                  ★
                </span>
              ))}
            </span>
            <span className={styles['review-count']}>
              ({product.reviewCount} reviews)
            </span>
          </div>

          <div className={styles['product-price']}>
            ${product.price.toFixed(2)}
          </div>

          <div className={styles['product-availability']}>
            {product.inStock ? (
              <span className={styles['in-stock']}>✓ In Stock</span>
            ) : (
              <span className={styles['out-of-stock']}>Out of Stock</span>
            )}
          </div>

          <div className={styles['product-description']}>
            <h2>Description</h2>
            <p>{product.description}</p>
          </div>

          <div className={styles['product-actions']}>
            <button
              className={styles['add-to-cart-btn']}
              onClick={handleAddToCart}
              disabled={!product.inStock}
            >
              {!product.inStock
                ? 'Out of Stock'
                : justAdded
                  ? 'Added to Cart ✓'
                  : 'Add to Cart'}
            </button>
            {onToggleWishlist && (
              <WishlistButton
                productName={product.name}
                active={isWishlisted}
                onToggle={() => onToggleWishlist(product)}
                showLabel
              />
            )}
          </div>

          <div className={styles['product-details']}>
            <h3>Product Details</h3>
            <ul>
              <li>
                <strong>Product ID:</strong> {product.id}
              </li>
              <li>
                <strong>Category:</strong> {product.category}
              </li>
              <li>
                <strong>Rating:</strong> {product.rating.toFixed(1)} out of 5
              </li>
              <li>
                <strong>Reviews:</strong> {product.reviewCount} customer reviews
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ProductDetail;
