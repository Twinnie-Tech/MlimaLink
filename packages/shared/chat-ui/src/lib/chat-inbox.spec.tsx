import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  ChatMessage,
  ConversationSummary,
  MessagePage,
} from '@org/models/chat';
import { ChatInbox } from './chat-inbox';
import { ChatProvider } from './chat-provider';
import { StatusPicker } from './status-picker';

const replace = vi.fn();
const push = vi.fn();
const navigation = { search: '' };

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push }),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(navigation.search),
}));

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  sent: Record<string, unknown>[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: ((event: { code: number }) => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
  }

  open() {
    act(() => {
      this.readyState = FakeWebSocket.OPEN;
      this.onopen?.();
    });
  }

  receive(event: unknown) {
    act(() => this.onmessage?.({ data: JSON.stringify(event) }));
  }

  drop(code: number) {
    act(() => {
      this.readyState = FakeWebSocket.CLOSED;
      this.onclose?.({ code });
    });
  }
}

const latestSocket = () => FakeWebSocket.instances.at(-1) as FakeWebSocket;

type Reply = { status: number; body: unknown };
const replies = new Map<string, Reply[]>();
const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const route = `${init?.method ?? 'GET'} ${url}`;
  const queued = replies.get(route);
  const next = queued && queued.length > 1 ? queued.shift() : queued?.[0];
  const { status, body } = next ?? {
    status: 500,
    body: { message: `Unexpected ${route}` },
  };
  return { ok: status >= 200 && status < 300, status, json: async () => body };
});

function reply(route: string, status: number, body: unknown) {
  replies.set(route, [...(replies.get(route) ?? []), { status, body }]);
}

const chat = (
  overrides: Partial<ConversationSummary>,
): ConversationSummary => ({
  id: 'c1',
  kind: 'shop',
  title: 'Mlima Fresh',
  subtitle: null,
  userId: 'u1',
  sellerId: 's1',
  shopId: 'shop1',
  participants: [
    { role: 'user', id: 'u1' },
    { role: 'seller', id: 's1' },
  ],
  counterpart: { role: 'seller', id: 's1' },
  presence: { status: 'available', lastSeenAt: '2026-10-12T09:00:00.000Z' },
  lastMessage: 'Do you deliver?',
  lastMessageAt: '2026-10-12T09:00:00.000Z',
  unseenCount: 2,
  ...overrides,
});

const message = (
  id: string,
  body: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage => ({
  id,
  conversationId: 'c1',
  senderRole: 'seller',
  senderId: 's1',
  senderName: 'Amina',
  body,
  attachments: [],
  files: [],
  gif: null,
  replyTo: null,
  reactions: [],
  editedAt: null,
  deletedAt: null,
  createdAt: `2026-10-12T09:0${id.slice(-1)}:00.000Z`,
  ...overrides,
});
const mine = {
  senderRole: 'user',
  senderId: 'u1',
  senderName: 'Juma',
} as const;

const page = (
  messages: ChatMessage[],
  more = false,
  seenAt: string | null = null,
): MessagePage => ({
  messages,
  hasMore: more,
  nextCursor: more ? (messages.at(-1)?.id ?? null) : null,
  lastReadAt: '2026-10-12T10:00:00.000Z',
  seenAt,
});

const shopChat = chat({});
const supportChat = chat({
  id: 'c2',
  kind: 'support',
  title: 'MlimaLink support',
  sellerId: null,
  shopId: null,
  counterpart: null,
  presence: null,
  lastMessage: 'Welcome!',
  unseenCount: 0,
});

function renderLive(children: ReactNode, viewerId: string | null = 'u1') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <ChatProvider
        account="user"
        viewerId={viewerId}
        refreshSession={refreshSession}
        inboxPath="/inbox"
      >
        {children}
      </ChatProvider>
    </QueryClientProvider>,
  );
}

const renderInbox = () => renderLive(<ChatInbox emptyHint="No chats yet." />);

const refreshSession = vi.fn(async () => undefined);
const messagesList = () => screen.getByRole('list', { name: 'Messages' });

