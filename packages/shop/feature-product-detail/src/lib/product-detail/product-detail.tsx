import { useEffect, useState, type ReactNode } from 'react';
import type {
  PaymentOption,
  Product,
  ProductOption,
  ProductVariant,
} from '@org/models';
import {
  dueNowShare,
  findVariant,
  formatPrice,
  imageSrcSet,
  isChoiceAvailable,
  isRichText,
  listingTerms,
  paymentLabel,
  paymentOptionsOf,
  priceRange,
  sizedImage,
  unitPrice,
} from '@org/models/catalog';
import { roundMoney } from '@org/models/checkout';
import { useProduct } from '@org/shop-data';
import {
  LoadingSpinner,
  ErrorMessage,
  WishlistButton,
} from '@org/shop-shared-ui';
import { ContactSeller } from './contact-seller';
import styles from './product-detail.module.css';

const ADDED_FEEDBACK_MS = 1500;
const LOW_STOCK = 5;

export interface ProductDetailProps {
  productId?: string;
  onBack?: () => void;
  /** Gets the chosen variant too when the product has options such as Colour or Size. */
  onAddToCart?: (product: Product, variant?: ProductVariant) => void;
  isWishlisted?: boolean;
  onToggleWishlist?: (product: Product) => void;
  /** Shown on service listings, e.g. the provider's profile and a request form. */
  renderService?: (product: Product) => ReactNode;
}

type Choices = Record<string, string>;

const without = (choices: Choices, name: string) =>
  Object.fromEntries(
    Object.entries(choices).filter(([option]) => option !== name),
  );

/** "size", "colour and size", "colour, size and width". */
const listNames = (names: string[]) => {
  const lower = names.map((name) => name.toLowerCase());
  return lower.length < 2
    ? lower.join('')
    : `${lower.slice(0, -1).join(', ')} and ${lower.at(-1)}`;
};

/** What paying this way means for one unit at the price shown. */
function paymentDetail(option: PaymentOption, price: number) {
  const now = roundMoney(price * dueNowShare(option));
  if (option === 'full_upfront')
    return `Pay ${formatPrice(now)} when you order`;
  if (option === 'cash_on_delivery') {
    return `Pay ${formatPrice(price)} in cash when it arrives`;
  }
  return `${formatPrice(now)} now, ${formatPrice(roundMoney(price - now))} on delivery`;
}

