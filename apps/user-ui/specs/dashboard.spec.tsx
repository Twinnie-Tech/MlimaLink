import type { ReactElement } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import DashboardLayout from '../src/app/(routes)/dashboard/layout';
import DashboardPage from '../src/app/(routes)/dashboard/page';
import AddressesPage from '../src/app/(routes)/dashboard/addresses/page';
import DashboardCartPage from '../src/app/(routes)/dashboard/cart/page';
import ProfilePage from '../src/app/(routes)/dashboard/profile/page';
import SecurityPage from '../src/app/(routes)/dashboard/security/page';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { ShopStoreProvider } from '../src/app/shared/store/shop-store';
import { getLoggedInUser } from '../src/app/shared/utils/auth-api';

const push = vi.fn();
const replace = vi.fn();
let pathname = '/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname,
}));

const jane = {
  id: '1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'user',
  createdAt: '2026-03-15T10:00:00.000Z',
};

function product(id: string, name: string, price: number) {
  return {
    id,
    name,
    description: '',
    price,
    category: 'Food',
    imageUrl: `/images/${id}.jpg`,
    inStock: true,
    rating: 4,
    reviewCount: 1,
  };
}

type MockResponse = { status: number; body: unknown };
const fetchMock = vi.fn();

/** Responds to each /api/auth/<path> call from a queue per path. */
function routeAuth(routes: Record<string, MockResponse[]>) {
  fetchMock.mockImplementation(async (url: string) => {
    const path = url.replace('/api/auth/', '');
    const next = routes[path]?.shift() ?? { status: 404, body: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    };
  });
}

const unauthorized = { status: 401, body: { success: false, error: 'No' } };
const signedIn = { status: 200, body: { success: true, user: jane } };

function calledPaths() {
  return fetchMock.mock.calls.map(([url]) =>
    (url as string).replace('/api/auth/', ''),
  );
}

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  fetchMock.mockReset();
  localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getLoggedInUser', () => {
  it('returns the user for a valid session', async () => {
    routeAuth({ 'logged-in-user': [signedIn] });

    await expect(getLoggedInUser()).resolves.toEqual(jane);
    expect(calledPaths()).toEqual(['logged-in-user']);
  });

  it('refreshes an expired access token once and retries', async () => {
    routeAuth({
      'logged-in-user': [unauthorized, signedIn],
      'refresh-token': [{ status: 200, body: { success: true } }],
    });

    await expect(getLoggedInUser()).resolves.toEqual(jane);
    expect(calledPaths()).toEqual([
      'logged-in-user',
      'refresh-token',
      'logged-in-user',
    ]);
  });

  it('returns null when nobody is signed in', async () => {
    routeAuth({
      'logged-in-user': [unauthorized],
      'refresh-token': [unauthorized],
    });

    await expect(getLoggedInUser()).resolves.toBeNull();
  });

  it('surfaces server errors instead of treating them as signed out', async () => {
    routeAuth({
      'logged-in-user': [{ status: 500, body: {} }],
    });

    await expect(getLoggedInUser()).rejects.toThrow(/server is unavailable/);
  });
});

function renderDashboard(page: ReactElement = <DashboardPage />) {
  return render(
    <QueryProvider>
      <ShopStoreProvider>
        <DashboardLayout>{page}</DashboardLayout>
      </ShopStoreProvider>
    </QueryProvider>,
  );
}

function saveShop() {
  localStorage.setItem(
    'mlimalink-shop',
    JSON.stringify({
      wishlist: [product('a', 'Avocados', 4), product('b', 'Honey', 9.5)],
      cart: [{ product: product('a', 'Avocados', 4), quantity: 3 }],
    }),
  );
}

