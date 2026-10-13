import type { ReactElement } from 'react';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AdminOverview,
  AdminProduct,
  AdminSeller,
  AdminUser,
} from '@org/models';
import AdminLoginPage from '../src/app/login/page';
import DashboardLayout from '../src/app/dashboard/layout';
import AdminDashboardPage from '../src/app/dashboard/page';
import UsersPage from '../src/app/dashboard/users/page';
import SellersPage from '../src/app/dashboard/sellers/page';
import PaymentsPage from '../src/app/dashboard/payments/page';
import ProductsPage from '../src/app/dashboard/products/page';
import EventsPage from '../src/app/dashboard/events/page';
import CustomizationPage from '../src/app/dashboard/customization/page';
import LoggersPage from '../src/app/dashboard/loggers/page';
import NotificationsPage from '../src/app/dashboard/notifications/page';
import { niceMax } from '../src/app/shared/dashboard/charts';
import { globeMarkers } from '../src/app/shared/dashboard/world-globe';
import {
  FakeWebSocket,
  admin,
  fill,
  installFetchMock,
  order,
  page,
  renderPage,
  reply,
  sentBody,
} from './test-utils';

const push = vi.fn();
const replace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => '/dashboard',
}));

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function signedIn() {
  reply('GET /api/auth/logged-in-admin', 200, { success: true, admin });
}

function renderDashboard(ui: ReactElement) {
  signedIn();
  return renderPage(<DashboardLayout>{ui}</DashboardLayout>);
}

const overview: AdminOverview = {
  totals: {
    sales: 140,
    platformFees: 14,
    sellerEarnings: 126,
    deliveryFees: 10,
    orders: 3,
    users: 10,
    sellers: 3,
    shops: 2,
    products: 12,
    riders: 2,
  },
  monthly: ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'].map((label, i) => ({
    month: `2026-${String(i + 5).padStart(2, '0')}`,
    label,
    sales: i === 5 ? 100 : 0,
    platformFees: i === 5 ? 10 : 0,
    sellerEarnings: i === 5 ? 90 : 0,
    orders: i === 5 ? 1 : 0,
    newUsers: 1,
    newSellers: 0,
  })),
  accounts: [
    { label: 'Shoppers', value: 10 },
    { label: 'Sellers', value: 3 },
    { label: 'Riders', value: 2 },
  ],
  devices: [
    { label: 'Mobile', value: 6 },
    { label: 'Tablet', value: 1 },
    { label: 'Desktop', value: 3 },
  ],
  countries: [{ country: 'KE', users: 7, sellers: 2 }],
  orderStatus: [
    { label: 'Placed', value: 1 },
    { label: 'Delivered', value: 1 },
    { label: 'Cancelled', value: 1 },
  ],
  recentOrders: [order],
  topShops: [
    {
      shopId: 'shop1',
      shopName: 'Kicks KE',
      orders: 1,
      sales: 100,
      platformFees: 10,
    },
  ],
};

