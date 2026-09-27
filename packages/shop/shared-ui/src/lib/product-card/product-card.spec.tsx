import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProductCard } from './product-card';
import { createMockProduct } from '@org/shared-test-utils';

describe('ProductCard', () => {
  const mockProduct = createMockProduct();
  const mockOnClick = vi.fn();

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render product information', () => {
    render(<ProductCard product={mockProduct} onProductClick={mockOnClick} />);

    expect(screen.getByText('Test Product')).toBeInTheDocument();
    expect(screen.getByText('Electronics')).toBeInTheDocument();
    expect(screen.getByText('$99.99')).toBeInTheDocument();
    expect(screen.getByText('(100)')).toBeInTheDocument();
  });

  it('should display product image', () => {
    render(<ProductCard product={mockProduct} onProductClick={mockOnClick} />);

    const image = screen.getByAltText('Test Product');
    expect(image).toBeInTheDocument();
    expect(image).toHaveAttribute('src', 'https://example.com/image.jpg');
  });

  it('should show rating stars', () => {
    render(<ProductCard product={mockProduct} onProductClick={mockOnClick} />);

    const stars = screen.getAllByText('★');
    expect(stars).toHaveLength(5);
    // 4.5 rating means 4 filled stars
    const filledStars = stars.filter((star) =>
      star.className.includes('filled'),
    );
    expect(filledStars).toHaveLength(4);
  });

  it('should call onProductClick when card is clicked', () => {
    render(<ProductCard product={mockProduct} onProductClick={mockOnClick} />);

    const card = screen.getByRole('button', {
      name: /View details for Test Product/i,
    });
    fireEvent.click(card);

    expect(mockOnClick).toHaveBeenCalledWith(mockProduct);
    expect(mockOnClick).toHaveBeenCalledTimes(1);
  });

  it('should call onProductClick when Enter key is pressed', () => {
    render(<ProductCard product={mockProduct} onProductClick={mockOnClick} />);

    const card = screen.getByRole('button', {
      name: /View details for Test Product/i,
    });
    fireEvent.keyDown(card, { key: 'Enter' });

    expect(mockOnClick).toHaveBeenCalledWith(mockProduct);
  });

  it('should call onProductClick when Space key is pressed', () => {
    render(<ProductCard product={mockProduct} onProductClick={mockOnClick} />);

    const card = screen.getByRole('button', {
      name: /View details for Test Product/i,
    });
    fireEvent.keyDown(card, { key: ' ' });

    expect(mockOnClick).toHaveBeenCalledWith(mockProduct);
  });

  it('should show out of stock overlay when product is not in stock', () => {
    const outOfStockProduct = createMockProduct({ inStock: false });
    render(
      <ProductCard product={outOfStockProduct} onProductClick={mockOnClick} />,
    );

    expect(screen.getByText('Out of Stock')).toBeInTheDocument();
    const card = screen.getByRole('button');
    // CSS modules generate unique class names, check if class attribute contains 'out-of-stock'
    expect(card.className).toMatch(/out-of-stock/);
  });

  it('should not render a wishlist button without onToggleWishlist', () => {
    render(<ProductCard product={mockProduct} onProductClick={mockOnClick} />);

    expect(
      screen.queryByRole('button', { name: /wishlist/i }),
    ).not.toBeInTheDocument();
  });

  it('should toggle the wishlist without opening the product', () => {
    const onToggleWishlist = vi.fn();
    render(
      <ProductCard
        product={mockProduct}
        onProductClick={mockOnClick}
        onToggleWishlist={onToggleWishlist}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Add Test Product to wishlist' }),
    );

    expect(onToggleWishlist).toHaveBeenCalledWith(mockProduct);
    expect(mockOnClick).not.toHaveBeenCalled();
  });

  it('should show the wishlisted state', () => {
    render(
      <ProductCard
        product={mockProduct}
        onProductClick={mockOnClick}
        isWishlisted
        onToggleWishlist={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Remove Test Product from wishlist' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  it('should have proper accessibility attributes', () => {
    render(<ProductCard product={mockProduct} onProductClick={mockOnClick} />);

    const card = screen.getByRole('button');
    expect(card).toHaveAttribute('tabIndex', '0');
    expect(card).toHaveAttribute('role', 'button');
    expect(card).toHaveAttribute('aria-label', 'View details for Test Product');
  });
});
