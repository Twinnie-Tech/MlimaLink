import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import SellerSignupPage from '../src/app/(routes)/signup/page';
import { ConnectBankStep } from '../src/app/(routes)/signup/steps/connect-bank-step';
import { countries } from '../src/configs/countries';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { CountryFlag } from '../src/app/shared/widgets/country-flag';
import {
  fill,
  installFetchMock,
  renderPage,
  reply,
  seller,
  sentBody,
  shop,
} from './test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function currentStep() {
  return document.querySelector('[aria-current="step"]')?.textContent;
}

function fillAccountForm() {
  fill('Name', 'Amina Otieno');
  fill('Email', 'amina@example.com');
  fill('Phone number', '0712 345 678');
  fill('Password', 'Secret123!');
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Seller sign-up', () => {
  it('starts on Create Account for a visitor', async () => {
    renderPage(<SellerSignupPage />);

    expect(
      await screen.findByRole('button', { name: 'Create Account' }),
    ).toBeTruthy();
    expect(currentStep()).toContain('Create Account');
    expect(screen.getByTestId('dial-code').textContent).toBe('+254');
  });

  it('updates the dialling code and flag with the country', async () => {
    renderPage(<SellerSignupPage />);
    await screen.findByRole('button', { name: 'Create Account' });
    expect(screen.getByTestId('flag-KE')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Country'), {
      target: { value: 'UG' },
    });

    expect(screen.getByTestId('dial-code').textContent).toBe('+256');
    expect(screen.getByTestId('flag-UG')).toBeTruthy();
    expect(screen.queryByTestId('flag-KE')).toBeNull();
  });

  it('has a flag for every country on offer', () => {
    render(
      <>
        {countries.map((country) => (
          <CountryFlag key={country.code} code={country.code} />
        ))}
      </>,
    );

    for (const country of countries) {
      expect(screen.getByTestId(`flag-${country.code}`)).toBeTruthy();
    }
  });

  it('checks every field before sending a code', async () => {
    renderPage(<SellerSignupPage />);
    await screen.findByRole('button', { name: 'Create Account' });

    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Name is required')).toBeTruthy();
    expect(screen.getByText('Email is required')).toBeTruthy();
    expect(screen.getByText('Phone number is required')).toBeTruthy();
    expect(screen.getByText('Password is required')).toBeTruthy();

    fill('Phone number', '+254 712 abc');
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));
    expect(
      await screen.findByText(
        'Use digits only; the country code is added for you',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Verify your email')).toBeNull();
  });

  it('verifies the email, creates the shop, then offers bank connection', async () => {
    reply('POST /api/auth/register/seller', 200, {
      success: true,
      message: 'OTP sent',
    });
    reply('POST /api/auth/verify/seller', 201, {
      success: true,
      message: 'ok',
      seller,
    });
    reply('POST /api/auth/create-shop', 201, {
      success: true,
      message: 'ok',
      shop,
    });

    renderPage(<SellerSignupPage />);
    await screen.findByRole('button', { name: 'Create Account' });

    fillAccountForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create Account' }));

    expect(await screen.findByText('Verify your email')).toBeTruthy();
    expect(sentBody('POST /api/auth/register/seller')).toEqual({
      name: 'Amina Otieno',
      email: 'amina@example.com',
      country: 'KE',
      phone_number: '+254712345678',
      password: 'Secret123!',
    });

    '1234'.split('').forEach((digit, index) => {
      fireEvent.keyDown(screen.getByLabelText(`Digit ${index + 1} of 4`), {
        key: digit,
      });
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Verify and continue' }),
    );

    expect(await screen.findByLabelText('Shop name')).toBeTruthy();
    expect(sentBody('POST /api/auth/verify/seller')).toMatchObject({
      otp: '1234',
      phone_number: '+254712345678',
    });
    expect(currentStep()).toContain('Setup Shop');

    fill('Shop name', ' Mlima Fresh ');
    fireEvent.change(screen.getByLabelText('Category'), {
      target: { value: 'Fruits & Vegetables' },
    });
    fill('Shop address', 'Moi Avenue, Nairobi');
    fireEvent.click(screen.getByRole('button', { name: 'Create Shop' }));

    expect(
      await screen.findByRole('button', { name: 'Connect with Stripe' }),
    ).toBeTruthy();
    expect(sentBody('POST /api/auth/create-shop')).toEqual({
      name: 'Mlima Fresh',
      category: 'Fruits & Vegetables',
      address: 'Moi Avenue, Nairobi',
    });
    expect(currentStep()).toContain('Connect Bank');
  });

  it('resumes at Setup Shop for a signed-in seller without a shop', async () => {
    reply('GET /api/auth/logged-in-seller', 200, { success: true, seller });

    renderPage(<SellerSignupPage />);

    expect(await screen.findByLabelText('Shop name')).toBeTruthy();
    expect(currentStep()).toContain('Setup Shop');
  });

  describe('opening hours', () => {
    async function openSetupShop() {
      reply('GET /api/auth/logged-in-seller', 200, { success: true, seller });
      reply('POST /api/auth/create-shop', 201, { success: true, shop });
      renderPage(<SellerSignupPage />);
      await screen.findByLabelText('Shop name');
      fill('Shop name', 'Mlima Fresh');
      fireEvent.change(screen.getByLabelText('Category'), {
        target: { value: 'Fruits & Vegetables' },
      });
      fill('Shop address', 'Moi Avenue, Nairobi');
    }

    it('sends the picked days and times, not free text', async () => {
      await openSetupShop();

      fireEvent.click(screen.getByRole('button', { name: 'Mon – Fri' }));
      fireEvent.change(screen.getByLabelText('Monday closing time'), {
        target: { value: '17:00' },
      });
      fireEvent.click(
        screen.getByRole('button', {
          name: "Use Monday's hours for all open days",
        }),
      );
      fireEvent.click(screen.getByLabelText('Open on Saturday'));
      fireEvent.change(screen.getByLabelText('Saturday closing time'), {
        target: { value: '13:00' },
      });
      fireEvent.click(screen.getByLabelText('Open on Wednesday'));
      fireEvent.click(screen.getByRole('button', { name: 'Create Shop' }));

      await screen.findByRole('button', { name: 'Connect with Stripe' });
      const weekday = { open: '08:00', close: '17:00' };
      expect(sentBody('POST /api/auth/create-shop').opening_hours).toEqual([
        { day: 'mon', ...weekday },
        { day: 'tue', ...weekday },
        { day: 'thu', ...weekday },
        { day: 'fri', ...weekday },
        { day: 'sat', open: '08:00', close: '13:00' },
      ]);
    });

    it('will not save a day that closes before it opens', async () => {
      await openSetupShop();

      fireEvent.click(screen.getByLabelText('Open on Monday'));
      fireEvent.change(screen.getByLabelText('Monday closing time'), {
        target: { value: '07:00' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Create Shop' }));

      expect(
        await screen.findByText(
          'Monday: closing time must be after opening time.',
        ),
      ).toBeTruthy();
      expect(() => sentBody('POST /api/auth/create-shop')).toThrow();
    });
  });

  it('asks for a category and a proper website link', async () => {
    reply('GET /api/auth/logged-in-seller', 200, { success: true, seller });
    renderPage(<SellerSignupPage />);
    await screen.findByLabelText('Shop name');

    fill('Website (optional)', 'mlimafresh.com');
    fireEvent.click(screen.getByRole('button', { name: 'Create Shop' }));

    expect(await screen.findByText('Choose a category')).toBeTruthy();
    expect(
      screen.getByText('Start the link with http:// or https://'),
    ).toBeTruthy();
  });
});

describe('Connect bank step', () => {
  const readySeller = { ...seller, shop };

  function renderStep(onRedirect = vi.fn()) {
    render(
      <QueryProvider>
        <ConnectBankStep seller={readySeller} onRedirect={onRedirect} />
      </QueryProvider>,
    );
    return onRedirect;
  }

  it('sends the seller to the Stripe onboarding link', async () => {
    reply('POST /api/auth/create-stripe-link', 200, {
      success: true,
      url: 'https://connect.stripe.com/setup/abc',
    });
    const onRedirect = renderStep();

    fireEvent.click(
      screen.getByRole('button', { name: 'Connect with Stripe' }),
    );

    await waitFor(() =>
      expect(onRedirect).toHaveBeenCalledWith(
        'https://connect.stripe.com/setup/abc',
      ),
    );
  });

  it('explains when bank connection is unavailable', async () => {
    reply('POST /api/auth/create-stripe-link', 503, {
      success: false,
      error: 'Bank connection is not available yet. Please try again later.',
    });
    const onRedirect = renderStep();

    fireEvent.click(
      screen.getByRole('button', { name: 'Connect with Stripe' }),
    );

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Bank connection is not available yet. Please try again later.',
    );
    expect(onRedirect).not.toHaveBeenCalled();
    expect(
      screen
        .getByRole('link', { name: 'Skip for now and go to my dashboard' })
        .getAttribute('href'),
    ).toBe('/dashboard');
  });
});
