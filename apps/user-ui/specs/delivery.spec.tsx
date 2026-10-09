import type { ReactElement } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CheckoutQuote, Order, RiderJob, RiderProfile } from '@org/models';
import CheckoutPage from '../src/app/checkout/page';
import RiderSignupPage from '../src/app/rider/signup/page';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { ShopStoreProvider } from '../src/app/shared/store/shop-store';
import { takeReturnTo } from '../src/app/shared/utils/return-to';
import { DELIVERY_ADDRESS_KEY } from '../src/app/shared/widgets/checkout-form';
import { MyOrders } from '../src/app/shared/widgets/my-orders';
import { RiderPortal } from '../src/app/shared/widgets/rider-portal';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

type Reply = { status: number; body: unknown };
const fetchMock = vi.fn();
const replies = new Map<string, Reply[]>();

/** Queues a reply for `METHOD url`. Unqueued requests answer 404. */
function reply(route: string, status: number, body: unknown) {
  replies.set(route, [...(replies.get(route) ?? []), { status, body }]);
}

const sentBody = (route: string) => {
  const call = fetchMock.mock.calls.findLast(
    ([url, init]) => `${init?.method ?? 'GET'} ${url}` === route,
  );
  if (!call) throw new Error(`No request to ${route}`);
  return JSON.parse((call[1] as RequestInit).body as string);
};

const jane = {
  id: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'user',
};

const honey = {
  id: '64b000000000000000000001',
  name: 'Honey',
  description: '',
  price: 10,
  category: 'Food',
  imageUrl: '/images/honey.jpg',
  inStock: true,
  rating: 4,
  reviewCount: 1,
  shopId: 'shop1',
  shopName: 'Mlima Farm',
};

const item = {
  productId: honey.id,
  name: 'Honey',
  imageUrl: '/images/honey.jpg',
  quantity: 2,
  unitPrice: 10,
  total: 20,
  discount: 0,
  paymentOption: 'full_upfront' as const,
};

const quote: CheckoutQuote = {
  groups: [
    {
      shopId: 'shop1',
      shopName: 'Mlima Farm',
      items: [item],
      subtotal: 20,
      discount: 0,
      deliveryFee: 3,
      total: 23,
      payNow: 23,
      onDelivery: 0,
      platformFee: 2,
      sellerEarnings: 18,
    },
  ],
  subtotal: 20,
  discount: 0,
  deliveryFee: 3,
  total: 23,
  payNow: 23,
  onDelivery: 0,
  platformFee: 2,
  sellerEarnings: 18,
};

const address = {
  recipientName: 'Jane Doe',
  phone: '+254712345678',
  zone: 'Nairobi' as const,
  area: 'Kilimani',
};

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 'ML-7Q2K9D',
  shopId: 'shop1',
  shopName: 'Mlima Farm',
  buyerName: 'Jane Doe',
  buyerEmail: 'jane@example.com',
  address,
  items: [item],
  subtotal: 20,
  discount: 0,
  deliveryFee: 3,
  total: 23,
  payNow: 23,
  onDelivery: 0,
  platformFee: 2,
  sellerEarnings: 18,
  status: 'placed',
  deliveryCode: '4821',
  createdAt: '2026-09-29T09:00:00.000Z',
  updatedAt: '2026-09-29T09:00:00.000Z',
  ...overrides,
});

const job = (overrides: Partial<RiderJob> = {}): RiderJob => ({
  id: 'd1',
  orderNumber: 'ML-7Q2K9D',
  status: 'open',
  fee: 3,
  offeredToYou: false,
  pickup: { shopName: 'Mlima Farm', zone: 'Nairobi', address: 'Moi Avenue' },
  dropoff: { zone: 'Nairobi', area: 'Kilimani' },
  items: [{ name: 'Honey', quantity: 2 }],
  collectOnDelivery: 0,
  events: [{ status: 'open', at: '2026-09-29T10:00:00.000Z' }],
  createdAt: '2026-09-29T10:00:00.000Z',
  updatedAt: '2026-09-29T10:00:00.000Z',
  ...overrides,
});

