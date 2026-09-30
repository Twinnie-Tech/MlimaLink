import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import type { Product } from '@org/models';
import {
  SHOP_STORAGE_KEY,
  ShopStoreProvider,
  cartLineId,
  useShopStore,
} from '../src/app/shared/store/shop-store';

const shoes: Product = {
  id: '1',
  name: 'Running Shoes',
  description: '',
  price: 80,
  category: 'Sports',
  imageUrl: '',
  inStock: true,
  rating: 4,
  reviewCount: 10,
};

const headphones: Product = {
  ...shoes,
  id: '2',
  name: 'Headphones',
  price: 25.5,
};

async function renderStore() {
  const hook = renderHook(() => useShopStore(), {
    wrapper: ShopStoreProvider,
  });
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

describe('shop store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('toggles products in and out of the wishlist', async () => {
    const { result } = await renderStore();

    act(() => result.current.toggleWishlist(shoes));
    expect(result.current.isWishlisted('1')).toBe(true);
    expect(result.current.wishlist).toEqual([shoes]);

    act(() => result.current.toggleWishlist(shoes));
    expect(result.current.isWishlisted('1')).toBe(false);
  });

  it('adds to the cart, merges quantities and totals the cart', async () => {
    const { result } = await renderStore();

    act(() => result.current.addToCart(shoes));
    act(() => result.current.addToCart(shoes));
    act(() => result.current.addToCart(headphones));

    expect(result.current.cart).toEqual([
      { product: shoes, quantity: 2 },
      { product: headphones, quantity: 1 },
    ]);
    expect(result.current.cartCount).toBe(3);
    expect(result.current.cartSubtotal).toBeCloseTo(185.5);
  });

  it('keeps quantities at least 1 and removes items', async () => {
    const { result } = await renderStore();

    act(() => result.current.addToCart(shoes));
    act(() => result.current.updateCartQuantity('1', 0));
    expect(result.current.cart[0].quantity).toBe(1);

    act(() => result.current.updateCartQuantity('1', 4));
    expect(result.current.cartCount).toBe(4);

    act(() => result.current.removeFromCart('1'));
    expect(result.current.cart).toEqual([]);
  });

  it('keeps each colour and size on its own line, priced per variant', async () => {
    const sneakers: Product = {
      ...shoes,
      id: '7',
      salePrice: 70,
      options: [
        { name: 'Colour', values: [{ label: 'Black' }, { label: 'White' }] },
        { name: 'Size', values: [{ label: '42' }] },
      ],
      variants: [
        { choices: { Colour: 'Black', Size: '42' }, stock: 3, sku: 'B42' },
        { choices: { Colour: 'White', Size: '42' }, stock: 3, price: 90 },
      ],
    };
    const [black, white] = sneakers.variants ?? [];
    const { result } = await renderStore();

    act(() => result.current.addToCart(sneakers, black));
    act(() => result.current.addToCart(sneakers, white));
    act(() => result.current.addToCart(sneakers, black));

    expect(result.current.cart).toEqual([
      {
        product: sneakers,
        quantity: 2,
        variant: { choices: black.choices, sku: 'B42' },
      },
      {
        product: sneakers,
        quantity: 1,
        variant: { choices: white.choices, price: 90 },
      },
    ]);
    expect(result.current.cartSubtotal).toBeCloseTo(2 * 70 + 90);

    const whiteLine = cartLineId(result.current.cart[1]);
    expect(whiteLine).not.toBe(cartLineId(result.current.cart[0]));

    act(() => result.current.updateCartQuantity(whiteLine, 3));
    expect(result.current.cart.map((item) => item.quantity)).toEqual([2, 3]);

    act(() => result.current.removeFromCart(whiteLine));
    expect(result.current.cart).toHaveLength(1);
    expect(result.current.cart[0].variant?.choices).toEqual(black.choices);
  });

  it('persists to and restores from localStorage', async () => {
    const first = await renderStore();
    act(() => first.result.current.toggleWishlist(shoes));
    act(() => first.result.current.addToCart(headphones));
    act(() => first.result.current.setDiscountCode(' harvest10 '));
    first.unmount();

    expect(JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY) ?? '{}')).toEqual({
      wishlist: [shoes],
      cart: [{ product: headphones, quantity: 1 }],
      discountCode: 'HARVEST10',
    });

    const { result } = await renderStore();
    expect(result.current.isWishlisted('1')).toBe(true);
    expect(result.current.cartCount).toBe(1);
    expect(result.current.discountCode).toBe('HARVEST10');
  });

  it('ignores corrupt saved data', async () => {
    localStorage.setItem(SHOP_STORAGE_KEY, '{not json');

    const { result } = await renderStore();

    expect(result.current.wishlist).toEqual([]);
    expect(result.current.cart).toEqual([]);
  });
});
