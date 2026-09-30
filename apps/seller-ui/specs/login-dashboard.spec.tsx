import type { ReactElement } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SellerLoginPage from '../src/app/(routes)/login/page';
import SellerLandingPage from '../src/app/(routes)/page';
import DashboardLayout from '../src/app/dashboard/layout';
import SellerDashboardPage from '../src/app/dashboard/page';
import CreateProductPage from '../src/app/dashboard/create-product/page';
import SettingsPage from '../src/app/dashboard/settings/page';
import { THEME_STORAGE_KEY } from '../src/app/shared/theme/theme-script';
import {
  fill,
  installFetchMock,
  renderPage,
  reply,
  seller,
  sentBody,
  shop,
} from './test-utils';

const push = vi.fn();
const replace = vi.fn();
let pathname = '/dashboard';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname,
}));

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  pathname = '/dashboard';
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function signedIn(overrides: Partial<typeof seller> = {}) {
  reply('GET /api/auth/logged-in-seller', 200, {
    success: true,
    seller: { ...seller, shop, ...overrides },
  });
}

function renderDashboard(page: ReactElement) {
  return renderPage(<DashboardLayout>{page}</DashboardLayout>);
}

describe('Seller login', () => {
  function logIn() {
    fill('Email', 'amina@example.com');
    fill('Password', 'Secret123!');
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
  }

  it('sends a seller with a shop to the dashboard', async () => {
    reply('POST /api/auth/login/seller', 200, {
      success: true,
      message: 'ok',
      seller: { ...seller, shop },
    });
    renderPage(<SellerLoginPage />);

    logIn();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(sentBody('POST /api/auth/login/seller')).toEqual({
      email: 'amina@example.com',
      password: 'Secret123!',
      rememberMe: false,
    });
  });

  it('sends a seller without a shop back to sign-up', async () => {
    reply('POST /api/auth/login/seller', 200, {
      success: true,
      message: 'ok',
      seller,
    });
    renderPage(<SellerLoginPage />);

    logIn();

    await waitFor(() => expect(push).toHaveBeenCalledWith('/signup'));
  });

  it('links to the seller forgot password page', () => {
    renderPage(<SellerLoginPage />);

    expect(
      screen
        .getByRole('link', { name: 'Forgot password?' })
        .getAttribute('href'),
    ).toBe('/forgot-password');
  });

  it('shows the server error for wrong details', async () => {
    reply('POST /api/auth/login/seller', 400, {
      success: false,
      error: 'Invalid email or password!',
    });
    renderPage(<SellerLoginPage />);

    logIn();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Invalid email or password!',
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Seller landing page', () => {
  it('invites visitors to start selling', async () => {
    renderPage(<SellerLandingPage />);

    expect(
      (await screen.findByRole('link', { name: 'Start selling' })).getAttribute(
        'href',
      ),
    ).toBe('/signup');
  });

  it('sends a signed-in seller with a shop to the dashboard', async () => {
    signedIn();
    renderPage(<SellerLandingPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'));
  });
});

describe('Seller dashboard', () => {
  it('sends signed-out visitors to login', async () => {
    renderDashboard(<SellerDashboardPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.getByLabelText('Loading your dashboard')).toBeTruthy();
  });

  it('sends a seller without a shop to finish sign-up', async () => {
    signedIn({ shop: null });
    renderDashboard(<SellerDashboardPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/signup'));
  });

  it('refreshes an expired session before giving up', async () => {
    reply('POST /api/auth/refresh-token/seller', 200, { success: true });
    reply('GET /api/auth/logged-in-seller', 401, {
      success: false,
      error: 'Unauthorized! Token expired or invalid.',
    });
    signedIn();

    renderDashboard(<SellerDashboardPage />);

    expect(await screen.findByText('Welcome back, Amina')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('shows every sidebar section and marks the current page', async () => {
    pathname = '/dashboard/create-product';
    signedIn();
    renderDashboard(<CreateProductPage />);

    const nav = await screen.findByRole('navigation', {
      name: 'Seller dashboard',
    });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual([
      'Dashboard',
      'Orders',
      'Payments',
      'Create Product',
      'All Products',
      'Create Event',
      'All Events',
      'Inbox',
      'Settings',
      'Notifications',
      'Discount Codes',
    ]);
    expect(
      within(nav)
        .getByRole('link', { name: 'Create Product' })
        .getAttribute('aria-current'),
    ).toBe('page');
    expect(
      within(nav)
        .getByRole('link', { name: 'Dashboard' })
        .getAttribute('aria-current'),
    ).toBeNull();
  });

  it('switches between light and dark mode and remembers the choice', async () => {
    document.documentElement.classList.remove('dark');
    localStorage.clear();
    signedIn();
    renderDashboard(<SellerDashboardPage />);

    await screen.findByText('Welcome back, Amina');
    const toggles = screen.getAllByRole('switch', { name: 'Dark mode' });
    expect(
      toggles.map((toggle) => toggle.getAttribute('aria-checked')),
    ).toEqual(['false', 'false']);

    fireEvent.click(toggles[0]);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(
      toggles.map((toggle) => toggle.getAttribute('aria-checked')),
    ).toEqual(['true', 'true']);

    fireEvent.click(toggles[1]);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });

  it('logs the seller out from the sidebar', async () => {
    signedIn();
    reply('POST /api/auth/logout/seller', 200, {
      success: true,
      message: 'ok',
    });
    renderDashboard(<SellerDashboardPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Logout' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });

  it('shows the shop and payout status on the overview', async () => {
    signedIn();
    renderDashboard(<SellerDashboardPage />);

    expect(await screen.findByText('Welcome back, Amina')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mlima Fresh' })).toBeTruthy();
    expect(
      screen.getByText(/Mon – Tue: 08:00 – 18:00\s+Sat: 09:00 – 13:00/),
    ).toBeTruthy();
    expect(
      screen.getByText('Connect a bank account to receive payouts'),
    ).toBeTruthy();
    expect(screen.getByText('2 of 5 steps complete')).toBeTruthy();
  });

  it('confirms a connected bank account', async () => {
    signedIn({ stripeId: 'acct_123' });
    renderDashboard(<SellerDashboardPage />);

    expect(
      await screen.findByText('Bank account connected through Stripe'),
    ).toBeTruthy();
    expect(screen.getByText('3 of 5 steps complete')).toBeTruthy();
  });

  it('shows account details in settings', async () => {
    pathname = '/dashboard/settings';
    signedIn();
    renderDashboard(<SettingsPage />);

    expect(await screen.findByText('Kenya')).toBeTruthy();
    expect(screen.getByText('amina@example.com')).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Reset password' }).getAttribute('href'),
    ).toBe('/forgot-password');
  });
});