beforeEach(() => {
  replies.clear();
  fetchMock.mockClear();
  replace.mockClear();
  push.mockClear();
  refreshSession.mockClear();
  document.title = 'MlimaLink Shop';
  navigation.search = '';
  FakeWebSocket.instances = [];
  vi.stubGlobal('fetch', fetchMock);
  vi.stubGlobal('WebSocket', FakeWebSocket);
  reply('GET /api/chat/conversations?as=user', 200, [shopChat, supportChat]);
  reply('GET /api/chat/unseen?as=user', 200, { total: 0 });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatInbox', () => {
  it('lists chats with unseen counts and presence, then opens one and clears its count', async () => {
    reply(
      'GET /api/chat/conversations/c1/messages?as=user',
      200,
      page([message('m2', 'Yes, same day'), message('m1', 'Hello')]),
    );
    renderInbox();

    const list = await screen.findByRole('list', { name: 'Conversations' });
    expect(within(list).getByLabelText('2 unread')).toBeInTheDocument();
    expect(
      within(list).getByRole('img', { name: 'Available' }),
    ).toBeInTheDocument();

    fireEvent.click(within(list).getByRole('button', { name: /Mlima Fresh/ }));

    expect(replace).toHaveBeenCalledWith('/inbox?conversationId=c1', {
      scroll: false,
    });
    await waitFor(() =>
      expect(
        within(messagesList())
          .getAllByRole('listitem')
          .map((item) => item.textContent),
      ).toEqual([
        expect.stringContaining('Hello'),
        expect.stringContaining('Yes, same day'),
      ]),
    );
    expect(within(list).queryByLabelText('2 unread')).toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Mlima Fresh' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Available', { selector: 'p' }),
    ).toBeInTheDocument();
  });

  it('opens the chat named in the URL and sends over the socket', async () => {
    navigation.search = 'conversationId=c1';
    reply('GET /api/chat/conversations/c1/messages?as=user', 200, page([]));
    renderInbox();
    latestSocket().open();

    expect(
      await screen.findByText('No messages yet. Say hello!'),
    ).toBeInTheDocument();
    expect(latestSocket().url).toBe('ws://localhost:3000/api/chat/ws?as=user');

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: '  Is it fresh?  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(latestSocket().sent).toContainEqual(
        expect.objectContaining({
          type: 'send',
          conversationId: 'c1',
          body: 'Is it fresh?',
        }),
      ),
    );
    expect(await screen.findByText('Sending…')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toHaveValue('');

    const { clientId } = latestSocket().sent.find(
      (event) => event.type === 'send',
    ) as { clientId: string };
    latestSocket().receive({
      type: 'sent',
      clientId,
      message: message('m5', 'Is it fresh?', {
        senderRole: 'user',
        senderId: 'u1',
      }),
    });

    expect(screen.queryByText('Sending…')).toBeNull();
    expect(
      within(messagesList()).getByText('Is it fresh?'),
    ).toBeInTheDocument();
  });

  it('counts live messages in other chats and reads them in the open one', async () => {
    navigation.search = 'conversationId=c1';
    reply('GET /api/chat/conversations/c1/messages?as=user', 200, page([]));
    renderInbox();
    latestSocket().open();
    await screen.findByText('No messages yet. Say hello!');

    latestSocket().receive({
      type: 'message',
      message: message('m6', 'Your ticket is open', {
        conversationId: 'c2',
        senderRole: 'admin',
        senderId: 'a1',
      }),
    });
    const list = screen.getByRole('list', { name: 'Conversations' });
    const [first] = within(list).getAllByRole('button');
    expect(first).toHaveTextContent('MlimaLink support');
    expect(within(first).getByLabelText('1 unread')).toBeInTheDocument();

    latestSocket().receive({
      type: 'message',
      message: message('m7', 'Still there?'),
    });
    expect(
      within(messagesList()).getByText('Still there?'),
    ).toBeInTheDocument();
    expect(latestSocket().sent).toContainEqual({
      type: 'read',
      conversationId: 'c1',
    });
  });

  it('shows why a chat cannot be opened', async () => {
    navigation.search = 'conversationId=other';
    reply('GET /api/chat/conversations/other/messages?as=user', 403, {
      message: 'You don’t have access to this conversation.',
    });
    reply('GET /api/chat/conversations/other?as=user', 403, {
      message: 'You don’t have access to this conversation.',
    });
    renderInbox();

    expect(
      await screen.findByText('You don’t have access to this conversation.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeDisabled();
  });

  it('loads earlier messages with the cursor', async () => {
    navigation.search = 'conversationId=c1';
    reply(
      'GET /api/chat/conversations/c1/messages?as=user',
      200,
      page([message('m4', 'Newest'), message('m3', 'Newer')], true),
    );
    reply(
      'GET /api/chat/conversations/c1/messages?cursor=m3&as=user',
      200,
      page([message('m1', 'Oldest')]),
    );
    renderInbox();

    fireEvent.click(
      await screen.findByRole('button', { name: 'Load earlier messages' }),
    );

    await waitFor(() =>
      expect(
        within(messagesList())
          .getAllByRole('listitem')
          .map(
            (item) => item.textContent?.match(/^(Oldest|Newer|Newest)/)?.[0],
          ),
      ).toEqual(['Oldest', 'Newer', 'Newest']),
    );
    expect(
      screen.queryByRole('button', { name: 'Load earlier messages' }),
    ).toBeNull();
  });

  it('sends over HTTP while the socket is down', async () => {
    navigation.search = 'conversationId=c1';
    reply('GET /api/chat/conversations/c1/messages?as=user', 200, page([]));
    reply(
      'POST /api/chat/conversations/c1/messages?as=user',
      202,
      message('m8', 'Over HTTP', { senderRole: 'user', senderId: 'u1' }),
    );
    renderInbox();
    await screen.findByText('No messages yet. Say hello!');
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Over HTTP' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(within(messagesList()).getByText('Over HTTP')).toBeInTheDocument(),
    );
  });

  it('refreshes the session and reconnects when the socket says it expired', async () => {
    renderInbox();
    latestSocket().open();
    latestSocket().drop(4001);

    await waitFor(() => expect(refreshSession).toHaveBeenCalled());
    await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(2));
  });

  it('tells the server when the person goes idle', async () => {
    vi.useFakeTimers();
    try {
      renderInbox();
      latestSocket().open();

      act(() => {
        vi.advanceTimersByTime(5 * 60_000 + 15_000);
      });
      expect(latestSocket().sent).toContainEqual({
        type: 'presence',
        status: 'away',
      });

      fireEvent.keyDown(window, { key: 'a' });
      expect(latestSocket().sent).toContainEqual({
        type: 'presence',
        status: 'available',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates statuses the moment the server pushes them', async () => {
    renderInbox();
    latestSocket().open();
    expect(latestSocket().sent).toContainEqual({ type: 'watch' });
    const list = await screen.findByRole('list', { name: 'Conversations' });
    expect(within(list).getByRole('img', { name: 'Available' })).toBeTruthy();

    latestSocket().receive({
      type: 'presence',
      updates: [
        {
          key: 'seller:s1',
          status: 'away',
          lastSeenAt: '2026-10-12T09:30:00.000Z',
        },
      ],
    });

    expect(within(list).getByRole('img', { name: 'Away' })).toBeTruthy();
    expect(within(list).queryByRole('img', { name: 'Available' })).toBeNull();
  });

  it('marks unsent messages when the connection drops', async () => {
    navigation.search = 'conversationId=c1';
    reply('GET /api/chat/conversations/c1/messages?as=user', 200, page([]));
    renderInbox();
    latestSocket().open();
    await screen.findByText('No messages yet. Say hello!');

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Hello?' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));
    await screen.findByText('Sending…');

    latestSocket().drop(1006);

    expect(
      await screen.findByText(/The connection dropped/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Reconnecting/)).toBeInTheDocument();
  });

  async function openChatWith(messages: ChatMessage[], seenAt?: string) {
    navigation.search = 'conversationId=c1';
    reply(
      'GET /api/chat/conversations/c1/messages?as=user',
      200,
      page(messages, false, seenAt ?? null),
    );
    renderInbox();
    latestSocket().open();
    await screen.findByRole('list', { name: 'Messages' });
  }

  it('ticks your messages as seen when the other side reads them', async () => {
    await openChatWith(
      [message('m2', 'Second', mine), message('m1', 'First', mine)],
      '2026-10-12T09:01:00.000Z',
    );

    const [first, second] = within(messagesList()).getAllByRole('listitem');
    expect(within(first).getByRole('img', { name: 'Seen' })).toBeTruthy();
    expect(within(second).getByRole('img', { name: 'Sent' })).toBeTruthy();

    // Another shopper's receipt can't arrive here; the seller's can.
    latestSocket().receive({
      type: 'seen',
      conversationId: 'c1',
      reader: 'user:u1',
      lastReadAt: '2026-10-12T09:05:00.000Z',
    });
    expect(within(second).getByRole('img', { name: 'Sent' })).toBeTruthy();
    latestSocket().receive({
      type: 'seen',
      conversationId: 'c1',
      reader: 'seller:s1',
      lastReadAt: '2026-10-12T09:05:00.000Z',
    });
    expect(within(second).getByRole('img', { name: 'Seen' })).toBeTruthy();
  });

  it('shows who is typing, and says so while you type', async () => {
    await openChatWith([message('m1', 'Hello')]);

    latestSocket().receive({
      type: 'typing',
      conversationId: 'c1',
      from: { key: 'seller:s1', name: 'Amina' },
    });
    expect(screen.getByText('Amina is typing…')).toBeInTheDocument();

    latestSocket().receive({
      type: 'message',
      message: message('m2', 'We deliver'),
    });
    expect(screen.queryByText('Amina is typing…')).toBeNull();

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Gr' },
    });
    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Great' },
    });
    expect(
      latestSocket().sent.filter((event) => event.type === 'typing'),
    ).toEqual([{ type: 'typing', conversationId: 'c1' }]);
  });

  it('shows edits and deletions as they happen', async () => {
    await openChatWith([message('m1', 'Hello')]);

    latestSocket().receive({
      type: 'updated',
      message: message('m1', 'Hello there', {
        editedAt: '2026-10-12T09:03:00.000Z',
      }),
    });
    const [bubble] = within(messagesList()).getAllByRole('listitem');
    expect(bubble).toHaveTextContent('Hello there');
    expect(bubble).toHaveTextContent('Edited');

    latestSocket().receive({
      type: 'updated',
      message: message('m1', '', {
        deletedAt: '2026-10-12T09:04:00.000Z',
      }),
    });
    expect(bubble).toHaveTextContent('This message was deleted');
    expect(within(bubble).queryByRole('button', { name: 'Reply' })).toBeNull();
  });

  it('replies to a message with a quote', async () => {
    await openChatWith([message('m1', 'Do you have size 42?')]);

    fireEvent.click(screen.getByRole('button', { name: 'Reply' }));
    expect(screen.getByText('Replying to Amina')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Message'), {
      target: { value: 'Yes please' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    await waitFor(() =>
      expect(latestSocket().sent).toContainEqual(
        expect.objectContaining({
          type: 'send',
          body: 'Yes please',
          replyToId: 'm1',
        }),
      ),
    );
    expect(screen.queryByText('Replying to Amina')).toBeNull();
    const pending = within(messagesList()).getAllByRole('listitem').at(-1);
    expect(pending).toHaveTextContent('Do you have size 42?');
  });

  it('edits and deletes your own messages, and only yours', async () => {
    await openChatWith([
      message('m2', 'Typo here', mine),
      message('m1', 'Hi', { senderName: 'Amina' }),
    ]);
    reply(
      'PATCH /api/chat/conversations/c1/messages/m2?as=user',
      200,
      message('m2', 'Fixed', { ...mine, editedAt: '2026-10-12T09:05:00.000Z' }),
    );
    reply(
      'DELETE /api/chat/conversations/c1/messages/m2?as=user',
      200,
      message('m2', '', { ...mine, deletedAt: '2026-10-12T09:06:00.000Z' }),
    );
    const [theirs, own] = within(messagesList()).getAllByRole('listitem');
    expect(within(theirs).queryByRole('button', { name: 'Edit' })).toBeNull();
    expect(within(theirs).queryByRole('button', { name: 'Delete' })).toBeNull();

    fireEvent.click(within(own).getByRole('button', { name: 'Edit' }));
    const box = screen.getByLabelText('Message');
    expect(box).toHaveValue('Typo here');
    fireEvent.change(box, { target: { value: 'Fixed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(own).toHaveTextContent('Fixed'));
    expect(own).toHaveTextContent('Edited');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/conversations/c1/messages/m2?as=user',
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ body: 'Fixed' }),
      }),
    );
    expect(screen.getByLabelText('Message')).toHaveValue('');

    fireEvent.click(within(own).getByRole('button', { name: 'Delete' }));
    fireEvent.click(
      within(screen.getByRole('dialog', { name: 'Delete message' })).getByRole(
        'button',
        { name: 'Delete' },
      ),
    );
    await waitFor(() =>
      expect(own).toHaveTextContent('This message was deleted'),
    );
  });

  it('reacts with a quick reaction and shows who reacted', async () => {
    await openChatWith([message('m1', 'New stock in!')]);
    reply(
      'POST /api/chat/conversations/c1/messages/m1/reactions?as=user',
      200,
      message('m1', 'New stock in!', {
        reactions: [
          { emoji: '❤️', key: 'seller:s9', name: 'Baraka' },
          { emoji: '❤️', key: 'user:u1', name: 'Juma' },
        ],
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'React' }));
    fireEvent.click(screen.getByRole('button', { name: 'React with ❤️' }));

    const chip = await screen.findByRole('button', {
      name: '❤️ 2: Baraka, You',
    });
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/chat/conversations/c1/messages/m1/reactions?as=user',
      expect.objectContaining({ body: JSON.stringify({ emoji: '❤️' }) }),
    );
  });

  it('shows a reaction before the server answers, through live updates in between', async () => {
    await openChatWith([message('m1', 'New stock in!')]);
    type Answer = Awaited<ReturnType<typeof fetchMock>>;
    let answer: (value: Answer) => void = () => undefined;
    fetchMock.mockImplementationOnce(
      () => new Promise<Answer>((resolve) => (answer = resolve)),
    );

    fireEvent.click(screen.getByRole('button', { name: 'React' }));
    fireEvent.click(screen.getByRole('button', { name: 'React with ❤️' }));

    expect(screen.getByRole('button', { name: '❤️ 1: You' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    latestSocket().receive({
      type: 'updated',
      message: message('m1', 'New stock in!', {
        reactions: [{ emoji: '👍', key: 'seller:s9', name: 'Baraka' }],
      }),
    });
    expect(screen.getByRole('button', { name: '👍 1: Baraka' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '❤️ 1: You' })).toBeTruthy();

    const saved = message('m1', 'New stock in!', {
      reactions: [
        { emoji: '👍', key: 'seller:s9', name: 'Baraka' },
        { emoji: '❤️', key: 'user:u1', name: 'Juma' },
      ],
    });
    await act(async () =>
      answer({ ok: true, status: 200, json: async () => saved }),
    );
    expect(screen.getByRole('button', { name: '❤️ 1: You' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '👍 1: Baraka' })).toBeTruthy();
  });

  it('takes a reaction back when the server refuses it', async () => {
    await openChatWith([message('m1', 'New stock in!')]);
    reply(
      'POST /api/chat/conversations/c1/messages/m1/reactions?as=user',
      400,
      {
        message: 'You can’t react to a deleted message.',
      },
    );

    fireEvent.click(screen.getByRole('button', { name: 'React' }));
    fireEvent.click(screen.getByRole('button', { name: 'React with 👍' }));
    expect(screen.getByRole('button', { name: '👍 1: You' })).toBeTruthy();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You can’t react to a deleted message.',
    );
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: '👍 1: You' })).toBeNull(),
    );
  });

  it('explains when an upload is refused', async () => {
    await openChatWith([message('m1', 'Send me the invoice')]);
    reply('POST /api/chat/attachments?name=scan.pdf&as=user', 413, {
      message:
        'That file is over the 10 MB limit. Please compress it to under 10 MB and try again.',
    });

    fireEvent.change(screen.getByLabelText('Choose photos or documents'), {
      target: {
        files: [new File(['%PDF-'], 'scan.pdf', { type: 'application/pdf' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Please compress it to under 10 MB',
    );
    expect(latestSocket().sent.some((event) => event.type === 'send')).toBe(
      false,
    );
  });
});

describe('ChatProvider', () => {
  it('pops up new messages on any page and opens the chat from there', async () => {
    renderLive(<p>Product page</p>);
    latestSocket().open();

    latestSocket().receive({
      type: 'message',
      message: message('m1', 'Your order is ready', { conversationId: 'c4' }),
    });

    const toasts = screen.getByRole('list', { name: 'New messages' });
    expect(within(toasts).getByText('Amina')).toBeInTheDocument();
    expect(within(toasts).getByText('Your order is ready')).toBeInTheDocument();

    fireEvent.click(within(toasts).getByRole('button', { name: /Amina/ }));
    expect(push).toHaveBeenCalledWith('/inbox?conversationId=c4');
    expect(screen.queryByRole('list', { name: 'New messages' })).toBeNull();
  });

  it('stays quiet about the person’s own messages and the chat on screen', async () => {
    navigation.search = 'conversationId=c1';
    reply('GET /api/chat/conversations/c1/messages?as=user', 200, page([]));
    renderInbox();
    latestSocket().open();
    await screen.findByText('No messages yet. Say hello!');

    latestSocket().receive({
      type: 'message',
      message: message('m2', 'On screen'),
    });
    latestSocket().receive({
      type: 'message',
      message: message('m3', 'Mine', {
        conversationId: 'c2',
        senderRole: 'user',
        senderId: 'u1',
      }),
    });

    expect(screen.queryByRole('list', { name: 'New messages' })).toBeNull();
  });

  it('keeps quiet while an admin is on do not disturb', async () => {
    renderLive(<p>Dashboard</p>);
    latestSocket().open();

    latestSocket().receive({ type: 'status', manual: 'dnd' });
    latestSocket().receive({
      type: 'message',
      message: message('m1', 'Urgent?', { conversationId: 'c4' }),
    });

    expect(screen.queryByRole('list', { name: 'New messages' })).toBeNull();
  });

  it('puts the unseen count in the tab title', async () => {
    replies.set('GET /api/chat/unseen?as=user', [
      { status: 200, body: { total: 3 } },
    ]);
    renderLive(<p>Home</p>);

    await waitFor(() => expect(document.title).toBe('(3) MlimaLink Shop'));
  });

  it('does not connect for someone signed out', () => {
    renderLive(<p>Home</p>, null);

    expect(FakeWebSocket.instances).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('signs in with a ticket when the socket is on another site', async () => {
    vi.stubEnv('NEXT_PUBLIC_CHAT_WS_URL', 'wss://api.example/api/chat/ws');
    try {
      reply('POST /api/chat/socket-ticket?as=user', 200, { ticket: 't1' });
      renderLive(<p>Home</p>);

      await waitFor(() => expect(FakeWebSocket.instances).toHaveLength(1));
      expect(latestSocket().url).toBe(
        'wss://api.example/api/chat/ws?as=user&ticket=t1',
      );
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe('StatusPicker', () => {
  it('sets a status by hand, follows other tabs, and goes back to automatic', async () => {
    renderLive(<StatusPicker />);
    expect(
      screen.getByRole('button', { name: 'Your status: Connecting…' }),
    ).toBeInTheDocument();
    latestSocket().open();
    latestSocket().receive({ type: 'status', manual: null });

    fireEvent.click(
      screen.getByRole('button', { name: 'Your status: Available' }),
    );
    fireEvent.click(screen.getByRole('menuitemradio', { name: /Busy/ }));

    expect(latestSocket().sent).toContainEqual({
      type: 'status',
      status: 'busy',
    });
    expect(
      screen.getByRole('button', { name: 'Your status: Busy' }),
    ).toBeInTheDocument();

    latestSocket().receive({ type: 'status', manual: 'offline' });
    const button = screen.getByRole('button', {
      name: 'Your status: Appear offline',
    });

    fireEvent.click(button);
    expect(
      screen.getByRole('menuitemradio', { name: /Appear offline/ }),
    ).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('menuitemradio', { name: /^Available/ }));
    expect(latestSocket().sent).toContainEqual({
      type: 'status',
      status: null,
    });
    expect(
      screen.getByRole('button', { name: 'Your status: Available' }),
    ).toBeInTheDocument();
  });
});
