import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AvailableRider, Order } from '@org/models';
import OrdersPage from '../src/app/dashboard/orders/page';
import {
  fill,
  installFetchMock,
  renderPage,
  reply,
  sentBody,
} from './test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/orders',
}));

const order = (overrides: Partial<Order> = {}): Order => ({
  id: 'o1',
  number: 'ML-7Q2K9D',
  shopId: 'shop1',
  shopName: 'Mlima Fresh',
  buyerName: 'Jane Doe',
  buyerEmail: 'jane@example.com',
  address: {
    recipientName: 'Jane Doe',
    phone: '+254712345678',
    zone: 'Nairobi',
    area: 'Kilimani',
    notes: 'Blue gate',
  },
  items: [
    {
      productId: 'p1',
      name: 'Honey',
      imageUrl: '/honey.jpg',
      quantity: 2,
      unitPrice: 10,
      total: 20,
      discount: 0,
      paymentOption: 'full_upfront',
    },
  ],
  subtotal: 20,
  discount: 0,
  deliveryFee: 3,
  total: 23,
  payNow: 23,
  onDelivery: 0,
  status: 'placed',
  createdAt: '2026-09-29T09:00:00.000Z',
  updatedAt: '2026-09-29T09:00:00.000Z',
  ...overrides,
});

const otieno: AvailableRider = {
  id: 'r1',
  name: 'Otieno Rider',
  phone: '+254700000001',
  vehicle: 'motorbike',
  zones: ['Nairobi'],
  completedDeliveries: 12,
};

const delivery = (overrides: Partial<NonNullable<Order['delivery']>> = {}) => ({
  id: 'd1',
  status: 'open' as const,
  fee: 3,
  events: [{ status: 'open' as const, at: '2026-09-29T10:00:00.000Z' }],
  updatedAt: '2026-09-29T10:00:00.000Z',
  ...overrides,
});

const settings = (zone?: 'Nairobi') =>
  reply('GET /api/seller/delivery-settings', 200, {
    success: true,
    data: zone ? { zone, fee: 3 } : { fee: 3 },
  });

const orders = (...list: Order[]) =>
  reply('GET /api/seller/orders', 200, { success: true, data: list });

beforeEach(() => {
  installFetchMock();
});

describe('Delivery settings', () => {
  it('saves the pickup town and fee', async () => {
    settings();
    orders();
    reply('PUT /api/seller/delivery-settings', 200, {
      success: true,
      message: 'Delivery settings saved.',
      data: { zone: 'Nairobi', fee: 4.5 },
    });
    renderPage(<OrdersPage />);

    expect(
      await screen.findByText(/Choose your pickup town before asking riders/),
    ).toBeTruthy();
    expect(
      (screen.getByLabelText('Delivery fee (USD)') as HTMLInputElement).value,
    ).toBe('3');

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toBe(
      'Choose the town riders collect orders from.',
    );

    fill('Pickup town', 'Nairobi');
    fill('Delivery fee (USD)', '4.5');
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(await screen.findByText('Delivery settings saved.')).toBeTruthy();
    expect(sentBody('PUT /api/seller/delivery-settings')).toEqual({
      zone: 'Nairobi',
      fee: 4.5,
    });
  });
});

