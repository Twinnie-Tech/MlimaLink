import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
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

function saveState(state: { wishlist?: Product[]; cart?: unknown[] }) {
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
});
