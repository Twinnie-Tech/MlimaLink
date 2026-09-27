import { Product } from '@org/models';
import { ProductCard } from '../product-card/product-card';
import styles from './product-grid.module.css';

export interface ProductGridProps {
  products: Product[];
  onProductSelect: (product: Product) => void;
  isWishlisted?: (productId: string) => boolean;
  onToggleWishlist?: (product: Product) => void;
}

export function ProductGrid({
  products,
  onProductSelect,
  isWishlisted,
  onToggleWishlist,
}: ProductGridProps) {
  if (products.length === 0) {
    return (
      <div className={styles['empty-state']}>
        <p>No products found matching your criteria.</p>
      </div>
    );
  }

  return (
    <div className={styles['product-grid']}>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          product={product}
          onProductClick={onProductSelect}
          isWishlisted={isWishlisted?.(product.id) ?? false}
          onToggleWishlist={onToggleWishlist}
        />
      ))}
    </div>
  );
}

export default ProductGrid;