export function ProductDetail({
  productId,
  onBack,
  onAddToCart,
  isWishlisted = false,
  onToggleWishlist,
  renderService,
}: ProductDetailProps = {}) {
  const { product, loading, error } = useProduct(productId);
  const [justAdded, setJustAdded] = useState(false);
  const [choices, setChoices] = useState<Choices>({});
  const [activeImage, setActiveImage] = useState(0);
  const [showMissing, setShowMissing] = useState(false);

  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(false), ADDED_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [justAdded]);

  useEffect(() => {
    setChoices({});
    setActiveImage(0);
    setShowMissing(false);
  }, [product?.id]);

  const handleBackClick = () => {
    onBack?.();
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

  const options = product.options ?? [];
  const hasOptions = options.length > 0;
  const missing = options
    .filter((option) => !choices[option.name])
    .map((option) => option.name);
  const variant = hasOptions ? findVariant(product, choices) : undefined;
  const inStock = variant ? variant.stock > 0 : product.inStock;
  const stock = hasOptions ? variant?.stock : product.stock;
  const units = variant?.stock ?? product.stock;
  const images = product.images?.length ? product.images : [product.imageUrl];

  const { pricePeriod, contactSeller, service } = listingTerms(product);
  const range = priceRange(product);
  const price = variant ? unitPrice(product, variant) : range.min;
  const wasPrice =
    product.salePrice !== undefined && price < product.price
      ? product.price
      : undefined;

  const choose = (option: ProductOption, label: string) => {
    const others = without(choices, option.name);
    // A value that doesn't go with the other picks starts a fresh selection.
    setChoices(
      isChoiceAvailable(product, others, option.name, label)
        ? { ...others, [option.name]: label }
        : { [option.name]: label },
    );
    const index = option.values.find(
      (value) => value.label === label,
    )?.imageIndex;
    if (index !== undefined && index < images.length) setActiveImage(index);
  };

  const handleAddToCart = () => {
    if (hasOptions) {
      if (!variant) {
        setShowMissing(true);
        return;
      }
      onAddToCart?.(product, variant);
    } else {
      onAddToCart?.(product);
    }
    setJustAdded(true);
  };

  return (
    <div className={styles['product-detail-container']}>
      <button className={styles['back-button']} onClick={handleBackClick}>
        ← Back to Products
      </button>

      <div className={styles['product-detail']}>
        <div className={styles['gallery']}>
          <div className={styles['product-image']}>
            <img
              src={sizedImage(images[activeImage] ?? images[0], 1200)}
              srcSet={imageSrcSet(
                images[activeImage] ?? images[0],
                [640, 960, 1200, 1600, 2000],
              )}
              sizes="(min-width: 1024px) 50vw, 100vw"
              alt={product.name}
            />
            {!product.inStock && !service && (
              <div className={styles['out-of-stock-overlay']}>
                {contactSeller ? 'No longer available' : 'Out of Stock'}
              </div>
            )}
          </div>
          {images.length > 1 && (
            <div
              className={styles['thumbnails']}
              role="group"
              aria-label="Product photos"
            >
              {images.map((src, index) => (
                <button
                  key={src}
                  type="button"
                  aria-label={`Show photo ${index + 1}`}
                  aria-pressed={index === activeImage}
                  onClick={() => setActiveImage(index)}
                  className={`${styles['thumbnail']} ${index === activeImage ? styles['selected'] : ''}`}
                >
                  <img src={sizedImage(src, 160)} alt="" loading="lazy" />
                </button>
              ))}
            </div>
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
            {!variant && (range.min !== range.max || service) && (
              <span className={styles['price-from']}>From </span>
            )}
            {formatPrice(price)}
            {pricePeriod && (
              <span className={styles['price-period']}> / {pricePeriod}</span>
            )}
            {wasPrice !== undefined && (
              <s className={styles['price-was']}>{formatPrice(wasPrice)}</s>
            )}
          </div>

          <div className={styles['product-availability']}>
            {service ? (
              inStock ? (
                <span className={styles['in-stock']}>
                  ✓ Taking new requests
                </span>
              ) : (
                <span className={styles['out-of-stock']}>
                  Not taking new requests right now
                </span>
              )
            ) : contactSeller ? (
              inStock ? (
                <span className={styles['in-stock']}>
                  ✓ Available
                  {units !== undefined && units > 1 && ` · ${units} units`}
                </span>
              ) : (
                <span className={styles['out-of-stock']}>
                  No longer available
                </span>
              )
            ) : !inStock ? (
              <span className={styles['out-of-stock']}>Out of Stock</span>
            ) : stock !== undefined && stock <= LOW_STOCK ? (
              <span className={styles['low-stock']}>
                ✓ In Stock · only {stock} left
              </span>
            ) : (
              <span className={styles['in-stock']}>✓ In Stock</span>
            )}
          </div>

          {options.map((option) => {
            const others = without(choices, option.name);
            const isColour = option.values.some((value) => value.swatch);
            const chosen = choices[option.name];
            return (
              <fieldset
                key={option.name}
                className={`${styles['option']} ${showMissing && !chosen ? styles['option-missing'] : ''}`}
              >
                <legend className={styles['option-legend']}>
                  {option.name}
                  {chosen && (
                    <span className={styles['option-chosen']}>: {chosen}</span>
                  )}
                </legend>
                <div className={styles['option-values']}>
                  {option.values.map((value) => {
                    const soldOut = !isChoiceAvailable(
                      product,
                      {},
                      option.name,
                      value.label,
                    );
                    const fits = isChoiceAvailable(
                      product,
                      others,
                      option.name,
                      value.label,
                    );
                    return (
                      <button
                        key={value.label}
                        type="button"
                        aria-pressed={chosen === value.label}
                        aria-label={isColour ? value.label : undefined}
                        disabled={soldOut}
                        title={
                          soldOut
                            ? 'Sold out'
                            : fits
                              ? undefined
                              : 'Not available with your other choices'
                        }
                        onClick={() => choose(option, value.label)}
                        className={[
                          styles[isColour ? 'swatch' : 'chip'],
                          chosen === value.label && styles['selected'],
                          !fits && styles['unavailable'],
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {isColour ? (
                          <span
                            className={styles['swatch-colour']}
                            style={{ background: value.swatch ?? '#d4d4d8' }}
                          />
                        ) : (
                          value.label
                        )}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}

          {service && renderService?.(product)}

          <div className={styles['product-actions']}>
            {contactSeller ? (
              <ContactSeller
                product={product}
                choices={choices}
                available={inStock}
              />
            ) : (
              <>
                {showMissing && missing.length > 0 && (
                  <p role="alert" className={styles['choose-hint']}>
                    Choose your {listNames(missing)} first.
                  </p>
                )}
                <button
                  className={styles['add-to-cart-btn']}
                  onClick={handleAddToCart}
                  disabled={!inStock}
                >
                  {!inStock
                    ? 'Out of Stock'
                    : justAdded
                      ? 'Added to Cart ✓'
                      : 'Add to Cart'}
                </button>
              </>
            )}
            {onToggleWishlist && (
              <WishlistButton
                productName={product.name}
                active={isWishlisted}
                onToggle={() => onToggleWishlist(product)}
                showLabel
              />
            )}
          </div>

          {!contactSeller && (
            <section
              className={styles['payment']}
              aria-labelledby="ways-to-pay"
            >
              <h3 id="ways-to-pay">Ways to pay</h3>
              <ul>
                {paymentOptionsOf(product).map((option) => (
                  <li key={option}>
                    <strong>{paymentLabel(option)}</strong>
                    <span>{paymentDetail(option, price)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className={styles['product-description']}>
            <h2>Description</h2>
            {isRichText(product.description) ? (
              <div
                className={styles['rich-text']}
                // The shop API sanitises rich descriptions before sending them.
                dangerouslySetInnerHTML={{ __html: product.description }}
              />
            ) : (
              <p>{product.description}</p>
            )}
          </div>

          <div className={styles['product-details']}>
            <h3>{service ? 'Service Details' : 'Product Details'}</h3>
            <ul>
              {product.specs?.map((spec) => (
                <li key={spec.name}>
                  <strong>{spec.name}:</strong> {spec.value}
                </li>
              ))}
              {product.shopName && (
                <li>
                  <strong>{service ? 'Offered by:' : 'Sold by:'}</strong>{' '}
                  {product.shopName}
                </li>
              )}
              <li>
                <strong>Product ID:</strong> {product.id}
              </li>
              <li>
                <strong>Category:</strong> {product.category}
                {product.subCategory && ` › ${product.subCategory}`}
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
