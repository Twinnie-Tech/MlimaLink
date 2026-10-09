import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscountCode, Product } from '@org/models';
import DashboardLayout from '../src/app/dashboard/layout';
import DiscountCodesPage from '../src/app/dashboard/discount-codes/page';
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
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/discount-codes',
}));

const SNEAKERS_ID = '66f0000000000000000000aa';
const HAT_ID = '66f0000000000000000000bb';

const harvest: DiscountCode = {
  id: 'd1',
  code: 'HARVEST10',
  type: 'percentage',
  value: 10,
  minSpend: 20,
  usageLimit: 50,
  usedCount: 3,
  expiresAt: '2099-10-31',
  active: true,
  createdAt: '2026-09-01T08:00:00.000Z',
};
const summer: DiscountCode = {
  id: 'd2',
  code: 'SUMMER5',
  type: 'fixed',
  value: 5,
  usedCount: 12,
  expiresAt: '2020-01-31',
  productIds: [SNEAKERS_ID, HAT_ID],
  active: true,
  createdAt: '2019-12-01T08:00:00.000Z',
};

const myProducts = [
  { id: SNEAKERS_ID, name: 'Sneakers', price: 45, salePrice: 40 },
  { id: HAT_ID, name: 'Hat', price: 20 },
] as Product[];

beforeEach(() => {
  installFetchMock();
  reply('GET /api/auth/logged-in-seller', 200, {
    success: true,
    seller: { ...seller, shop },
  });
  reply('GET /api/seller/products', 200, { success: true, data: myProducts });
});

function renderCodes(codes: DiscountCode[] = []) {
  reply('GET /api/seller/discount-codes', 200, { success: true, data: codes });
  return renderPage(
    <DashboardLayout>
      <DiscountCodesPage />
    </DashboardLayout>,
  );
}

const codeRow = async (code: string) =>
  (await screen.findByText(code, { selector: 'p' })).closest(
    'li',
  ) as HTMLElement;

