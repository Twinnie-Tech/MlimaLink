import type { ReactElement } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import InboxPage from '../src/app/inbox/page';
import { ChatLiveProvider } from '../src/app/shared/providers/chat-live-provider';
import { QueryProvider } from '../src/app/shared/providers/query-provider';
import { ShopStoreProvider } from '../src/app/shared/store/shop-store';
import { takeReturnTo } from '../src/app/shared/utils/return-to';
import { HeaderActions } from '../src/app/shared/widgets/header-actions';
import { MessageShopButton } from '../src/app/shared/widgets/message-shop-button';

const push = vi.fn();
const replace = vi.fn();
const navigation = { pathname: '/inbox', search: '' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => navigation.pathname,
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

class IdleWebSocket {
  static readonly OPEN = 1;
  readyState = 0;
  onopen = null;
  onmessage = null;
  onclose = null;
  send = vi.fn();
  close = vi.fn();
}

const jane = {
  id: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  role: 'user',
};

type Reply = { status: number; body: unknown };
let replies: Record<string, Reply> = {};
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const { status, body } = replies[`${init?.method ?? 'GET'} ${url}`] ?? {
    status: 401,
    body: { success: false, error: 'Unauthorized! Please log in.' },
  };
  return { ok: status >= 200 && status < 300, status, json: async () => body };
});

const signedIn = () => {
  replies['GET /api/auth/logged-in-user'] = {
    status: 200,
    body: { success: true, user: jane },
  };
};

function renderWithProviders(ui: ReactElement) {
  return render(
    <QueryProvider>
      <ChatLiveProvider>
        <ShopStoreProvider>{ui}</ShopStoreProvider>
      </ChatLiveProvider>
    </QueryProvider>,
  );
}

beforeEach(() => {
  replies = {};
  push.mockClear();
  replace.mockClear();
  fetchMock.mockClear();
  navigation.pathname = '/inbox';
  navigation.search = '';
  sessionStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('WebSocket', IdleWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Inbox page', () => {
  it('sends signed-out shoppers to login and brings them back to the same chat', async () => {
    navigation.search = 'conversationId=c1';
    renderWithProviders(<InboxPage />);

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(takeReturnTo()).toBe('/inbox?conversationId=c1');
  });

  it('shows the shopper’s chats', async () => {
    signedIn();
    replies['GET /api/chat/conversations?as=user'] = {
      status: 200,
      body: [
        {
          id: 'c1',
          kind: 'shop',
          title: 'Mlima Fresh',
          subtitle: null,
          userId: 'u1',
          sellerId: 's1',
          shopId: 'shop1',
          participants: [],
          counterpart: { role: 'seller', id: 's1' },
          presence: { status: 'away', lastSeenAt: null },
          lastMessage: 'Fresh mangoes today',
          lastMessageAt: '2026-10-12T09:00:00.000Z',
          unseenCount: 1,
        },
      ],
    };
    renderWithProviders(<InboxPage />);

    expect(await screen.findByText('Fresh mangoes today')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Away' })).toBeTruthy();
    expect(screen.getByLabelText('1 unread')).toBeTruthy();
    expect(replace).not.toHaveBeenCalledWith('/login');
  });
});

describe('MessageShopButton', () => {
  /** The header shows the shopper's name once the session has loaded. */
  function renderButton(signedInAs: string) {
    renderWithProviders(
      <>
        <HeaderActions />
        <MessageShopButton shopId="shop1" />
      </>,
    );
    return screen.findByText(signedInAs);
  }

  it('opens the shop chat and goes to it', async () => {
    signedIn();
    replies['POST /api/chat/conversations?as=user'] = {
      status: 200,
      body: { id: 'c9' },
    };
    await renderButton('Jane');

    fireEvent.click(screen.getByRole('button', { name: 'Message shop' }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith('/inbox?conversationId=c9'),
    );
    const [, init] = fetchMock.mock.calls.find(
      ([url]) => url === '/api/chat/conversations?as=user',
    ) as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ shopId: 'shop1' });
  });

  it('asks signed-out shoppers to log in first', async () => {
    await renderButton('Sign In');

    fireEvent.click(screen.getByRole('button', { name: 'Message shop' }));

    expect(push).toHaveBeenCalledWith('/login');
    expect(takeReturnTo()).toBe('/shops/shop1');
  });

  it('explains when the shop can’t take messages', async () => {
    signedIn();
    replies['POST /api/chat/conversations?as=user'] = {
      status: 404,
      body: { message: 'That shop isn’t taking messages right now.' },
    };
    await renderButton('Jane');

    fireEvent.click(screen.getByRole('button', { name: 'Message shop' }));

    expect((await screen.findByRole('alert')).textContent).toBe(
      'That shop isn’t taking messages right now.',
    );
    expect(push).not.toHaveBeenCalled();
  });
});

describe('Header messages link', () => {
  it('shows unseen messages for signed-in shoppers only', async () => {
    renderWithProviders(<HeaderActions />);
    await screen.findByText('Sign In');
    expect(screen.queryByRole('link', { name: /Messages/ })).toBeNull();
  });

  it('links to the inbox with the unseen count', async () => {
    signedIn();
    replies['GET /api/chat/unseen?as=user'] = {
      status: 200,
      body: { total: 5 },
    };
    renderWithProviders(<HeaderActions />);

    const link = await screen.findByRole('link', {
      name: 'Messages, 5 unread',
    });
    expect(link.getAttribute('href')).toBe('/inbox');
    expect(link.textContent).toBe('5');
  });
});
