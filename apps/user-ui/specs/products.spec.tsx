import { fireEvent, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ProductListProps } from '@org/shop-feature-products';
import type { ProductDetailProps } from '@org/shop-feature-product-detail';
import ProductsPage from '../src/app/products/page';
import ProductDetailPage from '../src/app/products/[id]/page';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ id: '42' }),
}));

vi.mock('@org/shop-feature-products', () => ({
  ProductList: ({ onProductSelect }: ProductListProps) => (
    <button
      onClick={() =>
        onProductSelect?.({
          id: '7',
          name: 'Test product',
          description: '',
          price: 1,
          category: 'Test',
          imageUrl: '',
          inStock: true,
          rating: 5,
          reviewCount: 1,
        })
      }
    >
      select product
    </button>
  ),
}));

vi.mock('@org/shop-feature-product-detail', () => ({
  ProductDetail: ({ productId, onBack }: ProductDetailProps) => (
    <button onClick={onBack}>back from {productId}</button>
  ),
}));

describe('user-ui product pages', () => {
  beforeEach(() => {
    push.mockClear();
  });

  it('navigates to the product detail page when a product is selected', () => {
    render(<ProductsPage />);

    fireEvent.click(screen.getByText('select product'));

    expect(push).toHaveBeenCalledWith('/products/7');
  });

  it('passes the route id to ProductDetail and navigates back to the list', () => {
    render(<ProductDetailPage />);

    fireEvent.click(screen.getByText('back from 42'));

    expect(push).toHaveBeenCalledWith('/products');
  });
});