describe('Orders', () => {
  it('confirms a new order with a message for the shopper', async () => {
    settings('Nairobi');
    orders(order());
    reply('PATCH /api/seller/orders/o1', 200, {
      success: true,
      message: 'Order ML-7Q2K9D confirmed. Jane Doe has been emailed.',
      data: order({ status: 'confirmed' }),
    });
    renderPage(<OrdersPage />);

    const card = within(
      await screen.findByRole('article', { name: 'Order ML-7Q2K9D' }),
    );
    expect(card.getByText('Blue gate')).toBeTruthy();
    expect(
      card
        .getByRole('link', { name: 'WhatsApp Jane Doe' })
        .getAttribute('href'),
    ).toBe('https://wa.me/254712345678');
    fireEvent.change(card.getByLabelText('Message to Jane Doe (optional)'), {
      target: { value: 'Pay to till 123456, please.' },
    });
    fireEvent.click(card.getByRole('button', { name: 'Confirm order' }));

    expect(
      await screen.findByText(
        'Order ML-7Q2K9D confirmed. Jane Doe has been emailed.',
      ),
    ).toBeTruthy();
    expect(sentBody('PATCH /api/seller/orders/o1')).toEqual({
      status: 'confirmed',
      note: 'Pay to till 123456, please.',
    });
    expect(screen.getByRole('button', { name: 'Get a rider' })).toBeTruthy();
  });

  it('offers a delivery to a chosen rider and can withdraw it', async () => {
    settings('Nairobi');
    orders(order({ status: 'confirmed' }));
    reply('GET /api/seller/riders', 200, { success: true, data: [otieno] });
    reply('POST /api/seller/orders/o1/delivery', 200, {
      success: true,
      message: 'Offered to Otieno Rider. We’ll email you when they answer.',
      data: order({
        status: 'confirmed',
        delivery: delivery({
          status: 'offered',
          offeredTo: { id: 'r1', name: 'Otieno Rider', phone: otieno.phone },
        }),
      }),
    });
    reply('DELETE /api/seller/orders/o1/delivery', 200, {
      success: true,
      message: 'Delivery request withdrawn.',
      data: order({
        status: 'confirmed',
        delivery: delivery({ status: 'cancelled' }),
      }),
    });
    renderPage(<OrdersPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Get a rider' }));
    fireEvent.click(await screen.findByLabelText(/Otieno Rider/));
    expect(screen.getByText(/Motorbike · 12 deliveries/)).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', { name: 'Offer to this rider' }),
    );

    expect(
      await screen.findByText('Waiting for Otieno Rider to answer.'),
    ).toBeTruthy();
    expect(sentBody('POST /api/seller/orders/o1/delivery')).toEqual({
      riderId: 'r1',
    });
    expect(screen.queryByRole('button', { name: 'Get a rider' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Withdraw request' }));
    expect(await screen.findByText('Delivery request withdrawn.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Get a rider' })).toBeTruthy();
  });

  it('posts a delivery to every nearby rider', async () => {
    settings('Nairobi');
    orders(order({ status: 'confirmed' }));
    reply('GET /api/seller/riders', 200, { success: true, data: [] });
    reply('POST /api/seller/orders/o1/delivery', 200, {
      success: true,
      message: 'Posted to riders in your town. The first to accept gets it.',
      data: order({ status: 'confirmed', delivery: delivery() }),
    });
    renderPage(<OrdersPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Get a rider' }));
    expect(
      await screen.findByText(/No riders are online in your town/),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Post the job' }));

    expect(
      await screen.findByText(
        'Posted to riders in your town. The first to accept gets it.',
      ),
    ).toBeTruthy();
    expect(sentBody('POST /api/seller/orders/o1/delivery')).toEqual({});
  });

  it('shows the rider, their location and updates while out for delivery', async () => {
    settings('Nairobi');
    orders(
      order({
        status: 'out_for_delivery',
        delivery: delivery({
          status: 'picked_up',
          rider: {
            id: 'r1',
            name: 'Otieno Rider',
            phone: otieno.phone,
            vehicle: 'motorbike',
          },
          lastLocation: {
            lat: -1.29,
            lng: 36.82,
            at: '2026-09-29T10:25:00.000Z',
          },
          events: [
            { status: 'open', at: '2026-09-29T10:00:00.000Z' },
            { status: 'assigned', at: '2026-09-29T10:05:00.000Z' },
            { status: 'picked_up', at: '2026-09-29T10:20:00.000Z' },
          ],
        }),
      }),
    );
    renderPage(<OrdersPage />);

    const card = within(
      await screen.findByRole('article', { name: 'Order ML-7Q2K9D' }),
    );
    expect(card.getByRole('link', { name: 'Call Otieno Rider' })).toBeTruthy();
    expect(
      card.getByRole('link', { name: /last location/ }).getAttribute('href'),
    ).toBe('https://www.google.com/maps?q=-1.29,36.82');
    expect(
      card
        .getAllByRole('listitem')
        .some((li) => /^On the way/.test(li.textContent ?? '')),
    ).toBe(true);
    expect(card.queryByRole('button', { name: 'Cancel order' })).toBeNull();
    expect(card.queryByRole('button', { name: 'Get a rider' })).toBeNull();
  });

  it('filters by status and searches by customer', async () => {
    settings('Nairobi');
    orders(
      order(),
      order({
        id: 'o2',
        number: 'ML-AAAAAA',
        buyerName: 'Brian Kamau',
        status: 'delivered',
      }),
    );
    renderPage(<OrdersPage />);

    expect(await screen.findByRole('tab', { name: 'All (2)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Delivered (1)' }));
    expect(
      screen.getByRole('article', { name: 'Order ML-AAAAAA' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('article', { name: 'Order ML-7Q2K9D' }),
    ).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: 'All (2)' }));
    fill('Search orders', 'jane');
    expect(
      screen.getByRole('article', { name: 'Order ML-7Q2K9D' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('article', { name: 'Order ML-AAAAAA' }),
    ).toBeNull();
  });
});
