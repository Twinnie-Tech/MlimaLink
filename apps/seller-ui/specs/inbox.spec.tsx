import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from '../src/app/dashboard/layout';
import InboxPage from '../src/app/dashboard/inbox/page';
import {
  installFetchMock,
  renderPage,
  reply,
  seller,
  shop,
} from './test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  installFetchMock();
  reply('GET /api/auth/logged-in-seller', 200, {
    success: true,
    seller: { ...seller, shop },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Inbox', () => {
  it('lists shoppers’ chats and badges the sidebar with unseen messages', async () => {
    reply('GET /api/chat/unseen?as=seller', 200, { total: 3 });
    reply('GET /api/chat/conversations?as=seller', 200, [
      {
        id: 'c1',
        kind: 'shop',
        title: 'Jane Doe',
        subtitle: null,
        userId: 'u1',
        sellerId: seller.id,
        shopId: shop.id,
        participants: [],
        counterpart: { role: 'user', id: 'u1' },
        presence: { status: 'available', lastSeenAt: null },
        lastMessage: 'Are the mangoes ripe?',
        lastMessageAt: '2026-10-12T09:00:00.000Z',
        unseenCount: 3,
      },
    ]);
    renderPage(
      <DashboardLayout>
        <InboxPage />
      </DashboardLayout>,
    );

    const conversations = await screen.findByRole('list', {
      name: 'Conversations',
    });
    expect(within(conversations).getByText('Jane Doe')).toBeTruthy();
    expect(
      within(conversations).getByRole('img', { name: 'Available' }),
    ).toBeTruthy();

    const nav = screen.getAllByRole('navigation', {
      name: 'Seller dashboard',
    })[0];
    const inbox = within(nav).getByRole('link', { name: /Inbox/ });
    expect(await within(inbox).findByLabelText('3 unread')).toBeTruthy();
    expect(inbox.getAttribute('aria-current')).toBe('page');
  });

  it('says so when there are no chats yet', async () => {
    reply('GET /api/chat/conversations?as=seller', 200, []);
    renderPage(
      <DashboardLayout>
        <InboxPage />
      </DashboardLayout>,
    );

    expect(
      await screen.findByText(
        'No conversations yet. When a shopper messages your shop, it opens here.',
      ),
    ).toBeTruthy();
    expect(screen.getByText('Select a conversation')).toBeTruthy();
  });
});
