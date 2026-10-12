import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DashboardLayout from '../src/app/dashboard/layout';
import InboxPage from '../src/app/dashboard/inbox/page';
import {
  FakeWebSocket,
  admin,
  installFetchMock,
  renderPage,
  reply,
} from './test-utils';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/dashboard/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

const supportChat = {
  id: 'c1',
  kind: 'support',
  title: 'Jane Doe',
  subtitle: 'Shopper',
  userId: 'u1',
  sellerId: null,
  shopId: null,
  participants: [{ role: 'user', id: 'u1' }],
  counterpart: { role: 'user', id: 'u1' },
  presence: { status: 'available', lastSeenAt: null },
  lastMessage: 'My order hasn’t arrived',
  lastMessageAt: '2026-10-12T09:00:00.000Z',
  unseenCount: 2,
};

function renderInbox() {
  reply('GET /api/auth/logged-in-admin', 200, { success: true, admin });
  return renderPage(
    <DashboardLayout>
      <InboxPage />
    </DashboardLayout>,
  );
}

const sidebar = () =>
  screen.getAllByRole('navigation', { name: 'Admin dashboard' })[0];

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Support inbox', () => {
  it('lists support chats and badges the sidebar with unseen messages', async () => {
    reply('GET /api/chat/unseen?as=admin', 200, { total: 2 });
    reply('GET /api/chat/conversations?as=admin', 200, [supportChat]);
    renderInbox();

    const conversations = await screen.findByRole('list', {
      name: 'Conversations',
    });
    expect(within(conversations).getByText('Jane Doe')).toBeTruthy();
    expect(
      within(conversations).getByText('My order hasn’t arrived'),
    ).toBeTruthy();

    const inbox = within(sidebar()).getByRole('link', { name: /Inbox/ });
    expect(inbox.getAttribute('href')).toBe('/dashboard/inbox');
    expect(inbox.getAttribute('aria-current')).toBe('page');
    expect(await within(inbox).findByLabelText('2 unread')).toBeTruthy();
    expect(FakeWebSocket.instances[0].url).toMatch(
      /\/api\/chat\/ws\?as=admin$/,
    );
  });

  it('says so when nobody has contacted support yet', async () => {
    reply('GET /api/chat/conversations?as=admin', 200, []);
    renderInbox();

    expect(
      await screen.findByText(
        'No conversations yet. When a shopper or seller contacts support, it opens here.',
      ),
    ).toBeTruthy();
  });

  it('lets the admin set their status by hand', async () => {
    reply('GET /api/chat/conversations?as=admin', 200, []);
    renderInbox();
    await screen.findByText('Select a conversation');
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.receive({ type: 'status', manual: null });

    const [picker] = screen.getAllByRole('button', {
      name: 'Your status: Available',
    });
    fireEvent.click(picker);
    fireEvent.click(
      screen.getByRole('menuitemradio', { name: /Do not disturb/ }),
    );

    expect(socket.sent).toContainEqual({ type: 'status', status: 'dnd' });
    await waitFor(() =>
      expect(
        screen.getAllByRole('button', {
          name: 'Your status: Do not disturb',
        }).length,
      ).toBeGreaterThan(0),
    );
  });
});
