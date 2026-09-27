import { test, expect, type Page } from '@playwright/test';

/** Auth responses are mocked so these tests don't need Redis, the database or email. */
async function mockAuth(
  page: Page,
  path: string,
  status: number,
  body: Record<string, unknown>,
) {
  const requests: unknown[] = [];
  await page.route(`**/api/auth/${path}`, async (route) => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ status, json: body });
  });
  return requests;
}

test.describe('Login page', () => {
  test('is reachable from the header and validates fields', async ({
    page,
  }) => {
    await page.goto('/products');
    await page.getByRole('link', { name: 'Sign in' }).click();
    await page.waitForURL('**/login');

    await expect(
      page.getByRole('heading', { name: 'Login to MlimaLink' }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Login', exact: true }).click();
    await expect(page.getByText('Email is required')).toBeVisible();
    await expect(page.getByText('Password is required')).toBeVisible();
  });

  test('shows server errors and logs in', async ({ page }) => {
    await page.goto('/login');

    await mockAuth(page, 'login/user', 400, {
      success: false,
      error: 'Invalid email or password!',
    });
    await page.getByLabel('Email').fill('jane@example.com');
    await page.getByLabel('Password', { exact: true }).fill('Wrong123!');
    await page.getByRole('button', { name: 'Login', exact: true }).click();
    // Next.js renders its own empty role="alert" route announcer, so match by text.
    await expect(
      page.getByRole('alert').filter({ hasText: 'Invalid email or password!' }),
    ).toBeVisible();

    await page.unroute('**/api/auth/login/user');
    const requests = await mockAuth(page, 'login/user', 200, {
      success: true,
      message: 'User logged in successfully',
      user: { id: '1', name: 'Jane', email: 'jane@example.com', role: 'user' },
    });
    await page.getByRole('checkbox', { name: 'Remember me' }).check();
    await page.getByRole('button', { name: 'Login', exact: true }).click();

    await page.waitForURL('**/products');
    expect(requests).toEqual([
      { email: 'jane@example.com', password: 'Wrong123!', rememberMe: true },
    ]);

    // The header switches to the signed-in user straight away.
    await expect(
      page.getByRole('link', {
        name: 'Your dashboard, signed in as Jane',
      }),
    ).toHaveAttribute('href', '/dashboard');
  });
});

test.describe('Dashboard', () => {
  const jane = {
    id: '1',
    name: 'Jane Doe',
    email: 'jane@example.com',
    role: 'user',
    createdAt: '2026-03-15T10:00:00.000Z',
  };

  test('shows the user in the header, opens the dashboard and logs out', async ({
    page,
  }) => {
    let signedIn = true;
    await page.route('**/api/auth/logged-in-user', (route) =>
      signedIn
        ? route.fulfill({ status: 200, json: { success: true, user: jane } })
        : route.fulfill({ status: 401, json: { success: false } }),
    );
    await page.route('**/api/auth/refresh-token', (route) =>
      route.fulfill({ status: 401, json: { success: false } }),
    );
    await page.route('**/api/auth/logout', (route) => {
      signedIn = false;
      return route.fulfill({
        status: 200,
        json: { success: true, message: 'Logged out successfully' },
      });
    });

    await page.goto('/products');
    const profile = page.getByRole('link', {
      name: 'Your dashboard, signed in as Jane Doe',
    });
    await expect(profile).toContainText('Jane');
    await profile.click();
    await page.waitForURL('**/dashboard');

    await expect(
      page.getByRole('heading', { name: 'Welcome back, Jane' }),
    ).toBeVisible();
    await expect(page.getByText('March 2026')).toBeVisible();

    await page.getByRole('button', { name: 'Log out' }).click();
    await page.waitForURL('**/login');
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });

  test('redirects to login when nobody is signed in', async ({ page }) => {
    await page.route('**/api/auth/logged-in-user', (route) =>
      route.fulfill({ status: 401, json: { success: false } }),
    );
    await page.route('**/api/auth/refresh-token', (route) =>
      route.fulfill({ status: 401, json: { success: false } }),
    );

    await page.goto('/dashboard');
    await page.waitForURL('**/login');
  });
});

test.describe('Sign up page', () => {
  test('sends an OTP and verifies it', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Sign up' }).click();
    await page.waitForURL('**/signup');

    const registerRequests = await mockAuth(page, 'register/user', 200, {
      success: true,
      message: 'OTP sent successfully. Please check your email.',
    });
    const verifyRequests = await mockAuth(page, 'verify/user', 201, {
      success: true,
      message: 'User verified and registered successfully',
      user: {},
    });

    await page.getByLabel('Name').fill('Jane Doe');
    await page.getByLabel('Email').fill('jane@example.com');
    const signUpButton = page.getByRole('button', {
      name: 'Sign Up',
      exact: true,
    });
    await page.getByLabel('Password', { exact: true }).fill('weak');
    await signUpButton.click();
    await expect(
      page.getByText(/Use at least 8 characters with uppercase/),
    ).toBeVisible();

    await page.getByLabel('Password', { exact: true }).fill('Secret123!');
    await signUpButton.click();

    await expect(page.getByText('Enter verification code')).toBeVisible();
    await expect(page.getByText(/Resend code in \d+s/)).toBeVisible();

    // Typing moves focus from box to box.
    await expect(page.getByLabel('Digit 1 of 4')).toBeFocused();
    await page.keyboard.type('1234');
    await expect(page.getByLabel('Digit 4 of 4')).toHaveValue('4');

    await page.getByRole('button', { name: 'Verify OTP' }).click();
    await page.waitForURL('**/login');

    const details = {
      name: 'Jane Doe',
      email: 'jane@example.com',
      password: 'Secret123!',
    };
    expect(registerRequests).toEqual([details]);
    expect(verifyRequests).toEqual([{ ...details, otp: '1234' }]);
  });
});

test.describe('Forgot password page', () => {
  test('requests a reset link', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: 'Forgot Password?' }).click();
    await page.waitForURL('**/forgot-password');

    const requests = await mockAuth(page, 'forgot-password/user', 200, {
      success: true,
      message:
        'If an account exists for this email, a password reset link has been sent.',
    });
    await page.getByLabel('Email').fill('jane@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();

    await expect(page.getByRole('status')).toContainText(
      'password reset link has been sent',
    );
    expect(requests).toEqual([{ email: 'jane@example.com' }]);
  });
});