const rider = {
  id: 'r1',
  name: 'Otieno Rider',
  email: 'otieno@example.com',
  phone_number: '+254700000001',
};

const profile = (overrides: Partial<RiderProfile> = {}): RiderProfile => ({
  id: 'r1',
  name: 'Otieno Rider',
  email: 'otieno@example.com',
  phone: '+254700000001',
  vehicle: 'motorbike',
  zones: ['Nairobi'],
  available: true,
  completedDeliveries: 4,
  ...overrides,
});

const renderWith = (ui: ReactElement) =>
  render(
    <QueryProvider>
      <ShopStoreProvider>{ui}</ShopStoreProvider>
    </QueryProvider>,
  );

beforeEach(() => {
  replies.clear();
  push.mockClear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const { status, body } = replies
      .get(`${init?.method ?? 'GET'} ${url}`)
      ?.shift() ?? {
      status: 404,
      body: { success: false, error: 'Not found' },
    };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    };
  });
  vi.stubGlobal('fetch', fetchMock);
  localStorage.clear();
  sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Checkout', () => {
  const fillCart = () =>
    localStorage.setItem(
      'mlimalink-shop',
      JSON.stringify({ cart: [{ product: honey, quantity: 2 }] }),
    );

  it('prices the cart on the server and places the order', async () => {
    fillCart();
    reply('GET /api/auth/logged-in-user', 200, { success: true, user: jane });
    reply('POST /api/orders/quote', 200, { success: true, data: quote });
    reply('POST /api/orders', 200, {
      success: true,
      data: [order()],
    });
    renderWith(<CheckoutPage />);

    expect((await screen.findByTestId('checkout-total')).textContent).toBe(
      '$23.00',
    );
    expect(sentBody('POST /api/orders/quote')).toEqual({
      items: [
        { productId: honey.id, quantity: 2, paymentOption: 'full_upfront' },
      ],
    });
    await waitFor(() =>
      expect(
        (screen.getByLabelText('Who’s receiving it?') as HTMLInputElement)
          .value,
      ).toBe('Jane Doe'),
    );

    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+254712345678' },
    });
    fireEvent.change(screen.getByLabelText('Town'), {
      target: { value: 'Nairobi' },
    });
    fireEvent.change(screen.getByLabelText('Estate or area'), {
      target: { value: 'Kilimani' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Place order' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/dashboard/orders?placed=ML-7Q2K9D'),
    );
    expect(sentBody('POST /api/orders')).toEqual({
      items: [
        { productId: honey.id, quantity: 2, paymentOption: 'full_upfront' },
      ],
      address,
    });
    expect(
      JSON.parse(localStorage.getItem('mlimalink-shop') ?? '{}').cart,
    ).toEqual([]);
    expect(
      JSON.parse(localStorage.getItem(DELIVERY_ADDRESS_KEY) ?? '{}').area,
    ).toBe('Kilimani');
  });

  it('asks for the missing address details before placing', async () => {
    fillCart();
    reply('GET /api/auth/logged-in-user', 200, { success: true, user: jane });
    reply('POST /api/orders/quote', 200, { success: true, data: quote });
    renderWith(<CheckoutPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Place order' }));

    expect(await screen.findByText('Enter a phone number')).toBeTruthy();
    expect(screen.getByText('Choose the town to deliver to')).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => url === '/api/orders' && init?.method === 'POST',
      ),
    ).toBe(false);
  });

  it('asks signed-out shoppers to log in and brings them back', async () => {
    fillCart();
    reply('GET /api/auth/logged-in-user', 401, { success: false });
    reply('POST /api/auth/refresh-token', 401, { success: false });
    renderWith(<CheckoutPage />);

    fireEvent.click(
      await screen.findByRole('link', { name: 'Log in to continue' }),
    );
    expect(takeReturnTo()).toBe('/checkout');
  });

  it('shows an empty cart', async () => {
    reply('GET /api/auth/logged-in-user', 200, { success: true, user: jane });
    renderWith(<CheckoutPage />);
    expect(await screen.findByText('Your cart is empty')).toBeTruthy();
  });
});

