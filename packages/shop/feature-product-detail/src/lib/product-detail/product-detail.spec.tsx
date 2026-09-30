import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
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

  it('should add the product to the cart and confirm briefly', () => {
    vi.useFakeTimers();
    vi.mocked(useProduct).mockReturnValue({
      product: mockProduct,
      loading: false,
      error: null,
    });
    const onAddToCart = vi.fn();

    render(<ProductDetail productId="1" onAddToCart={onAddToCart} />);

    fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));

    expect(onAddToCart).toHaveBeenCalledWith(mockProduct);
    expect(
      screen.getByRole('button', { name: 'Added to Cart ✓' }),
    ).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(
      screen.getByRole('button', { name: 'Add to Cart' }),
    ).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('should toggle the wishlist from the detail page', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: mockProduct,
      loading: false,
      error: null,
    });
    const onToggleWishlist = vi.fn();

    const { rerender } = render(
      <ProductDetail productId="1" onToggleWishlist={onToggleWishlist} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add to Wishlist' }));
    expect(onToggleWishlist).toHaveBeenCalledWith(mockProduct);

    rerender(
      <ProductDetail
        productId="1"
        isWishlisted
        onToggleWishlist={onToggleWishlist}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Remove from Wishlist' }),
    ).toHaveAttribute('aria-pressed', 'true');
  });

  describe('with colours and sizes', () => {
    const shoe = {
      ...mockProduct,
      id: 'shoe',
      name: 'Canvas Sneakers',
      price: 60,
      salePrice: 50,
      imageUrl: 'black.jpg',
      images: ['black.jpg', 'white.jpg'],
      specs: [{ name: 'Brand', value: 'Stride' }],
      subCategory: 'Shoes',
      shopName: 'Mama Shoes',
      options: [
        {
          name: 'Colour',
          values: [
            { label: 'Black', swatch: '#111111', imageIndex: 0 },
            { label: 'White', swatch: '#ffffff', imageIndex: 1 },
            { label: 'Red', swatch: '#dc2626' },
          ],
        },
        { name: 'Size', values: [{ label: '41' }, { label: '42' }] },
      ],
      variants: [
        { choices: { Colour: 'Black', Size: '41' }, stock: 8 },
        { choices: { Colour: 'Black', Size: '42' }, stock: 2, price: 55 },
        { choices: { Colour: 'White', Size: '41' }, stock: 0 },
        { choices: { Colour: 'White', Size: '42' }, stock: 4 },
        { choices: { Colour: 'Red', Size: '41' }, stock: 0 },
        { choices: { Colour: 'Red', Size: '42' }, stock: 0 },
      ],
      stock: 14,
    };

    beforeEach(() => {
      vi.mocked(useProduct).mockReturnValue({
        product: shoe,
        loading: false,
        error: null,
      });
    });

    const pick = (name: string) =>
      fireEvent.click(screen.getByRole('button', { name }));

    it('shows swatches, sizes, the price range and the specs', () => {
      render(<ProductDetail productId="shoe" />);

      expect(screen.getByRole('group', { name: 'Colour' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Red' })).toBeDisabled();
      expect(screen.getByRole('button', { name: '42' })).toBeEnabled();
      expect(screen.getByText('From')).toBeInTheDocument();
      expect(screen.getByText('$50.00')).toBeInTheDocument();
      expect(screen.getByText('$60.00')).toBeInTheDocument();
      expect(screen.getByText('Stride')).toBeInTheDocument();
      expect(screen.getByText('Mama Shoes')).toBeInTheDocument();
      expect(screen.getByText(/Electronics › Shoes/)).toBeInTheDocument();
    });

    it('asks for the missing choices before adding to the cart', () => {
      const onAddToCart = vi.fn();
      render(<ProductDetail productId="shoe" onAddToCart={onAddToCart} />);

      fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Choose your colour and size first.',
      );

      pick('Black');
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Choose your size first.',
      );
      expect(onAddToCart).not.toHaveBeenCalled();
    });

    it('prices and stocks the chosen combination and adds it', () => {
      const onAddToCart = vi.fn();
      render(<ProductDetail productId="shoe" onAddToCart={onAddToCart} />);

      pick('Black');
      pick('42');

      expect(screen.getByText('Colour')).toHaveTextContent('Colour: Black');
      expect(screen.getByRole('button', { name: '42' })).toHaveAttribute(
        'aria-pressed',
        'true',
      );
      expect(screen.getByText('$55.00')).toBeInTheDocument();
      expect(screen.getByText('✓ In Stock · only 2 left')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Add to Cart' }));
      expect(onAddToCart).toHaveBeenCalledWith(shoe, shoe.variants[1]);
    });

    it('switches to the colour photo and resets picks that no longer fit', () => {
      render(<ProductDetail productId="shoe" />);

      pick('41');
      expect(screen.getByRole('button', { name: 'White' })).toHaveAttribute(
        'title',
        'Not available with your other choices',
      );

      pick('White');
      expect(screen.getByAltText('Canvas Sneakers')).toHaveAttribute(
        'src',
        'white.jpg',
      );
      expect(screen.getByRole('button', { name: '41' })).toHaveAttribute(
        'aria-pressed',
        'false',
      );

      pick('Show photo 1');
      expect(screen.getByAltText('Canvas Sneakers')).toHaveAttribute(
        'src',
        'black.jpg',
      );
    });
  });

  it('shows the seller’s formatted description', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: {
        ...mockProduct,
        description:
          '<h2>Why you’ll love them</h2><p><span style="font-family:Georgia, serif;font-size:20px">Crisp sound</span> and <strong>30-hour</strong> battery.</p><ul><li><p>Noise cancelling</p></li></ul>',
      },
      loading: false,
      error: null,
    });
    render(<ProductDetail productId="1" />);

    expect(
      screen.getByRole('heading', { name: 'Why you’ll love them' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Crisp sound')).toHaveStyle({
      fontFamily: 'Georgia, serif',
      fontSize: '20px',
    });
    expect(screen.getByText('30-hour').tagName).toBe('STRONG');
    expect(screen.getByText('Noise cancelling').closest('ul li')).toBeTruthy();
  });

  it('lists the ways the seller accepts payment', () => {
    vi.mocked(useProduct).mockReturnValue({
      product: {
        ...mockProduct,
        paymentOptions: ['full_upfront', 'deposit', 'cash_on_delivery'],
      },
      loading: false,
      error: null,
    });
    render(<ProductDetail productId="1" />);

    const payment = screen.getByRole('region', { name: 'Ways to pay' });
    expect(payment).toHaveTextContent(
      'Full payment upfrontPay $99.99 when you order',
    );
    expect(payment).toHaveTextContent(
      '50% deposit$50.00 now, $49.99 on delivery',
    );
    expect(payment).toHaveTextContent(
      'Cash on deliveryPay $99.99 in cash when it arrives',
    );
    cleanup();

    vi.mocked(useProduct).mockReturnValue({
      product: mockProduct,
      loading: false,
      error: null,
    });
    render(<ProductDetail productId="1" />);
    expect(
      screen
        .getAllByRole('listitem')
        .filter((item) =>
          item.textContent?.includes('Pay $99.99 when you order'),
        ),
    ).toHaveLength(1);
    expect(screen.queryByText('Cash on delivery')).not.toBeInTheDocument();
  });

  describe('house listing', () => {
    const house = {
      ...mockProduct,
      id: 'house',
      name: 'Apartments in Kilimani',
      category: 'Property',
      subCategory: 'Houses for rent',
      price: 18000,
      shopName: 'Amina Homes',
      options: [
        {
          name: 'Unit type',
          values: [{ label: 'Bedsitter' }, { label: '2 bedrooms' }],
        },
      ],
      variants: [
        { choices: { 'Unit type': 'Bedsitter' }, stock: 3 },
        { choices: { 'Unit type': '2 bedrooms' }, stock: 1, price: 45000 },
      ],
      stock: 4,
      contact: { phone: '+254712345678', email: 'amina@example.com' },
    };

    const renderHouse = (product: object = house) => {
      vi.mocked(useProduct).mockReturnValue({
        product: product as typeof house,
        loading: false,
        error: null,
      });
      render(<ProductDetail productId="house" onAddToCart={vi.fn()} />);
    };

    it('offers call, WhatsApp and email instead of the cart', () => {
      renderHouse();

      expect(
        screen.queryByRole('button', { name: 'Add to Cart' }),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Interested? Contact Amina Homes')).toBeTruthy();
      expect(
        screen.getByRole('link', { name: 'Call +254712345678' }),
      ).toHaveAttribute('href', 'tel:+254712345678');
      expect(screen.getByRole('link', { name: 'Email' })).toHaveAttribute(
        'href',
        expect.stringContaining('mailto:amina@example.com?subject=Enquiry'),
      );
      expect(screen.getByText('From')).toBeInTheDocument();
      expect(screen.getByText('$18,000.00')).toBeInTheDocument();
      expect(screen.getByText('/ month')).toBeInTheDocument();
      expect(screen.getByText('✓ Available · 4 units')).toBeInTheDocument();
      expect(
        screen.queryByRole('region', { name: 'Ways to pay' }),
      ).not.toBeInTheDocument();
    });

    it('mentions the chosen unit in the WhatsApp message', () => {
      renderHouse();

      fireEvent.click(screen.getByRole('button', { name: '2 bedrooms' }));

      expect(screen.getByText('$45,000.00')).toBeInTheDocument();
      const whatsapp = screen.getByRole('link', { name: 'WhatsApp' });
      const url = new URL(whatsapp.getAttribute('href') ?? '');
      expect(url.origin + url.pathname).toBe('https://wa.me/254712345678');
      expect(url.searchParams.get('text')).toBe(
        'Hi, I\'m interested in "Apartments in Kilimani" (Unit type: 2 bedrooms) that I saw on MlimaLink. Is it still available?',
      );
    });

    it('explains when there is no way to reach the seller', () => {
      renderHouse({ ...house, contact: undefined });
      expect(
        screen.getByText('Amina Homes hasn’t shared contact details yet.'),
      ).toBeTruthy();

      cleanup();
      renderHouse({ ...house, inStock: false, stock: 0, variants: [] });
      expect(
        screen.getByText('This listing is no longer available.'),
      ).toBeTruthy();
      expect(
        screen.queryByRole('link', { name: 'WhatsApp' }),
      ).not.toBeInTheDocument();
    });
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