describe('Dashboard layout', () => {
  beforeEach(() => {
    pathname = '/dashboard';
  });

  it('sends visitors who are not signed in to the login page', async () => {
    routeAuth({
      'logged-in-user': [unauthorized],
      'refresh-token': [unauthorized],
    });
    renderDashboard();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.getByLabelText('Loading your dashboard')).toBeTruthy();
  });

  it('lists every account section with cart and wishlist counts', async () => {
    saveShop();
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard();

    const nav = await screen.findByRole('navigation', { name: 'My account' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/dashboard',
      '/dashboard/orders',
      '/dashboard/wishlist',
      '/dashboard/cart',
      '/dashboard/profile',
      '/dashboard/addresses',
      '/dashboard/notifications',
      '/dashboard/security',
      '/products',
      '/become-seller',
    ]);
    expect(
      within(nav).getByRole('link', { name: 'Wishlist 2 items' }),
    ).toBeTruthy();
    expect(
      within(nav).getByRole('link', { name: 'Cart 3 items' }),
    ).toBeTruthy();
    expect(
      within(nav)
        .getByRole('link', { name: 'Overview' })
        .getAttribute('aria-current'),
    ).toBe('page');
  });

  it('marks the current section', async () => {
    pathname = '/dashboard/security';
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard(<SecurityPage />);

    const nav = await screen.findByRole('navigation', { name: 'My account' });
    expect(
      within(nav)
        .getByRole('link', { name: 'Security' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(nav)
        .getByRole('link', { name: 'Overview' })
        .getAttribute('aria-current'),
    ).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Reset password' }).getAttribute('href'),
    ).toBe('/forgot-password');
  });

  it('logs out and returns to the login page', async () => {
    routeAuth({
      'logged-in-user': [signedIn],
      logout: [{ status: 200, body: { success: true, message: 'Bye' } }],
    });
    renderDashboard();

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(calledPaths()).toContain('logout');
  });
});

describe('Dashboard overview', () => {
  beforeEach(() => {
    pathname = '/dashboard';
  });

  it('shows the account summary and shopping counts', async () => {
    saveShop();
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard();

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Jane' }),
    ).toBeTruthy();
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('March 2026')).toBeTruthy();
    expect(screen.getByText('User')).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: /^Wishlist\s*2\s*Saved for later/ })
        .getAttribute('href'),
    ).toBe('/dashboard/wishlist');
    expect(
      screen
        .getByRole('link', { name: /^Cart items\s*3/ })
        .getAttribute('href'),
    ).toBe('/dashboard/cart');
    expect(replace).not.toHaveBeenCalled();
  });

  it('previews the wishlist and cart', async () => {
    saveShop();
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard();

    const honey = await screen.findByRole('link', { name: /Honey/ });
    expect(honey.getAttribute('href')).toBe('/products/b');
    expect(screen.getAllByText('$12.00').length).toBe(3);
    expect(
      screen.getByRole('link', { name: /View cart/ }).getAttribute('href'),
    ).toBe('/dashboard/cart');
  });

  it('shows empty states for a new shopper', async () => {
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard();

    expect(
      await screen.findByRole('heading', { name: 'No orders yet' }),
    ).toBeTruthy();
    expect(screen.getByText('Your cart is empty.')).toBeTruthy();
    expect(screen.getByText(/Nothing saved yet/)).toBeTruthy();
  });
});

describe('Dashboard sections', () => {
  it('manages the cart inside the dashboard', async () => {
    pathname = '/dashboard/cart';
    saveShop();
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard(<DashboardCartPage />);

    expect(await screen.findByTestId('cart-subtotal')).toBeTruthy();
    expect(screen.getByTestId('cart-subtotal').textContent).toBe('$12.00');

    fireEvent.click(
      screen.getByRole('button', { name: 'Increase quantity of Avocados' }),
    );

    expect(screen.getByTestId('cart-subtotal').textContent).toBe('$16.00');
    expect(screen.getByText('4 items in your cart')).toBeTruthy();
  });

  it('shows the profile details', async () => {
    pathname = '/dashboard/profile';
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard(<ProfilePage />);

    expect(
      await screen.findByRole('heading', { name: 'Jane Doe' }),
    ).toBeTruthy();
    expect(screen.getByText('User account')).toBeTruthy();
    expect(screen.getByText('March 2026')).toBeTruthy();
  });

  it('checks an address without pretending to save it', async () => {
    pathname = '/dashboard/addresses';
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard(<AddressesPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'Check address' }),
    );

    expect(await screen.findByText('Street address is required')).toBeTruthy();
    expect((screen.getByLabelText('Full name') as HTMLInputElement).value).toBe(
      'Jane Doe',
    );
    expect(screen.queryByRole('status')).toBeNull();

    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+254 712 345 678' },
    });
    fireEvent.change(screen.getByLabelText('Street address'), {
      target: { value: '12 Moi Avenue' },
    });
    fireEvent.change(screen.getByLabelText('Town / city'), {
      target: { value: 'Nairobi' },
    });
    fireEvent.change(screen.getByLabelText('County / region'), {
      target: { value: 'Nairobi' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Check address' }));

    expect((await screen.findByRole('status')).textContent).toContain(
      "This address wasn't saved",
    );
  });
});
