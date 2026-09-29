import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SellerForgotPasswordPage from '../src/app/(routes)/forgot-password/page';
import {
  fetchMock,
  fill,
  installFetchMock,
  renderPage,
  reply,
  sentBody,
} from './test-utils';

const SENT_MESSAGE =
  'If an account exists for this email, a password reset link has been sent.';

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function requestLink(email = 'amina@example.com') {
  fill('Seller account email', email);
  fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));
}

describe('Seller forgot password', () => {
  it('requests a seller reset link and confirms it was sent', async () => {
    reply('POST /api/auth/forgot-password/seller', 200, {
      success: true,
      message: SENT_MESSAGE,
    });
    renderPage(<SellerForgotPasswordPage />);

    requestLink();

    expect((await screen.findByRole('status')).textContent).toBe(SENT_MESSAGE);
    expect(sentBody('POST /api/auth/forgot-password/seller')).toEqual({
      email: 'amina@example.com',
    });
    expect(screen.getByText('amina@example.com')).toBeTruthy();
  });

  it('never calls the buyer reset endpoint', async () => {
    reply('POST /api/auth/forgot-password/seller', 200, {
      success: true,
      message: SENT_MESSAGE,
    });
    renderPage(<SellerForgotPasswordPage />);

    requestLink();
    await screen.findByRole('status');

    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).not.toContain('/api/auth/forgot-password/user');
  });

  it('checks the email before sending', async () => {
    renderPage(<SellerForgotPasswordPage />);

    requestLink('not-an-email');

    expect(
      await screen.findByText('Enter a valid email address'),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shows the server error, e.g. when rate limited', async () => {
    reply('POST /api/auth/forgot-password/seller', 400, {
      success: false,
      error: 'Please wait 1 minute before requesting a new OTP!',
    });
    renderPage(<SellerForgotPasswordPage />);

    requestLink();

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Please wait 1 minute before requesting a new OTP!',
    );
  });

  it('lets the seller try a different email', async () => {
    reply('POST /api/auth/forgot-password/seller', 200, {
      success: true,
      message: SENT_MESSAGE,
    });
    renderPage(<SellerForgotPasswordPage />);

    requestLink();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Try a different email' }),
    );

    expect(screen.getByLabelText('Seller account email')).toBeTruthy();
  });
});
