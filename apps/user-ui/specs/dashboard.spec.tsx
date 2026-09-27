import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import DashboardPage from '../src/app/(routes)/dashboard/page';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { ShopStoreProvider } from '../src/app/shared/store/shop-store';
import { getLoggedInUser } from '../src/app/shared/utils/auth-api';

const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
}));

const jane = {
  id: '1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'user',
  createdAt: '2026-03-15T10:00:00.000Z',
};

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

describe('Dashboard page', () => {
  function renderDashboard() {
    return render(
      <QueryProvider>
        <ShopStoreProvider>
          <DashboardPage />
        </ShopStoreProvider>
      </QueryProvider>,
    );
  }

  it('sends visitors who are not signed in to the login page', async () => {
    routeAuth({
      'logged-in-user': [unauthorized],
      'refresh-token': [unauthorized],
    });
    renderDashboard();

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
  });

  it('shows the account details and shopping counts', async () => {
    localStorage.setItem(
      'mlimalink-shop',
      JSON.stringify({
        wishlist: [{ id: 'a' }, { id: 'b' }],
        cart: [{ product: { id: 'a', price: 1 }, quantity: 3 }],
      }),
    );
    routeAuth({ 'logged-in-user': [signedIn] });
    renderDashboard();

    expect(
      await screen.findByRole('heading', { name: 'Welcome back, Jane' }),
    ).toBeTruthy();
    expect(screen.getAllByText('jane@example.com').length).toBeGreaterThan(0);
    expect(screen.getByText('March 2026')).toBeTruthy();
    expect(screen.getByText('User')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: /Wishlist\s*2/ }).getAttribute('href'),
    ).toBe('/wishlist');
    expect(
      screen.getByRole('link', { name: /Cart items\s*3/ }).getAttribute('href'),
    ).toBe('/cart');
    expect(replace).not.toHaveBeenCalled();
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
