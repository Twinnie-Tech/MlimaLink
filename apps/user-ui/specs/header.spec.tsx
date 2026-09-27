import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Header } from '../src/app/shared/widgets/header';
import { SEARCH_DEBOUNCE_MS } from '../src/app/shared/widgets/search-box';
import {
  SHOP_STORAGE_KEY,
  ShopStoreProvider,
} from '../src/app/shared/store/shop-store';

const push = vi.fn();
const replace = vi.fn();
const navigation = { pathname: '/', search: '' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

function renderHeader() {
  return render(
    <ShopStoreProvider>
      <Header />
    </ShopStoreProvider>,
  );
}

function typeSearch(value: string) {
  fireEvent.change(screen.getByPlaceholderText('Search for products...'), {
    target: { value },
  });
}

describe('Header', () => {
  beforeEach(() => {
    push.mockClear();
    replace.mockClear();
    navigation.pathname = '/';
    navigation.search = '';
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the logo, search box and account links', () => {
    renderHeader();

    expect(
      screen.getByRole('link', { name: 'MlimaLink' }).getAttribute('href'),
    ).toBe('/');
    expect(screen.getByPlaceholderText('Search for products...')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Sign in' }).getAttribute('href'),
    ).toBe('/login');
    expect(
      screen
        .getByRole('link', { name: 'Wishlist, 0 items' })
        .getAttribute('href'),
    ).toBe('/wishlist');
    expect(
      screen.getByRole('link', { name: 'Cart, 0 items' }).getAttribute('href'),
    ).toBe('/cart');
  });

  it('shows saved wishlist and cart counts', async () => {
    localStorage.setItem(
      SHOP_STORAGE_KEY,
      JSON.stringify({
        wishlist: [{ id: '1' }, { id: '2' }],
        cart: [
          { product: { id: '1', price: 10 }, quantity: 3 },
          { product: { id: '3', price: 5 }, quantity: 1 },
        ],
      }),
    );

    renderHeader();

    expect(
      await screen.findByRole('link', { name: 'Wishlist, 2 items' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cart, 4 items' })).toBeTruthy();
  });

  it('filters the products page live as you type', () => {
    vi.useFakeTimers();
    navigation.pathname = '/products';
    renderHeader();

    typeSearch('wire');
    typeSearch('wireless');
    expect(replace).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/products?search=wireless', {
      scroll: false,
    });
    expect(push).not.toHaveBeenCalled();
  });

  it('opens the products page when typing from another page', () => {
    vi.useFakeTimers();
    renderHeader();

    typeSearch('shoes');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(push).toHaveBeenCalledWith('/products?search=shoes');
  });

  it('clears the search on the products page when the box is emptied', () => {
    vi.useFakeTimers();
    navigation.pathname = '/products';
    navigation.search = 'search=shoes';
    renderHeader();

    expect(
      screen.getByPlaceholderText<HTMLInputElement>('Search for products...')
        .value,
    ).toBe('shoes');

    typeSearch('');
    act(() => {
      vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
    });

    expect(replace).toHaveBeenCalledWith('/products', { scroll: false });
  });

  it('searches immediately on submit', () => {
    renderHeader();

    typeSearch('  running shoes ');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(push).toHaveBeenCalledWith('/products?search=running%20shoes');
  });
});
