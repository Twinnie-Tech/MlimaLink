import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import LoginPage from '../src/app/(routes)/login/page';
import SignupPage from '../src/app/(routes)/signup/page';
import ForgotPasswordPage from '../src/app/(routes)/forgot-password/page';
import { QueryProvider } from '../src/app/shared/providers/query-provider';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const fetchMock = vi.fn();

function respondWith(status: number, body: unknown) {
  fetchMock.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function lastRequest() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, body: JSON.parse(init.body as string) };
}

function renderPage(ui: React.ReactElement) {
  return render(<QueryProvider>{ui}</QueryProvider>);
}

function fill(label: string | RegExp, value: string) {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

beforeEach(() => {
  push.mockClear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Login page', () => {
  it('links to sign up and forgot password', () => {
    renderPage(<LoginPage />);

    expect(
      screen.getByRole('link', { name: 'Sign up' }).getAttribute('href'),
    ).toBe('/signup');
    expect(
      screen
        .getByRole('link', { name: 'Forgot Password?' })
        .getAttribute('href'),
    ).toBe('/forgot-password');
  });

  it('shows validation errors instead of submitting', async () => {
    renderPage(<LoginPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect(await screen.findByText('Email is required')).toBeTruthy();
    expect(screen.getByText('Password is required')).toBeTruthy();
    expect(screen.getByLabelText('Email').getAttribute('aria-invalid')).toBe(
      'true',
    );

    fill('Email', 'not-an-email');
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));
    expect(await screen.findByText('Enter a valid email address')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs in with remember me and goes to the shop', async () => {
    respondWith(200, { success: true, message: 'ok', user: { id: '1' } });
    renderPage(<LoginPage />);

    fill('Email', 'jane@example.com');
    fill('Password', 'Secret123!');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Remember me' }));
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/'));
    expect(lastRequest()).toEqual({
      url: '/api/auth/login/user',
      body: {
        email: 'jane@example.com',
        password: 'Secret123!',
        rememberMe: true,
      },
    });
  });

  it('shows the error returned by the server', async () => {
    respondWith(400, { success: false, error: 'Invalid email or password!' });
    renderPage(<LoginPage />);

    fill('Email', 'jane@example.com');
    fill('Password', 'wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Login' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Invalid email or password!',
    );
    expect(lastRequest().body.rememberMe).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it('toggles password visibility', () => {
    renderPage(<LoginPage />);
    const password = screen.getByLabelText('Password');

    expect(password.getAttribute('type')).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Show password' }));
    expect(password.getAttribute('type')).toBe('text');
  });

  it('explains that Google sign-in is not available yet', () => {
    renderPage(<LoginPage />);

    fireEvent.click(
      screen.getByRole('button', { name: 'Sign in with Google' }),
    );

    expect(screen.getByRole('alert').textContent).toMatch(/coming soon/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('Sign up page', () => {
  const details = {
    name: 'Jane Doe',
    email: 'jane@example.com',
    password: 'Secret123!',
  };

  async function submitDetails() {
    respondWith(200, { success: true, message: 'OTP sent' });
    fill('Name', details.name);
    fill('Email', details.email);
    fill('Password', details.password);
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    await screen.findByText('Enter verification code');
  }

  const otpInputs = () =>
    [1, 2, 3, 4].map((n) =>
      screen.getByLabelText<HTMLInputElement>(`Digit ${n} of 4`),
    );

  it('validates the password rules', async () => {
    renderPage(<SignupPage />);

    fill('Name', 'Jane');
    fill('Email', 'jane@example.com');
    fill('Password', 'password');
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    expect(
      await screen.findByText(/Use at least 8 characters with uppercase/),
    ).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends the OTP, then verifies it and goes to login', async () => {
    renderPage(<SignupPage />);

    await submitDetails();
    expect(lastRequest()).toEqual({
      url: '/api/auth/register/user',
      body: details,
    });
    expect(screen.getByText(details.email)).toBeTruthy();
    expect(screen.getByText('Resend code in 60s')).toBeTruthy();

    const verify = screen.getByRole('button', { name: 'Verify OTP' });
    expect((verify as HTMLButtonElement).disabled).toBe(true);

    const inputs = otpInputs();
    fireEvent.change(inputs[0], { target: { value: '1' } });
    expect(document.activeElement).toBe(inputs[1]);
    fireEvent.change(inputs[1], { target: { value: '2' } });
    fireEvent.change(inputs[2], { target: { value: 'x' } });
    expect(inputs[2].value).toBe('');
    fireEvent.change(inputs[2], { target: { value: '3' } });
    fireEvent.change(inputs[3], { target: { value: '4' } });

    respondWith(201, { success: true, message: 'created', user: {} });
    fireEvent.click(verify);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
    expect(lastRequest()).toEqual({
      url: '/api/auth/verify/user',
      body: { ...details, otp: '1234' },
    });
  });

  it('fills every box when a code is pasted and moves back on backspace', async () => {
    renderPage(<SignupPage />);
    await submitDetails();

    const inputs = otpInputs();
    fireEvent.paste(inputs[0], {
      clipboardData: { getData: () => ' 98-76 ' },
    });
    expect(inputs.map((i) => i.value)).toEqual(['9', '8', '7', '6']);

    fireEvent.change(inputs[3], { target: { value: '' } });
    fireEvent.keyDown(inputs[3], { key: 'Backspace' });
    expect(document.activeElement).toBe(inputs[2]);
  });

  it('shows OTP errors from the server', async () => {
    renderPage(<SignupPage />);
    await submitDetails();

    fireEvent.paste(otpInputs()[0], {
      clipboardData: { getData: () => '0000' },
    });
    respondWith(400, {
      success: false,
      error: 'Invalid OTP! 4 attempts remaining.',
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Invalid OTP! 4 attempts remaining.',
    );
    expect(push).not.toHaveBeenCalled();
  });

  it('lets you resend the code once the timer runs out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderPage(<SignupPage />);
    await submitDetails();

    for (let i = 0; i < 60; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
    }

    respondWith(200, { success: true, message: 'OTP sent' });
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }));

    expect(await screen.findByText('Resend code in 60s')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastRequest()).toEqual({
      url: '/api/auth/register/user',
      body: details,
    });
  });

  it('goes back to the details form to change the email', async () => {
    renderPage(<SignupPage />);
    await submitDetails();

    fireEvent.click(
      screen.getByRole('button', { name: 'Use a different email' }),
    );

    expect(screen.getByLabelText<HTMLInputElement>('Email').value).toBe(
      details.email,
    );
    expect(screen.queryByText('Enter verification code')).toBeNull();
  });
});

describe('Forgot password page', () => {
  it('sends the reset link and shows the confirmation', async () => {
    respondWith(200, {
      success: true,
      message:
        'If an account exists for this email, a password reset link has been sent.',
    });
    renderPage(<ForgotPasswordPage />);

    fill('Email', 'jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect((await screen.findByRole('status')).textContent).toMatch(
      /password reset link has been sent/,
    );
    expect(lastRequest()).toEqual({
      url: '/api/auth/forgot-password/user',
      body: { email: 'jane@example.com' },
    });
    expect(
      screen.getByRole('link', { name: 'Back to Login' }).getAttribute('href'),
    ).toBe('/login');
  });

  it('shows server errors such as the cooldown', async () => {
    respondWith(400, {
      success: false,
      error: 'Please wait 1 minute before requesting a new OTP!',
    });
    renderPage(<ForgotPasswordPage />);

    fill('Email', 'jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Please wait 1 minute before requesting a new OTP!',
    );
  });

  it('shows a friendly message when the server is down', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderPage(<ForgotPasswordPage />);

    fill('Email', 'jane@example.com');
    fireEvent.click(screen.getByRole('button', { name: 'Send reset link' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(
      /Could not reach the server/,
    );
  });
});