describe('My orders', () => {
  it('shows the delivery code, rider and updates for an order on its way', async () => {
    reply('GET /api/orders/mine', 200, {
      success: true,
      data: [
        order({
          status: 'out_for_delivery',
          delivery: {
            id: 'd1',
            status: 'picked_up',
            fee: 3,
            rider: {
              id: 'r1',
              name: 'Otieno Rider',
              phone: '+254 700 000 001',
              vehicle: 'motorbike',
            },
            events: [
              { status: 'open', at: '2026-09-29T10:00:00.000Z' },
              { status: 'assigned', at: '2026-09-29T10:05:00.000Z' },
              { status: 'picked_up', at: '2026-09-29T10:20:00.000Z' },
            ],
            lastLocation: {
              lat: -1.29,
              lng: 36.82,
              at: '2026-09-29T10:25:00.000Z',
            },
            updatedAt: '2026-09-29T10:20:00.000Z',
          },
        }),
      ],
    });
    renderWith(<MyOrders />);

    expect(
      (await screen.findByTestId('delivery-code-ML-7Q2K9D')).textContent,
    ).toBe('4821');
    expect(
      screen
        .getByRole('link', { name: 'WhatsApp Otieno Rider' })
        .getAttribute('href'),
    ).toBe('https://wa.me/254700000001');
    expect(
      screen
        .getByRole('link', { name: /See where the rider is/ })
        .getAttribute('href'),
    ).toBe('https://www.google.com/maps?q=-1.29,36.82');
    const updates = within(
      screen.getByRole('list', { name: 'Delivery updates' }),
    );
    expect(updates.getAllByRole('listitem')[0].textContent).toMatch(
      /^On the way/,
    );
  });

  it('lets the shopper cancel an order the shop has not confirmed', async () => {
    reply('GET /api/orders/mine', 200, { success: true, data: [order()] });
    reply('POST /api/orders/mine/o1/cancel', 200, {
      success: true,
      data: order({ status: 'cancelled' }),
    });
    reply('GET /api/orders/mine', 200, {
      success: true,
      data: [order({ status: 'cancelled' })],
    });
    renderWith(<MyOrders />);

    expect(screen.queryByTestId('delivery-code-ML-7Q2K9D')).toBeNull();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Cancel order' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel' }));

    expect(await screen.findByText('Cancelled')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel order' })).toBeNull();
  });

  it('treats a missing orders endpoint as no orders', async () => {
    renderWith(<MyOrders />);
    expect(await screen.findByText('No orders yet')).toBeTruthy();
  });
});

