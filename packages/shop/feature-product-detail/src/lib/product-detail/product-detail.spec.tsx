import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { ProductDetail } from './product-detail';
import { useProduct } from '@org/shop-data';

// Mock the hooks
vi.mock('@org/shop-data', () => ({
  useProduct: vi.fn(),
}));

const mockProduct = {
  id: '1',
  name: 'Wireless Bluetooth Headphones',
  description:
    'Premium wireless headphones with active noise cancellation and 30-hour battery life.',
  price: 99.99,
  category: 'Electronics',
  imageUrl: 'https://via.placeholder.com/600x400',
  inStock: true,
  rating: 4.5,
  reviewCount: 120,
};

describe('ProductDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state initially', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: null,
      loading: true,
      error: null,
    });

    render(<ProductDetail productId="1" />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render error state when product fails to load', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: null,
      loading: false,
      error: 'Failed to load product',
    });

    render(<ProductDetail productId="1" />);

    expect(screen.getByText('Failed to load product')).toBeInTheDocument();
  });

  it('should render product not found when product is null', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: null,
      loading: false,
      error: null,
    });

    render(<ProductDetail productId="1" />);

    expect(screen.getByText('Product not found')).toBeInTheDocument();
  });

  it('should render product details when loaded', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: mockProduct,
      loading: false,
      error: null,
    });

    render(<ProductDetail productId="1" />);

    expect(
      screen.getByText('Wireless Bluetooth Headphones'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Premium wireless headphones with active noise cancellation and 30-hour battery life.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('$99.99')).toBeInTheDocument();
    expect(screen.getAllByText('Electronics')[0]).toBeInTheDocument();
    expect(screen.getByText('✓ In Stock')).toBeInTheDocument();
    expect(screen.getByText('Add to Cart')).toBeInTheDocument();
  });

  it('should render out of stock state correctly', () => {
    const outOfStockProduct = { ...mockProduct, inStock: false };
    vi.mocked(useProduct).mockReturnValue({
      product: outOfStockProduct,
      loading: false,
      error: null,
    });

    render(<ProductDetail productId="1" />);

    expect(screen.getAllByText('Out of Stock')[0]).toBeInTheDocument();
    const addToCartButton = screen.getByRole('button', {
      name: 'Out of Stock',
    });
    expect(addToCartButton).toBeDisabled();
  });

  it('should display product details section', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: mockProduct,
      loading: false,
      error: null,
    });

    render(<ProductDetail productId="1" />);

    expect(screen.getByText('Product Details')).toBeInTheDocument();
    expect(screen.getByText(/Product ID:/)).toBeInTheDocument();
    expect(screen.getByText(/Category:/)).toBeInTheDocument();
    expect(screen.getByText(/Rating:/)).toBeInTheDocument();
    expect(screen.getByText(/4.5.*out of 5/)).toBeInTheDocument();
    expect(screen.getByText(/Reviews:/)).toBeInTheDocument();
    expect(screen.getByText(/120.*customer reviews/)).toBeInTheDocument();
  });

  it('should call onBack when the back button is clicked', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: mockProduct,
      loading: false,
      error: null,
    });
    const onBack = vi.fn();

    render(<ProductDetail productId="1" onBack={onBack} />);

    const backButton = screen.getByRole('button', {
      name: /back to products/i,
    });
    backButton.click();

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('should fetch product with the given productId', () => {
    const mockUseProduct = vi.fn().mockReturnValue({
      product: mockProduct,
      loading: false,
      error: null,
    });
    vi.mocked(useProduct).mockImplementation(mockUseProduct);

    render(<ProductDetail productId="42" />);

    expect(mockUseProduct).toHaveBeenCalledWith('42');
  });

  it('should render product image with alt text', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: mockProduct,
      loading: false,
      error: null,
    });

    render(<ProductDetail productId="1" />);

    const image = screen.getByAltText('Wireless Bluetooth Headphones');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://via.placeholder.com/600x400');
  });
});
