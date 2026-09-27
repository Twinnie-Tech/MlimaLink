import { useState, useEffect } from 'react';
import { Product, ProductFilter } from '@org/models';
import { useProducts, useCategories } from '@org/shop-data';
import { ProductGrid, LoadingSpinner, ErrorMessage } from '@org/shop-shared-ui';
import styles from './product-list.module.css';

export interface ProductListProps {
  onProductSelect?: (product: Product) => void;
  /** Search is owned by the caller (e.g. the app header); the list only applies it. */
  searchTerm?: string;
  /** Pass to control the category (e.g. from the URL); omit to let the list manage it. */
  category?: string;
  onCategoryChange?: (category: string) => void;
  isWishlisted?: (productId: string) => boolean;
  onToggleWishlist?: (product: Product) => void;
}

export function ProductList({
  onProductSelect,
  searchTerm = '',
  category,
  onCategoryChange,
  isWishlisted,
  onToggleWishlist,
}: ProductListProps = {}) {
  // Filter state
  const [internalCategory, setInternalCategory] = useState('');
  const selectedCategory = category ?? internalCategory;
  const [inStockOnly, setInStockOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<ProductFilter>({});

  // Fetch data
  const { products, totalProducts, totalPages, loading, error } = useProducts(
    filter,
    currentPage,
    12,
  );
  const { categories } = useCategories();

  // Update filter when filter inputs change
  useEffect(() => {
    const newFilter: ProductFilter = {};

    if (searchTerm) {
      newFilter.searchTerm = searchTerm;
    }
    if (selectedCategory) {
      newFilter.category = selectedCategory;
    }
    if (inStockOnly) {
      newFilter.inStock = true;
    }

    setFilter(newFilter);
    setCurrentPage(1); // Reset to first page when filter changes
  }, [searchTerm, selectedCategory, inStockOnly]);

  const handleProductSelect = (product: Product) => {
    onProductSelect?.(product);
  };

  const handleCategoryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (category === undefined) {
      setInternalCategory(e.target.value);
    }
    onCategoryChange?.(e.target.value);
  };

  const handleInStockChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInStockOnly(e.target.checked);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) {
      setCurrentPage(currentPage + 1);
    }
  };

  const handlePreviousPage = () => {
    if (currentPage > 1) {
      setCurrentPage(currentPage - 1);
    }
  };

  const handleRetry = () => {
    // Force re-fetch by updating a dummy state
    setFilter({ ...filter });
  };

  return (
    <div className={styles['product-list-container']}>
      <header className={styles['page-header']}>
        <h1>Our Products</h1>
        <p>Explore our wide selection of high-quality products</p>
      </header>

      <div className={styles['filters-section']}>
        <div className={styles['filter-controls']}>
          <select
            value={selectedCategory}
            onChange={handleCategoryChange}
            className={styles['filter-select']}
            aria-label="Filter by category"
          >
            <option value="">All Categories</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>

          <label className={styles['checkbox-label']}>
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={handleInStockChange}
            />
            In Stock Only
          </label>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : error ? (
        <ErrorMessage message={error} onRetry={handleRetry} />
      ) : (
        <>
          <div className={styles['results-info']}>
            Showing {products.length} of {totalProducts} products
            {searchTerm && <> for &ldquo;{searchTerm}&rdquo;</>}
          </div>

          <ProductGrid
            products={products}
            onProductSelect={handleProductSelect}
            isWishlisted={isWishlisted}
            onToggleWishlist={onToggleWishlist}
          />

          {totalPages > 1 && (
            <div className={styles['pagination']}>
              <button
                className={styles['btn-secondary']}
                disabled={currentPage === 1}
                onClick={handlePreviousPage}
              >
                Previous
              </button>
              <span className={styles['page-info']}>
                Page {currentPage} of {totalPages}
              </span>
              <button
                className={styles['btn-secondary']}
                disabled={currentPage === totalPages}
                onClick={handleNextPage}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default ProductList;
