import { Product } from '@org/models';
import { formatPrice, listingTerms, priceRange } from '@org/models/catalog';
import { WishlistButton } from '../wishlist-button/wishlist-button';
import styles from './product-card.module.css';

const MAX_SWATCHES = 5;

export interface ProductCardProps {
  product: Product;
  onProductClick: (product: Product) => void;
  isWishlisted?: boolean;
  onToggleWishlist?: (product: Product) => void;
}

export function ProductCard({
  product,
  onProductClick,
  isWishlisted = false,
  onToggleWishlist,
}: ProductCardProps) {
  const getStars = () => {
    const stars = [];
    for (let i = 0; i < 5; i++) {
      stars.push(i < Math.floor(product.rating));
    }
    return stars;
  };

  const range = priceRange(product);
  const { pricePeriod, contactSeller } = listingTerms(product);
  const location = contactSeller
    ? product.specs?.find((spec) => spec.name === 'Location')?.value
    : undefined;
  const swatches =
    product.options
      ?.find((option) => option.values.some((value) => value.swatch))
      ?.values.filter((value) => value.swatch) ?? [];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onProductClick(product);
    }
  };

  return (
    <div
      className={`${styles['product-card']} ${!product.inStock ? styles['out-of-stock'] : ''}`}
      onClick={() => onProductClick(product)}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="button"
      aria-label={`View details for ${product.name}`}
    >
      <div className={styles['product-image']}>
        <img src={product.imageUrl} alt={product.name} />
        {!product.inStock && (
          <div className={styles['out-of-stock-overlay']}>
            {contactSeller ? 'No longer available' : 'Out of Stock'}
          </div>
        )}
        {onToggleWishlist && (
          <div className={styles['wishlist-slot']}>
            <WishlistButton
              productName={product.name}
              active={isWishlisted}
              onToggle={() => onToggleWishlist(product)}
            />
          </div>
        )}
      </div>
      <div className={styles['product-info']}>
        <h3 className={styles['product-name']}>{product.name}</h3>
        <p className={styles['product-category']}>
          {product.category}
          {product.subCategory && ` › ${product.subCategory}`}
        </p>
        {location && <p className={styles['product-location']}>{location}</p>}
        <div className={styles['product-rating']}>
          <span className={styles['stars']}>
            {getStars().map((filled, index) => (
              <span key={index} className={filled ? styles['filled'] : ''}>
                ★
              </span>
            ))}
          </span>
          <span className={styles['review-count']}>
            ({product.reviewCount})
          </span>
        </div>
        {swatches.length > 0 && (
          <div className={styles['swatches']}>
            <span className={styles['sr-only']}>
              {swatches.length} colours:{' '}
            </span>
            {swatches.slice(0, MAX_SWATCHES).map((value) => (
              <span
                key={value.label}
                title={value.label}
                className={styles['swatch']}
                style={{ background: value.swatch }}
              />
            ))}
            {swatches.length > MAX_SWATCHES && (
              <span className={styles['more-swatches']} aria-hidden="true">
                +{swatches.length - MAX_SWATCHES}
              </span>
            )}
          </div>
        )}
        <div className={styles['product-price']}>
          {range.min !== range.max && (
            <span className={styles['price-from']}>From </span>
          )}
          {formatPrice(range.min)}
          {pricePeriod && (
            <span className={styles['price-period']}> / {pricePeriod}</span>
          )}
          {product.salePrice !== undefined && range.min < product.price && (
            <s className={styles['price-was']}>{formatPrice(product.price)}</s>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProductCard;
