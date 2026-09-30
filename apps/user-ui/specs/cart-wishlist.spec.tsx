import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Product } from '@org/models';
import CartPage from '../src/app/cart/page';
import WishlistPage from '../src/app/wishlist/page';
import {
  SHOP_STORAGE_KEY,
  ShopStoreProvider,
} from '../src/app/shared/store/shop-store';

const shoes: Product = {
  id: '1',
  name: 'Running Shoes',
  description: '',
  price: 80,
  category: 'Sports',
  imageUrl: 'https://example.com/shoes.jpg',
  inStock: true,
  rating: 4,
  reviewCount: 10,
};

function renderWithStore(ui: React.ReactElement) {
  return render(<ShopStoreProvider>{ui}</ShopStoreProvider>);
}

function saveState(state: {
  wishlist?: Product[];
  cart?: unknown[];
  discountCode?: string;
}) {
  localStorage.setItem(
    SHOP_STORAGE_KEY,
    JSON.stringify({ wishlist: [], cart: [], ...state }),
  );
}

describe('cart page', () => {
  beforeEach(() => localStorage.clear());

  it('shows an empty state with no items', async () => {
    renderWithStore(<CartPage />);

    expect(await screen.findByText('Your cart is empty')).toBeTruthy();
  });

  it('lists items and updates quantity and subtotal', async () => {
    saveState({ cart: [{ product: shoes, quantity: 1 }] });
    renderWithStore(<CartPage />);

    expect(await screen.findByText('Running Shoes')).toBeTruthy();
    expect(screen.getByTestId('cart-subtotal').textContent).toBe('$80.00');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Increase quantity of Running Shoes',
      }),
    );

    expect(
      screen.getByRole('status', { name: 'Quantity of Running Shoes' })
        .textContent,
    ).toBe('2');
    expect(screen.getByTestId('cart-subtotal').textContent).toBe('$160.00');
  });

  it('removes items from the cart', async () => {
    saveState({ cart: [{ product: shoes, quantity: 2 }] });
    renderWithStore(<CartPage />);

    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Remove Running Shoes from cart',
      }),
    );

    expect(screen.getByText('Your cart is empty')).toBeTruthy();
  });

  it('shows the chosen colour and size, its photo and its price on each line', async () => {
    const sneakers: Product = {
      ...shoes,
      images: ['https://example.com/black.jpg', 'https://example.com/red.jpg'],
      options: [
        {
          name: 'Colour',
          values: [
            { label: 'Black', imageIndex: 0 },
            { label: 'Red', imageIndex: 1 },
          ],
        },
        { name: 'Size', values: [{ label: '42' }] },
      ],
    };
    saveState({
      cart: [
        {
          product: sneakers,
          quantity: 1,
          variant: { choices: { Colour: 'Black', Size: '42' } },
        },
        {
          product: sneakers,
          quantity: 2,
          variant: { choices: { Colour: 'Red', Size: '42' }, price: 95 },
        },
      ],
    });
    renderWithStore(<CartPage />);

    expect(await screen.findByText('Colour: Red · Size: 42')).toBeTruthy();
    expect(screen.getByText('Colour: Black · Size: 42')).toBeTruthy();
    expect(screen.getAllByAltText('Running Shoes')[1].getAttribute('src')).toBe(
      'https://example.com/red.jpg',
    );
    expect(screen.getByText('$95.00 each')).toBeTruthy();
    expect(screen.getByTestId('cart-subtotal').textContent).toBe('$270.00');

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Running Shoes (Colour: Red · Size: 42) from cart',
      }),
    );
    expect(screen.getByTestId('cart-subtotal').textContent).toBe('$80.00');
  });

  it('lets the shopper choose how to pay for each line', async () => {
    const flexible: Product = {
      ...shoes,
      paymentOptions: ['full_upfront', 'deposit', 'cash_on_delivery'],
    };
    const hat: Product = { ...shoes, id: '2', name: 'Sun Hat', price: 20 };
    saveState({
      cart: [
        { product: flexible, quantity: 2 },
        { product: hat, quantity: 1 },
      ],
    });
    renderWithStore(<CartPage />);

    const select = (await screen.findByLabelText(
      'How to pay for Running Shoes',
    )) as HTMLSelectElement;
    expect(
      Array.from(select.options).map((option) => option.textContent),
    ).toEqual(['Full payment upfront', '50% deposit', 'Cash on delivery']);
    expect(
      screen.getByText('Full payment upfront', { selector: 'span' }),
    ).toBeTruthy();
    expect(screen.queryByTestId('cart-pay-now')).toBeNull();

    fireEvent.change(select, { target: { value: 'deposit' } });

    expect(screen.getByTestId('cart-total').textContent).toBe('$180.00');
    expect(screen.getByTestId('cart-pay-now').textContent).toBe('$100.00');
    expect(screen.getByTestId('cart-pay-on-delivery').textContent).toBe(
      '$80.00',
    );
    expect(
      JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY) ?? '{}').cart[0]
        .paymentOption,
    ).toBe('deposit');

    fireEvent.change(select, { target: { value: 'cash_on_delivery' } });
    expect(screen.getByTestId('cart-pay-now').textContent).toBe('$20.00');
    expect(screen.getByTestId('cart-pay-on-delivery').textContent).toBe(
      '$160.00',
    );
  });

  describe('discount codes', () => {
    const fetchMock = vi.fn();
    const hat: Product = { ...shoes, id: '2', name: 'Sun Hat', price: 20 };

    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
    });
    afterEach(() => vi.unstubAllGlobals());

    const answer = (status: number, body: unknown) =>
      fetchMock.mockResolvedValueOnce({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
      });

    it('applies a code the server confirms and spreads it over the covered lines', async () => {
      answer(200, {
        success: true,
        data: {
          code: 'HARVEST10',
          shopName: 'Mlima Boutique',
          type: 'percentage',
          value: 10,
          amount: 16,
          lines: [{ index: 0, total: 160 }],
        },
      });
      saveState({
        cart: [
          { product: shoes, quantity: 2 },
          { product: hat, quantity: 1 },
        ],
      });
      renderWithStore(<CartPage />);

      fireEvent.change(await screen.findByLabelText('Discount code'), {
        target: { value: ' harvest10 ' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

      expect(await screen.findByText('You save $16.00.')).toBeTruthy();
      expect(screen.getByTestId('cart-discount').textContent).toBe('−$16.00');
      expect(screen.getByTestId('cart-total').textContent).toBe('$164.00');
      expect(screen.getByText('−$16.00 with HARVEST10')).toBeTruthy();
      expect(screen.getByText(/10% off Mlima Boutique/)).toBeTruthy();

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('/api/discount-codes/apply');
      expect(JSON.parse(init.body)).toEqual({
        code: 'HARVEST10',
        items: [
          { productId: '1', quantity: 2 },
          { productId: '2', quantity: 1 },
        ],
      });
      expect(
        JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY) ?? '{}').discountCode,
      ).toBe('HARVEST10');

      fireEvent.click(
        screen.getByRole('button', { name: 'Remove code HARVEST10' }),
      );
      expect(screen.queryByTestId('cart-discount')).toBeNull();
      expect(screen.getByTestId('cart-total').textContent).toBe('$180.00');
    });

    it('shows why a code was turned down and takes nothing off', async () => {
      answer(400, {
        success: false,
        error:
          'Spend $50.00 on Mlima Boutique products to use this code. You have $20.00 so far.',
      });
      saveState({ cart: [{ product: hat, quantity: 1 }] });
      renderWithStore(<CartPage />);

      fireEvent.change(await screen.findByLabelText('Discount code'), {
        target: { value: 'BIGSPEND' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

      expect((await screen.findByRole('alert')).textContent).toBe(
        'Spend $50.00 on Mlima Boutique products to use this code. You have $20.00 so far.',
      );
      expect(screen.queryByTestId('cart-discount')).toBeNull();
      expect(screen.getByTestId('cart-total').textContent).toBe('$20.00');
    });

    it('checks the saved code again when the cart changes', async () => {
      const applied = (amount: number, total: number) => ({
        success: true,
        data: {
          code: 'SAVE5',
          shopName: 'Mlima Boutique',
          type: 'fixed',
          value: 5,
          amount,
          lines: [{ index: 0, total }],
        },
      });
      answer(200, applied(5, 20));
      answer(200, applied(5, 40));
      saveState({
        cart: [{ product: hat, quantity: 1 }],
        discountCode: 'SAVE5',
      });
      renderWithStore(<CartPage />);

      expect(await screen.findByText('You save $5.00.')).toBeTruthy();
      fireEvent.click(
        screen.getByRole('button', { name: 'Increase quantity of Sun Hat' }),
      );
      expect(await screen.findByText('Checking your code…')).toBeTruthy();
      await waitFor(() =>
        expect(screen.getByTestId('cart-total').textContent).toBe('$35.00'),
      );
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).items).toEqual([
        { productId: '2', quantity: 2 },
      ]);
    });
  });
});

