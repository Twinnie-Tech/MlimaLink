import { act, fireEvent, render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Header } from '../src/app/shared/widgets/header';
import { SEARCH_DEBOUNCE_MS } from '../src/app/shared/widgets/search-box';
import { navItems } from '../src/configs/constants';
import {
  SHOP_STORAGE_KEY,
  ShopStoreProvider,
} from '../src/app/shared/store/shop-store';

const push = vi.fn();
const replace = vi.fn();
const navigation = { pathname: '/', search: '' };

const categoriesState = {
  categories: ['Electronics', 'Home & Garden'],
  loading: false,
  error: null as string | null,
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

vi.mock('@org/shop-data', () => ({
  useCategories: () => categoriesState,
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
    categoriesState.categories = ['Electronics', 'Home & Garden'];
    categoriesState.loading = false;
    categoriesState.error = null;
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

  it('keeps the selected category when searching on the products page', () => {
    navigation.pathname = '/products';
    navigation.search = 'category=Electronics';
    renderHeader();

    typeSearch('tv');
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));

    expect(replace).toHaveBeenCalledWith(
      '/products?category=Electronics&search=tv',
      { scroll: false },
    );
  });

  describe('navigation links', () => {
    it('renders every configured nav item', () => {
      renderHeader();

      const nav = screen.getByRole('navigation', { name: 'Main' });
      const links = Array.from(nav.querySelectorAll('a')).map((a) => [
        a.textContent,
        a.getAttribute('href'),
      ]);
      expect(links).toEqual(navItems.map((item) => [item.title, item.href]));
    });

    it('highlights the link for the current page', () => {
      navigation.pathname = '/products/42';
      renderHeader();

      expect(
        screen
          .getByRole('link', { name: 'Products' })
          .getAttribute('aria-current'),
      ).toBe('page');
      expect(
        screen.getByRole('link', { name: 'Home' }).getAttribute('aria-current'),
      ).toBeNull();
    });
  });

  describe('All Departments dropdown', () => {
    const toggle = () =>
      screen.getByRole('button', { name: /All Departments/ });

    it('is closed until the button is clicked', () => {
      renderHeader();

      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(screen.queryByRole('link', { name: 'Electronics' })).toBeNull();

      fireEvent.click(toggle());

      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      expect(
        screen.getByRole('link', { name: 'All Products' }).getAttribute('href'),
      ).toBe('/products');
      expect(
        screen.getByRole('link', { name: 'Electronics' }).getAttribute('href'),
      ).toBe('/products?category=Electronics');
      expect(
        screen
          .getByRole('link', { name: 'Home & Garden' })
          .getAttribute('href'),
      ).toBe('/products?category=Home%20%26%20Garden');
    });

    it('closes when a department is picked', () => {
      renderHeader();
      fireEvent.click(toggle());

      fireEvent.click(screen.getByRole('link', { name: 'Electronics' }));

      expect(screen.queryByRole('link', { name: 'Electronics' })).toBeNull();
    });

    it('closes on Escape and on clicks outside', () => {
      renderHeader();

      fireEvent.click(toggle());
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      expect(document.activeElement).toBe(toggle());

      fireEvent.click(toggle());
      fireEvent.mouseDown(document.body);
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });

    it('shows loading and error states', () => {
      categoriesState.loading = true;
      const { unmount } = renderHeader();
      fireEvent.click(toggle());
      expect(screen.getByText('Loading departments…')).toBeTruthy();
      unmount();

      categoriesState.loading = false;
      categoriesState.error = 'boom';
      renderHeader();
      fireEvent.click(toggle());
      expect(screen.getByText("Couldn't load departments.")).toBeTruthy();
    });
  });
});