describe('Rider signup', () => {
  it('checks the phone number, then verifies the code and opens the portal', async () => {
    reply('POST /api/auth/register/rider', 200, {
      success: true,
      message: 'Code sent',
    });
    reply('POST /api/auth/verify/rider', 200, {
      success: true,
      message: 'Welcome',
      rider,
    });
    renderWith(<RiderSignupPage />);

    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'Otieno Rider' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'otieno@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '0712345678' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'Str0ng!pass' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));
    expect(await screen.findByText(/with its country code/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Phone number'), {
      target: { value: '+254 700 000 001' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign Up' }));

    const firstBox = await screen.findByLabelText('Digit 1 of 4');
    expect(sentBody('POST /api/auth/register/rider')).toEqual({
      name: 'Otieno Rider',
      email: 'otieno@example.com',
      phone_number: '+254700000001',
      password: 'Str0ng!pass',
    });
    fireEvent.paste(firstBox, { clipboardData: { getData: () => '1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verify OTP' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/rider'));
    expect(sentBody('POST /api/auth/verify/rider').otp).toBe('1234');
  });
});

describe('Rider portal', () => {
  const signIn = () => reply('GET /api/auth/logged-in-rider', 200, { rider });

  it('invites visitors to sign up as riders', async () => {
    reply('GET /api/auth/logged-in-rider', 401, { success: false });
    reply('POST /api/auth/refresh-token/rider', 401, { success: false });
    renderWith(<RiderPortal />);

    expect(
      (
        await screen.findByRole('link', { name: 'Sign up as a rider' })
      ).getAttribute('href'),
    ).toBe('/rider/signup');
  });

  it('opens the profile first until the rider picks a vehicle and towns', async () => {
    signIn();
    reply('GET /api/rider/profile', 200, {
      success: true,
      data: profile({ vehicle: undefined, zones: [], available: false }),
    });
    reply('PUT /api/rider/profile', 200, {
      success: true,
      data: profile(),
    });
    renderWith(<RiderPortal />);

    expect(
      await screen.findByRole('heading', { name: 'Hi Otieno' }),
    ).toBeTruthy();
    fireEvent.change(await screen.findByLabelText('How do you deliver?'), {
      target: { value: 'motorbike' },
    });
    fireEvent.click(screen.getByLabelText('Nairobi'));
    fireEvent.click(screen.getByRole('switch', { name: 'Taking jobs now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save profile' }));

    expect(await screen.findByText('Saved.')).toBeTruthy();
    expect(sentBody('PUT /api/rider/profile')).toEqual({
      vehicle: 'motorbike',
      zones: ['Nairobi'],
      available: true,
    });
  });

  it('accepts a job and moves to deliveries', async () => {
    signIn();
    reply('GET /api/rider/profile', 200, { success: true, data: profile() });
    reply('GET /api/rider/jobs', 200, {
      success: true,
      data: [
        job({ status: 'offered', offeredToYou: true, collectOnDelivery: 5 }),
      ],
    });
    reply('POST /api/rider/jobs/d1/accept', 200, {
      success: true,
      data: job({ status: 'assigned' }),
    });
    reply('GET /api/rider/jobs', 200, { success: true, data: [] });
    reply('GET /api/rider/deliveries', 200, {
      success: true,
      data: [
        job({
          status: 'assigned',
          dropoff: {
            ...job().dropoff,
            recipientName: 'Jane Doe',
            phone: '+254712345678',
          },
        }),
      ],
    });
    renderWith(<RiderPortal />);

    const card = within(
      await screen.findByRole('article', { name: 'Job ML-7Q2K9D' }),
    );
    expect(card.getByText('Offered to you')).toBeTruthy();
    expect(card.getByText('Collect $5.00 from the customer.')).toBeTruthy();
    fireEvent.click(card.getByRole('button', { name: 'Accept job' }));

    expect(
      await screen.findByRole('button', { name: 'I’ve picked it up' }),
    ).toBeTruthy();
    expect(screen.getByText('Jane Doe')).toBeTruthy();
  });

  it('completes a delivery with the shopper’s code', async () => {
    signIn();
    reply('GET /api/rider/profile', 200, { success: true, data: profile() });
    reply('GET /api/rider/jobs', 200, { success: true, data: [] });
    reply('GET /api/rider/deliveries', 200, {
      success: true,
      data: [job({ status: 'picked_up' })],
    });
    reply('POST /api/rider/deliveries/d1/deliver', 400, {
      success: false,
      error: 'That code is wrong. 4 tries left.',
    });
    reply('POST /api/rider/deliveries/d1/deliver', 200, {
      success: true,
      data: job({ status: 'delivered' }),
    });
    reply('GET /api/rider/deliveries', 200, {
      success: true,
      data: [job({ status: 'delivered' })],
    });
    renderWith(<RiderPortal />);

    fireEvent.click(await screen.findByRole('tab', { name: 'My deliveries' }));
    const code = await screen.findByLabelText('Delivery code for ML-7Q2K9D');
    const submit = screen.getByRole('button', { name: 'Mark delivered' });
    fireEvent.change(code, { target: { value: '12a' } });
    expect((code as HTMLInputElement).value).toBe('12');
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(code, { target: { value: '1111' } });
    fireEvent.click(submit);
    expect((await screen.findByRole('alert')).textContent).toBe(
      'That code is wrong. 4 tries left.',
    );

    fireEvent.change(code, { target: { value: '4821' } });
    fireEvent.click(submit);

    expect(
      await screen.findByRole('list', { name: 'Past deliveries' }),
    ).toBeTruthy();
    expect(sentBody('POST /api/rider/deliveries/d1/deliver')).toEqual({
      code: '4821',
    });
  });
});