describe('wishlist page', () => {
  beforeEach(() => localStorage.clear());

  it('shows an empty state with no items', async () => {
    renderWithStore(<WishlistPage />);

    expect(await screen.findByText('Your wishlist is empty')).toBeTruthy();
  });

  it('adds a wishlisted product to the cart and removes it from the wishlist', async () => {
    saveState({ wishlist: [shoes] });
    renderWithStore(<WishlistPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Add to cart/ }));
    expect(
      JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY) ?? '{}').cart,
    ).toEqual([{ product: shoes, quantity: 1 }]);
    expect(screen.getByRole('button', { name: /Add another/ })).toBeTruthy();

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Remove Running Shoes from wishlist',
      }),
    );
    expect(screen.getByText('Your wishlist is empty')).toBeTruthy();
  });

  it('sends products with options to the product page to choose them', async () => {
    saveState({
      wishlist: [
        {
          ...shoes,
          options: [{ name: 'Size', values: [{ label: '42' }] }],
          variants: [{ choices: { Size: '42' }, stock: 1 }],
        },
      ],
    });
    renderWithStore(<WishlistPage />);

    const link = await screen.findByRole('link', { name: /Choose options/ });
    expect(link.getAttribute('href')).toBe('/products/1');
    expect(screen.queryByRole('button', { name: /Add to cart/ })).toBeNull();
  });

  it('sends house and car listings to the product page to contact the seller', async () => {
    saveState({
      wishlist: [
        {
          ...shoes,
          name: 'Bedsitter in Ruaka',
          category: 'Property',
          subCategory: 'Houses for rent',
          price: 9500,
        },
      ],
    });
    renderWithStore(<WishlistPage />);

    const link = await screen.findByRole('link', { name: /Contact seller/ });
    expect(link.getAttribute('href')).toBe('/products/1');
    expect(screen.getByText('$9,500.00 / month')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Add to cart/ })).toBeNull();
  });
});
