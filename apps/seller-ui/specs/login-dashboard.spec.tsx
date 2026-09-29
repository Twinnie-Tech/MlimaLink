import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SellerLoginPage from '../src/app/(routes)/login/page';
import SellerDashboardPage from '../src/app/page';
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

beforeEach(() => {
  push.mockClear();
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

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

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
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

describe('Seller dashboard', () => {
  it('invites visitors to start selling', async () => {
    renderPage(<SellerDashboardPage />);

    expect(
      (await screen.findByRole('link', { name: 'Start selling' })).getAttribute(
        'href',
      ),
    ).toBe('/signup');
  });

  it('refreshes an expired session before giving up', async () => {
    reply('POST /api/auth/refresh-token/seller', 200, { success: true });
    reply('GET /api/auth/logged-in-seller', 401, {
      success: false,
      error: 'Unauthorized! Token expired or invalid.',
    });
    reply('GET /api/auth/logged-in-seller', 200, {
      success: true,
      seller: { ...seller, shop },
    });

    renderPage(<SellerDashboardPage />);

    expect(await screen.findByText('Welcome back, Amina')).toBeTruthy();
  });

  it('shows the shop, account and payout status', async () => {
    reply('GET /api/auth/logged-in-seller', 200, {
      success: true,
      seller: { ...seller, shop },
    });

    renderPage(<SellerDashboardPage />);

    expect(await screen.findByText('Welcome back, Amina')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Mlima Fresh' })).toBeTruthy();
    expect(
      screen.getByText(/Mon – Tue: 08:00 – 18:00\s+Sat: 09:00 – 13:00/),
    ).toBeTruthy();
    expect(screen.getByText('Kenya')).toBeTruthy();
    expect(
      screen.getByText('Connect a bank account to receive payouts'),
    ).toBeTruthy();
  });

  it('confirms a connected bank account', async () => {
    reply('GET /api/auth/logged-in-seller', 200, {
      success: true,
      seller: { ...seller, shop, stripeId: 'acct_123' },
    });

    renderPage(<SellerDashboardPage />);

    expect(
      await screen.findByText('Bank account connected through Stripe'),
    ).toBeTruthy();
  });
});
