import { fireEvent, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ProductListProps } from '@org/shop-feature-products';
import type { ProductDetailProps } from '@org/shop-feature-product-detail';
import type { Product } from '@org/models';
import ProductsPage from '../src/app/products/page';
import ProductDetailPage from '../src/app/products/[id]/page';
import { ShopStoreProvider } from '../src/app/shared/store/shop-store';

const push = vi.fn();
const replace = vi.fn();
const navigation = { search: 'search=shoes' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useParams: () => ({ id: '42' }),
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

const testProduct: Product = {
  id: '7',
  name: 'Test product',
  description: '',
  price: 1,
  category: 'Test',
  imageUrl: '',
  inStock: true,
  rating: 5,
  reviewCount: 1,
};

vi.mock('@org/shop-feature-products', () => ({
  ProductList: ({
    onProductSelect,
    searchTerm,
    category,
    onCategoryChange,
    isWishlisted,
    onToggleWishlist,
  }: ProductListProps) => (
    <div>
      <p>search: {searchTerm}</p>
      <p>category: {category}</p>
      <button onClick={() => onCategoryChange?.('Home & Garden')}>
        pick category
      </button>
      <button onClick={() => onCategoryChange?.('')}>clear category</button>
      <p>wishlisted: {String(isWishlisted?.('7'))}</p>
      <button onClick={() => onProductSelect?.(testProduct)}>
        select product
      </button>
      <button onClick={() => onToggleWishlist?.(testProduct)}>
        toggle wishlist
      </button>
    </div>
  ),
}));

vi.mock('@org/shop-feature-product-detail', () => ({
  ProductDetail: ({
    productId,
    onBack,
    onAddToCart,
    isWishlisted,
  }: ProductDetailProps) => (
    <div>
      <p>
        detail {productId} wishlisted: {String(isWishlisted)}
      </p>
      <button onClick={onBack}>back</button>
      <button onClick={() => onAddToCart?.({ ...testProduct, id: '42' })}>
        add to cart
      </button>
    </div>
  ),
}));

function renderWithStore(ui: React.ReactElement) {
  return render(<ShopStoreProvider>{ui}</ShopStoreProvider>);
}

describe('user-ui product pages', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    navigation.search = 'search=shoes';
    localStorage.clear();
  });

  it('navigates to the product detail page when a product is selected', () => {
    renderWithStore(<ProductsPage />);

    fireEvent.click(screen.getByText('select product'));

    expect(push).toHaveBeenCalledWith('/products/7');
  });

  it('passes the ?search= query from the header to ProductList', () => {
    renderWithStore(<ProductsPage />);

    expect(screen.getByText('search: shoes')).toBeTruthy();
  });

  it('passes ?category= to ProductList and keeps it in the URL', () => {
    navigation.search = 'search=shoes&category=Sports';
    renderWithStore(<ProductsPage />);

    expect(screen.getByText('category: Sports')).toBeTruthy();

    fireEvent.click(screen.getByText('pick category'));
    expect(replace).toHaveBeenLastCalledWith(
      '/products?search=shoes&category=Home%20%26%20Garden',
      { scroll: false },
    );

    fireEvent.click(screen.getByText('clear category'));
    expect(replace).toHaveBeenLastCalledWith('/products?search=shoes', {
      scroll: false,
    });
  });

  it('wires ProductList wishlist toggles to the store', () => {
    renderWithStore(<ProductsPage />);

    expect(screen.getByText('wishlisted: false')).toBeTruthy();
    fireEvent.click(screen.getByText('toggle wishlist'));
    expect(screen.getByText('wishlisted: true')).toBeTruthy();
  });

  it('passes the route id to ProductDetail and navigates back to the list', () => {
    renderWithStore(<ProductDetailPage />);

    expect(screen.getByText('detail 42 wishlisted: false')).toBeTruthy();
    fireEvent.click(screen.getByText('back'));

    expect(push).toHaveBeenCalledWith('/products');
  });
});