describe('Admin login', () => {
  it('signs the admin in and opens the dashboard', async () => {
    reply('POST /api/auth/login/admin', 200, {
      success: true,
      message: 'ok',
      admin,
    });
    renderPage(<AdminLoginPage />);

    fill('Email', 'admin@mlimalink.com');
    fill('Password', 'Secret123!');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(push).toHaveBeenCalledWith('/dashboard'));
    expect(sentBody('POST /api/auth/login/admin')).toEqual({
      email: 'admin@mlimalink.com',
      password: 'Secret123!',
      rememberMe: false,
    });
  });

  it('checks the form before sending it', () => {
    renderPage(<AdminLoginPage />);

    fill('Email', 'not-an-email');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    expect(screen.getByText('Password is required')).toBeTruthy();
    expect(fetchCalls().some((route) => route.includes('login/admin'))).toBe(
      false,
    );
  });

  it('shows the server error for wrong details', async () => {
    reply('POST /api/auth/login/admin', 400, {
      success: false,
      error: 'Invalid email or password!',
    });
    renderPage(<AdminLoginPage />);

    fill('Email', 'admin@mlimalink.com');
    fill('Password', 'Wrong123!');
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Invalid email or password!',
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Admin dashboard', () => {
  it('sends signed-out visitors to the login page', async () => {
    renderPage(
      <DashboardLayout>
        <p>secret</p>
      </DashboardLayout>,
    );

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('shows totals, the 10% fee split, charts and recent orders', async () => {
    reply('GET /api/admin/overview', 200, { success: true, data: overview });
    renderDashboard(<AdminDashboardPage />);

    expect(
      await screen.findByRole('heading', { name: 'Dashboard' }),
    ).toBeTruthy();
    const split = screen.getByRole('region', { name: 'Where the money goes' });
    expect(within(split).getByText('$14.00')).toBeTruthy();
    expect(within(split).getByText('$126.00')).toBeTruthy();
    expect(within(split).getByText(/MlimaLink fees \(10%\)/)).toBeTruthy();
    expect(within(split).getByText(/Sellers.+share \(90%\)/)).toBeTruthy();

    expect(
      screen.getByRole('img', {
        name: 'Goods sold and MlimaLink fees per month',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', { name: 'Shoppers by device' }),
    ).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Accounts by type' })).toBeTruthy();

    const recent = screen.getByRole('table', { name: 'Recent orders' });
    expect(within(recent).getByText('ML-7Q2K9D')).toBeTruthy();
    expect(screen.getByText('Kenya')).toBeTruthy();
  });

  it('logs the admin out from the sidebar', async () => {
    reply('GET /api/admin/overview', 200, { success: true, data: overview });
    reply('POST /api/auth/logout/admin', 200, { success: true, message: 'ok' });
    renderDashboard(<AdminDashboardPage />);

    const [logout] = await screen.findAllByRole('button', { name: 'Logout' });
    fireEvent.click(logout);

    await waitFor(() => expect(push).toHaveBeenCalledWith('/login'));
  });
});

describe('Users', () => {
  const user: AdminUser = {
    id: 'u1',
    name: 'Amina Otieno',
    email: 'amina@example.com',
    avatarUrl: 'https://ik.imagekit.io/mlima/amina.jpg',
    country: 'KE',
    suspended: false,
    orders: 2,
    spent: 210,
    createdAt: '2026-09-01T10:00:00.000Z',
  };

  it("shows each shopper's photo, or their initials when there is none", async () => {
    reply('GET /api/admin/users', 200, {
      success: true,
      data: page([
        user,
        { ...user, id: 'u2', name: 'Baraka Kip', avatarUrl: null },
      ]),
    });
    renderDashboard(<UsersPage />);

    const table = await screen.findByRole('table', { name: 'Users' });
    const photo = table.querySelector('img');
    expect(photo?.getAttribute('src')).toContain(
      'ik.imagekit.io/mlima/amina.jpg',
    );
    expect(within(table).getByText('BK')).toBeTruthy();
  });

  it('switches to admin accounts with the role filter', async () => {
    reply('GET /api/admin/users', 200, { success: true, data: page([user]) });
    reply('GET /api/admin/admins', 200, {
      success: true,
      data: page([admin, { ...admin, id: 'a2', name: 'Otieno Ops' }]),
    });
    renderDashboard(<UsersPage />);
    await screen.findByRole('table', { name: 'Users' });

    fireEvent.change(screen.getByRole('combobox', { name: 'Role' }), {
      target: { value: 'admin' },
    });

    const table = await screen.findByRole('table', { name: 'Admins' });
    expect(within(table).getByText('Otieno Ops')).toBeTruthy();
    expect(within(table).getAllByText('Admin')).toHaveLength(2);
    expect(within(table).getByText('You')).toBeTruthy();
    expect(
      screen.queryByRole('combobox', { name: 'Account status' }),
    ).toBeNull();
  });

  it('suspends a shopper after confirming', async () => {
    reply('GET /api/admin/users', 200, { success: true, data: page([user]) });
    reply('PATCH /api/admin/users/u1', 200, {
      success: true,
      data: { ...user, suspended: true },
    });
    reply('GET /api/admin/users', 200, {
      success: true,
      data: page([{ ...user, suspended: true }]),
    });
    renderDashboard(<UsersPage />);

    const table = await screen.findByRole('table', { name: 'Users' });
    expect(within(table).getByText('$210.00')).toBeTruthy();
    fireEvent.click(
      within(table).getByRole('button', { name: 'Suspend Amina Otieno' }),
    );
    fireEvent.click(
      within(table).getByRole('button', { name: 'Yes, suspend' }),
    );

    await waitFor(() =>
      expect(sentBody('PATCH /api/admin/users/u1')).toEqual({
        suspended: true,
      }),
    );
    expect(
      await within(table).findByRole('button', {
        name: 'Restore Amina Otieno',
      }),
    ).toBeTruthy();
  });
});

it("shows each seller's earnings and the fees MlimaLink took", async () => {
  const seller: AdminSeller = {
    id: 's1',
    name: 'Juma Mwangi',
    email: 'juma@example.com',
    avatarUrl: null,
    phone: '+254700000000',
    country: 'KE',
    suspended: false,
    shop: { id: 'shop1', name: 'Kicks KE' },
    payoutsConnected: true,
    orders: 4,
    earnings: 270,
    platformFees: 30,
    createdAt: '2026-08-01T10:00:00.000Z',
  };
  reply('GET /api/admin/sellers', 200, { success: true, data: page([seller]) });
  renderDashboard(<SellersPage />);

  const table = await screen.findByRole('table', { name: 'Sellers' });
  expect(within(table).getByText('Fees (10%)')).toBeTruthy();
  expect(within(table).getByText('$270.00')).toBeTruthy();
  expect(within(table).getByText('$30.00')).toBeTruthy();
  expect(within(table).getByText('Payouts connected')).toBeTruthy();
  expect(within(table).getByText('JM')).toBeTruthy();
  expect(
    within(table).getByRole('link', { name: 'Kicks KE' }).getAttribute('href'),
  ).toBe('http://localhost:4200/shops/shop1');
});

describe('Products and events', () => {
  const product: AdminProduct = {
    id: 'p1',
    title: 'Hass avocados',
    imageUrl: 'https://ik.imagekit.io/mlima/avocado.jpg',
    price: 10,
    salePrice: 8,
    discountPercent: 20,
    stock: 39,
    category: 'Fruits & Vegetables',
    subCategory: 'Fruits',
    rating: 4.5,
    reviewCount: 2,
    shopId: 'shop1',
    shopName: 'Kicks KE',
    createdAt: '2026-10-01T10:00:00.000Z',
  };

  it('links each product to its page in the store', async () => {
    reply('GET /api/admin/products', 200, {
      success: true,
      data: page([product]),
    });
    renderDashboard(<ProductsPage />);

    const table = await screen.findByRole('table', { name: 'All Products' });
    expect(
      within(table)
        .getByRole('link', { name: 'View Hass avocados in the store' })
        .getAttribute('href'),
    ).toBe('http://localhost:4200/products/p1');
    expect(within(table).getByText('39 left')).toBeTruthy();
    expect(within(table).getByText('4.5')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Export CSV' }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it('lists products on sale as events', async () => {
    reply('GET /api/admin/products?onSale=true', 200, {
      success: true,
      data: page([product]),
    });
    renderDashboard(<EventsPage />);

    const table = await screen.findByRole('table', { name: 'All Events' });
    expect(within(table).getByText('20% off')).toBeTruthy();
    expect(
      within(table)
        .getByRole('link', { name: 'View Hass avocados in the store' })
        .getAttribute('href'),
    ).toBe('http://localhost:4200/products/p1');
  });
});

describe('Preview pages', () => {
  it('shows the catalog categories and switches tabs on Customization', async () => {
    renderDashboard(<CustomizationPage />);

    expect(
      await screen.findByRole('heading', { name: 'Fruits & Vegetables' }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Add category' }).matches(':disabled'),
    ).toBe(true);

    fireEvent.click(screen.getByRole('tab', { name: 'Logo' }));
    expect(
      screen.getByRole('tab', { name: 'Logo' }).getAttribute('aria-selected'),
    ).toBe('true');
    expect(screen.getByText('Current logo')).toBeTruthy();
  });
});

describe('Notifications', () => {
  const notification = (
    id: string,
    status: 'unread' | 'read',
    title: string,
  ) => ({
    id,
    creatorId: 'u1',
    receiverId: admin.id,
    title,
    message: 'Amina ordered 2 items from Kicks KE for $105.00.',
    redirectLink: '/dashboard/orders',
    status,
    createdAt: '2026-10-13T09:00:00.000Z',
    updatedAt: '2026-10-13T09:00:00.000Z',
  });
  const newOrder = notification('n1', 'unread', 'New order ML-7Q2K9D');
  const cancelled = notification('n2', 'read', 'Order ML-4H8P2C cancelled');

  function withNotifications(unread: number, items: unknown[]) {
    reply('GET /api/admin/notifications/status', 200, {
      success: true,
      data: { unread },
    });
    reply('GET /api/admin/notifications', 200, {
      success: true,
      data: { items, unread },
    });
  }

  it('lists the admin’s notifications and marks one as read', async () => {
    withNotifications(1, [newOrder, cancelled]);
    withNotifications(0, [{ ...newOrder, status: 'read' }, cancelled]);
    reply('PATCH /api/admin/notifications/n1/read', 200, {
      success: true,
      data: { ...newOrder, status: 'read' },
    });
    renderDashboard(<NotificationsPage />);

    const list = await screen.findByRole('list', { name: 'Notifications' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getAllByText('Unread')).toHaveLength(1);
    expect(screen.getByText(/1 unread\./)).toBeTruthy();
    expect(
      within(list)
        .getAllByRole('link', { name: 'View' })[0]
        .getAttribute('href'),
    ).toBe('/dashboard/orders');
    expect(
      await screen.findByRole('link', { name: 'Notifications 1 unread' }),
    ).toBeTruthy();

    fireEvent.click(
      within(list).getByRole('button', {
        name: 'Mark "New order ML-7Q2K9D" as read',
      }),
    );

    await waitFor(() => expect(within(list).queryByText('Unread')).toBeNull());
    expect(fetchCalls()).toContain('PATCH /api/admin/notifications/n1/read');
  });

  it('marks everything read and filters to unread', async () => {
    withNotifications(1, [newOrder, cancelled]);
    reply('PATCH /api/admin/notifications/read-all', 200, {
      success: true,
      data: { updated: 1 },
    });
    reply('GET /api/admin/notifications?status=unread', 200, {
      success: true,
      data: { items: [], unread: 0 },
    });
    renderDashboard(<NotificationsPage />);

    await screen.findByRole('list', { name: 'Notifications' });
    fireEvent.click(screen.getByRole('button', { name: 'Mark all as read' }));
    await waitFor(() =>
      expect(fetchCalls()).toContain('PATCH /api/admin/notifications/read-all'),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(await screen.findByText('You’re all caught up')).toBeTruthy();
  });
});

describe('Loggers', () => {
  const line = (
    id: string,
    level: string,
    source: string,
    message: string,
    timestamp: string,
  ) => ({ id, level, source, message, timestamp });

  const stored = [
    line(
      's2',
      'error',
      'auth-service',
      'Login failed',
      '2026-10-13T09:00:02.000Z',
    ),
    line(
      's1',
      'info',
      'api-gateway',
      'GET /api/admin/overview 200 12ms · admin a1',
      '2026-10-13T09:00:01.000Z',
    ),
  ];

  function logsSocket() {
    const socket = FakeWebSocket.instances.findLast((ws) =>
      ws.url.endsWith('/api/logs/ws'),
    );
    if (!socket) throw new Error('No logs socket');
    return socket;
  }

  const messages = (table: HTMLElement) =>
    within(table)
      .getAllByRole('row')
      .slice(1)
      .map((row) => within(row).getAllByRole('cell')[3].textContent);

  it('shows recent history oldest first, then appends live lines with their service', async () => {
    reply('GET /api/logs?limit=200', 200, {
      logs: stored,
      sources: ['api-gateway', 'auth-service'],
    });
    renderDashboard(<LoggersPage />);

    const table = await screen.findByRole('table', { name: 'Logs' });
    expect(messages(table)).toEqual([
      'GET /api/admin/overview 200 12ms · admin a1',
      'Login failed',
    ]);

    const socket = logsSocket();
    socket.open();
    socket.receive({ type: 'ready' });
    expect(await screen.findByText('Live')).toBeTruthy();

    socket.receive({
      type: 'log',
      log: line(
        'logs-0-7',
        'info',
        'chatting-service',
        'Message sent in c1',
        '2026-10-13T09:00:03.000Z',
      ),
    });
    // The stored line also comes past live; it isn't shown twice.
    socket.receive({ type: 'log', log: { ...stored[0], id: 'logs-0-6' } });

    await waitFor(() => expect(messages(table)).toHaveLength(3));
    expect(messages(table)[2]).toBe('Message sent in c1');
    expect(within(table).getByText('chatting-service')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Service' }), {
      target: { value: 'chatting-service' },
    });
    expect(messages(table)).toEqual(['Message sent in c1']);

    fireEvent.change(screen.getByRole('combobox', { name: 'Level' }), {
      target: { value: 'error' },
    });
    expect(screen.getByText('No log lines found')).toBeTruthy();
  });

  it('renews the session and reconnects when the live feed says it expired', async () => {
    reply('GET /api/logs?limit=200', 200, { logs: [], sources: [] });
    reply('POST /api/auth/refresh-token/admin', 200, { success: true });
    renderDashboard(<LoggersPage />);

    expect(await screen.findByText('Waiting for activity')).toBeTruthy();
    const first = logsSocket();
    first.receive({ type: 'ready' });

    act(() => first.onclose?.({ code: 4001 }));
    expect(await screen.findByText('Reconnecting…')).toBeTruthy();

    await waitFor(() => expect(logsSocket()).not.toBe(first), {
      timeout: 3000,
    });
    expect(fetchCalls()).toContain('POST /api/auth/refresh-token/admin');
  });
});

it('splits payments between MlimaLink, sellers and riders', async () => {
  reply('GET /api/admin/payments', 200, {
    success: true,
    data: {
      ...page([order]),
      summary: {
        platformFees: 10,
        sellerEarnings: 90,
        deliveryFees: 5,
        pendingPlatformFees: 4,
        pendingSellerEarnings: 36,
      },
    },
  });
  renderDashboard(<PaymentsPage />);

  const table = await screen.findByRole('table', { name: 'Order payments' });
  expect(within(table).getByText('MlimaLink (10%)')).toBeTruthy();
  expect(within(table).getByText('Seller (90%)')).toBeTruthy();
  expect(within(table).getByText('$90.00')).toBeTruthy();
  expect(screen.getByText('Pending seller earnings')).toBeTruthy();
  expect(screen.getByText('$36.00')).toBeTruthy();
});

it('rounds chart axes up to tidy numbers', () => {
  expect(niceMax(0)).toBe(1);
  expect(niceMax(7)).toBe(10);
  expect(niceMax(140)).toBe(200);
  expect(niceMax(230)).toBe(250);
});

it('puts a globe dot per country for shoppers and sellers, sized by count', () => {
  const markers = globeMarkers([
    { country: 'KE', users: 9, sellers: 1 },
    { country: 'ug', users: 0, sellers: 4 },
    { country: 'XX', users: 5, sellers: 0 },
  ]);

  expect(markers).toHaveLength(3);
  expect(markers[0].location).toEqual([0.2, 37.9]);
  expect(markers[1].location[1]).toBeCloseTo(39.5);
  expect(markers[2].location).toEqual([1.4, 32.3]);
  expect(markers[0].size).toBeCloseTo(0.085);
  expect(markers[1].size).toBeLessThan(markers[2].size);
});

function fetchCalls(): string[] {
  return (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map(
    ([url, init]) =>
      `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}`,
  );
}