describe('Discount codes', () => {
  it('lists codes with their saving, usage, expiry and status', async () => {
    renderCodes([harvest, summer]);

    const row = await codeRow('HARVEST10');
    expect(row.textContent).toContain(
      '10% off all products · min. spend $20.00 · 3 of 50 used · ends 31 Oct 2099',
    );
    expect(within(row).getByText('active')).toBeTruthy();

    const expired = await codeRow('SUMMER5');
    expect(expired.textContent).toContain(
      '$5.00 off 2 products: Sneakers, Hat · 12 used',
    );
    expect(within(expired).getByText('expired')).toBeTruthy();
    expect(within(expired).queryByRole('button', { name: /Pause/ })).toBeNull();
  });

  it('shows the empty state when the codes service isn’t there yet', async () => {
    reply('GET /api/seller/discount-codes', 404, {
      success: false,
      error: 'Cannot GET /api/seller/discount-codes',
    });
    renderPage(
      <DashboardLayout>
        <DiscountCodesPage />
      </DashboardLayout>,
    );

    expect(await screen.findByText('No discount codes yet')).toBeTruthy();
    expect(screen.queryByText(/Cannot GET/)).toBeNull();
  });

  it('offers to try again when the codes can’t be loaded', async () => {
    reply('GET /api/seller/discount-codes', 503, {
      success: false,
      error: 'The server is unavailable right now. Please try again later.',
    });
    reply('GET /api/seller/discount-codes', 503, { success: false });
    reply('GET /api/seller/discount-codes', 503, { success: false });
    reply('GET /api/seller/discount-codes', 200, {
      success: true,
      data: [harvest],
    });
    renderPage(
      <DashboardLayout>
        <DiscountCodesPage />
      </DashboardLayout>,
    );

    expect(
      await screen.findByText(
        "Couldn't load your codes",
        {},
        { timeout: 8000 },
      ),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await codeRow('HARVEST10')).toBeTruthy();
  }, 15_000);

  it('creates a code and adds it to the list', async () => {
    reply('POST /api/seller/discount-codes', 200, {
      success: true,
      message: 'HARVEST10 is live: 10% off Mlima Fresh products.',
      data: harvest,
    });
    renderCodes();

    expect(await screen.findByText('No discount codes yet')).toBeTruthy();
    fill('Code', ' harvest10 ');
    fill('Discount (%)', '10');
    fill('Minimum spend (USD)', '20');
    fill('Usage limit', '50');
    fill('Last day', '2099-10-31');
    fireEvent.click(screen.getByRole('button', { name: 'Create code' }));

    expect(
      await screen.findByText(
        'HARVEST10 is live: 10% off Mlima Fresh products.',
      ),
    ).toBeTruthy();
    expect(sentBody('POST /api/seller/discount-codes')).toEqual({
      code: 'HARVEST10',
      type: 'percentage',
      value: 10,
      minSpend: 20,
      usageLimit: 50,
      expiresAt: '2099-10-31',
    });
    expect(await codeRow('HARVEST10')).toBeTruthy();
    expect((screen.getByLabelText('Code') as HTMLInputElement).value).toBe('');
  });

  it('limits a code to the products the seller chooses', async () => {
    reply('POST /api/seller/discount-codes', 200, {
      success: true,
      message: 'SHOES15 is live: 15% off 1 chosen product.',
      data: {
        ...harvest,
        code: 'SHOES15',
        value: 15,
        productIds: [SNEAKERS_ID],
      },
    });
    renderCodes();

    await screen.findByText('No discount codes yet');
    fill('Code', 'SHOES15');
    fill('Discount (%)', '15');
    fireEvent.click(screen.getByLabelText('Chosen products'));

    fireEvent.click(screen.getByRole('button', { name: 'Create code' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Choose at least one product, or let the code cover all your products.',
    );

    const list = await screen.findByRole('list', {
      name: 'Products this code covers',
    });
    fireEvent.click(within(list).getByLabelText(/Sneakers/));
    expect(screen.getByText('1 of 2 chosen')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Create code' }));

    expect(
      await screen.findByText('SHOES15 is live: 15% off 1 chosen product.'),
    ).toBeTruthy();
    expect(sentBody('POST /api/seller/discount-codes')).toEqual({
      code: 'SHOES15',
      type: 'percentage',
      value: 15,
      productIds: [SNEAKERS_ID],
    });
    expect((await codeRow('SHOES15')).textContent).toContain(
      '15% off only Sneakers',
    );
  });

  it('rejects codes with spaces or symbols before sending them', async () => {
    renderCodes();

    await screen.findByText('No discount codes yet');
    fill('Code', 'save 10!');
    fill('Discount (%)', '10');
    fireEvent.click(screen.getByRole('button', { name: 'Create code' }));

    expect(
      await screen.findByText('Use 4–16 letters or numbers, no spaces'),
    ).toBeTruthy();
    expect(() => sentBody('POST /api/seller/discount-codes')).toThrow();
  });

  it('explains when a code is already taken', async () => {
    reply('POST /api/seller/discount-codes', 409, {
      success: false,
      error: 'That code is already taken. Try another.',
    });
    renderCodes();

    await screen.findByText('No discount codes yet');
    fill('Code', 'HARVEST10');
    fireEvent.click(screen.getByLabelText('Fixed amount'));
    fill('Amount off (USD)', '5');
    fireEvent.click(screen.getByRole('button', { name: 'Create code' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That code is already taken. Try another.',
    );
  });

  it('pauses, resumes and deletes codes', async () => {
    reply('PATCH /api/seller/discount-codes/d1', 200, {
      success: true,
      data: { ...harvest, active: false },
    });
    reply('DELETE /api/seller/discount-codes/d1', 200, {
      success: true,
      data: null,
    });
    renderCodes([harvest]);

    const row = await codeRow('HARVEST10');
    fireEvent.click(
      within(row).getByRole('button', { name: 'Pause HARVEST10' }),
    );

    expect(await within(row).findByText('paused')).toBeTruthy();
    expect(sentBody('PATCH /api/seller/discount-codes/d1')).toEqual({
      active: false,
    });
    expect(
      within(row).getByRole('button', { name: 'Resume HARVEST10' }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Delete HARVEST10' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('HARVEST10')).toBeNull());
    expect(screen.getByText('No discount codes yet')).toBeTruthy();
  });
});
