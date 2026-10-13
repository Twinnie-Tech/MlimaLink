import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Notification } from '@org/models';
import DashboardLayout from '../src/app/dashboard/layout';
import NotificationsPage from '../src/app/dashboard/notifications/page';
import {
  fetchMock,
  installFetchMock,
  renderPage,
  reply,
  seller,
  shop,
} from './test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/notifications',
}));

const notification = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  creatorId: 'u1',
  receiverId: seller.id,
  title: 'New order ML-7Q2K9D',
  message:
    'Jane Doe ordered 2 items for $23.00. Confirm it from your Orders page.',
  redirectLink: '/dashboard/orders',
  status: 'unread',
  createdAt: '2026-10-13T09:00:00.000Z',
  updatedAt: '2026-10-13T09:00:00.000Z',
  ...overrides,
});

const calls = () =>
  fetchMock.mock.calls.map(
    ([url, init]) =>
      `${(init as RequestInit | undefined)?.method ?? 'GET'} ${url}`,
  );

beforeEach(() => installFetchMock());
afterEach(() => vi.unstubAllGlobals());

function signedIn(stripeId: string | null = 'acct_1') {
  reply('GET /api/auth/logged-in-seller', 200, {
    success: true,
    seller: { ...seller, stripeId, shop },
  });
}

it('lists the seller’s notifications, badges the sidebar and marks one read', async () => {
  signedIn();
  reply('GET /api/seller/notifications/status', 200, {
    success: true,
    data: { unread: 1 },
  });
  reply('GET /api/seller/notifications', 200, {
    success: true,
    data: {
      items: [
        notification(),
        notification({
          id: 'n2',
          title: 'Order ML-AAAAAA was delivered',
          message: 'Otieno delivered it to Jane Doe.',
          status: 'read',
        }),
      ],
      unread: 1,
    },
  });
  reply('PATCH /api/seller/notifications/n1/read', 200, {
    success: true,
    data: notification({ status: 'read' }),
  });
  renderPage(
    <DashboardLayout>
      <NotificationsPage />
    </DashboardLayout>,
  );

  const list = await screen.findByRole('list', { name: 'Notifications' });
  expect(within(list).getAllByRole('listitem')).toHaveLength(2);
  expect(within(list).getAllByText('Unread')).toHaveLength(1);
  expect(
    screen.getByRole('link', { name: 'Notifications 1 unread' }),
  ).toBeTruthy();
  expect(screen.queryByText(/Connect your bank/)).toBeNull();

  fireEvent.click(
    within(list).getByRole('button', {
      name: 'Mark "New order ML-7Q2K9D" as read',
    }),
  );

  await waitFor(() => expect(within(list).queryByText('Unread')).toBeNull());
  expect(calls()).toContain('PATCH /api/seller/notifications/n1/read');
});

it('reminds sellers without a payout account and shows an empty feed', async () => {
  signedIn(null);
  reply('GET /api/seller/notifications', 200, {
    success: true,
    data: { items: [], unread: 0 },
  });
  renderPage(
    <DashboardLayout>
      <NotificationsPage />
    </DashboardLayout>,
  );

  expect(await screen.findByText('No notifications yet')).toBeTruthy();
  expect(screen.getByText(/Connect your bank/)).toBeTruthy();
  expect(
    screen
      .getByRole('button', { name: 'Mark all as read' })
      .matches(':disabled'),
  ).toBe(true);
});
