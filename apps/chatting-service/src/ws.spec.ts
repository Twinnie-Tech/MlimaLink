import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, type WebSocketServer } from 'ws';
import {
  announceTyping,
  counterpartKeys,
  markRead,
  sendMessage,
} from './chat/conversations';
import { ChatHub } from './chat/hub';
import { authenticate, type Participant } from './chat/participants';
import { MemoryPresenceStore } from './chat/presence';
import { LocalPresenceBus, type PresenceUpdate } from './chat/presence-bus';
import { HttpError } from './http-error';
import { SESSION_EXPIRED_CODE, allowedOrigins, attachChatSockets } from './ws';

vi.mock('./chat/participants', () => ({ authenticate: vi.fn() }));
vi.mock('./chat/conversations', () => ({
  announceTyping: vi.fn(),
  counterpartKeys: vi.fn(),
  markRead: vi.fn(),
  sendMessage: vi.fn(),
}));

const shopper: Participant = {
  role: 'user',
  id: 'a'.repeat(24),
  name: 'Amina',
  expiresAt: Date.now() + 60_000,
};
const admin: Participant = {
  role: 'admin',
  id: 'f'.repeat(24),
  name: 'Ops',
  expiresAt: Date.now() + 60_000,
};
const ORIGIN = 'http://localhost:4200';

let server: Server;
let sockets: WebSocketServer;
let hub: ChatHub;
let presence: MemoryPresenceStore;
let bus: LocalPresenceBus;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockResolvedValue(shopper);
  hub = new ChatHub();
  presence = new MemoryPresenceStore();
  bus = new LocalPresenceBus();
  server = createServer();
  sockets = attachChatSockets(
    server,
    hub,
    allowedOrigins(ORIGIN),
    presence,
    bus,
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const ws of sockets.clients) ws.terminate();
  sockets.close();
  await new Promise((resolve) => server.close(resolve));
});

/** Opens a socket and collects what the server sends. */
function connect(path = '/api/chat/ws?as=user', origin = ORIGIN) {
  const ws = new WebSocket(`${baseUrl}${path}`, { headers: { origin } });
  // A reset during teardown would otherwise surface as an uncaught error.
  ws.on('error', () => undefined);
  const received: Array<Record<string, unknown>> = [];
  const waiters: Array<() => void> = [];
  ws.on('message', (data) => {
    received.push(JSON.parse(data.toString()));
    waiters.splice(0).forEach((wake) => wake());
  });
  const next = async (count: number) => {
    while (received.length < count) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    return received[count - 1];
  };
  return { ws, received, next };
}

/** The HTTP status the server refused the upgrade with. */
function refusedWith(path: string, origin = ORIGIN): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl}${path}`, { headers: { origin } });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('open', () => reject(new Error('connected')));
    ws.on('error', () => undefined);
  });
}

describe('attachChatSockets', () => {
  it('refuses other sites, unknown accounts, bad sessions and other paths', async () => {
    expect(
      await refusedWith('/api/chat/ws?as=user', 'https://evil.example'),
    ).toBe(403);
    expect(await refusedWith('/api/chat/ws?as=rider')).toBe(400);
    expect(await refusedWith('/elsewhere')).toBe(404);

    vi.mocked(authenticate).mockResolvedValue(null);
    expect(await refusedWith('/api/chat/ws?as=user')).toBe(401);
  });

  it('greets the participant and joins them to the hub', async () => {
    const { next } = connect();

    expect(await next(1)).toEqual({
      type: 'ready',
      you: { role: 'user', id: shopper.id, name: 'Amina' },
    });
    expect(hub.size).toBe(1);
    expect(authenticate).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ origin: ORIGIN }),
      undefined,
    );
  });

  it('signs in with a socket ticket when the UI is on another site', async () => {
    const { next } = connect('/api/chat/ws?as=user&ticket=t1');

    await next(1);
    expect(authenticate).toHaveBeenCalledWith(
      'user',
      expect.objectContaining({ origin: ORIGIN }),
      't1',
    );
  });

  it('sends messages and reports the result to the sender', async () => {
    const message = { id: 'm1', body: 'Hello' };
    vi.mocked(sendMessage)
      .mockResolvedValueOnce(message as never)
      .mockRejectedValueOnce(new HttpError(404, 'Conversation not found.'));
    const { ws, next } = connect();
    await next(1);

    ws.send(
      JSON.stringify({
        type: 'send',
        conversationId: 'c'.repeat(24),
        body: 'Hello',
        clientId: 'tmp-1',
      }),
    );
    expect(await next(2)).toEqual({ type: 'sent', clientId: 'tmp-1', message });
    expect(sendMessage).toHaveBeenCalledWith(shopper, 'c'.repeat(24), {
      body: 'Hello',
      attachments: undefined,
    });

    ws.send(
      JSON.stringify({
        type: 'send',
        conversationId: 'x',
        body: 'Hi',
        clientId: 'tmp-2',
      }),
    );
    expect(await next(3)).toEqual({
      type: 'error',
      clientId: 'tmp-2',
      message: 'Conversation not found.',
    });

    ws.send('not json');
    expect(await next(4)).toMatchObject({ type: 'error' });
  });

  it('passes photo URLs along and reports the sending limit', async () => {
    const photo = 'https://ik.imagekit.io/mlima/chat/user-a/a.jpg';
    vi.mocked(sendMessage).mockRejectedValueOnce(
      new HttpError(429, 'You’re sending messages too fast.'),
    );
    const { ws, next } = connect();
    await next(1);

    ws.send(
      JSON.stringify({
        type: 'send',
        conversationId: 'c'.repeat(24),
        attachments: [photo],
        clientId: 'tmp-3',
      }),
    );

    expect(await next(2)).toEqual({
      type: 'error',
      clientId: 'tmp-3',
      message: 'You’re sending messages too fast.',
    });
    expect(sendMessage).toHaveBeenCalledWith(shopper, 'c'.repeat(24), {
      body: undefined,
      attachments: [photo],
    });
  });

  it('marks chats read and tells every tab the person has open', async () => {
    const read = {
      conversationId: 'c'.repeat(24),
      lastReadAt: '2026-10-08T10:00:00.000Z',
    };
    vi.mocked(markRead)
      .mockResolvedValueOnce(read)
      .mockRejectedValueOnce(new HttpError(404, 'Conversation not found.'));
    const tab1 = connect();
    const tab2 = connect();
    await tab1.next(1);
    await tab2.next(1);

    tab1.ws.send(
      JSON.stringify({ type: 'read', conversationId: 'c'.repeat(24) }),
    );

    expect(await tab1.next(2)).toEqual({ type: 'read', ...read });
    expect(await tab2.next(2)).toEqual({ type: 'read', ...read });
    expect(markRead).toHaveBeenCalledWith(shopper, 'c'.repeat(24));

    tab1.ws.send(JSON.stringify({ type: 'read', conversationId: 'x' }));
    expect(await tab1.next(3)).toEqual({
      type: 'error',
      message: 'Conversation not found.',
    });
  });

  it('shows people as available, away only when every tab is idle, then offline', async () => {
    const key = `user:${shopper.id}`;
    const statusNow = async () => (await presence.get([key])).get(key)?.status;
    const tab1 = connect();
    const tab2 = connect();
    await tab1.next(1);
    await tab2.next(1);
    expect(await statusNow()).toBe('available');

    tab1.ws.send(JSON.stringify({ type: 'presence', status: 'away' }));
    await vi.waitFor(() =>
      expect(hub.statusOf('user', shopper.id)).toBe('available'),
    );
    tab2.ws.send(JSON.stringify({ type: 'presence', status: 'away' }));
    await vi.waitFor(async () => expect(await statusNow()).toBe('away'));

    tab1.ws.close();
    tab2.ws.close();
    await vi.waitFor(async () => expect(await statusNow()).toBe('offline'));
    expect((await presence.get([key])).get(key)?.lastSeenAt).not.toBeNull();
  });

  it('announces status changes, not repeats', async () => {
    const announced: PresenceUpdate[] = [];
    bus.subscribe((update) => announced.push(update));
    const statuses = () => announced.map(({ status }) => status);
    const tab1 = connect();
    const tab2 = connect();
    await tab1.next(1);
    await tab2.next(1);
    expect(statuses()).toEqual(['available']);
    expect(announced[0]).toMatchObject({ key: `user:${shopper.id}` });

    tab1.ws.send(JSON.stringify({ type: 'presence', status: 'away' }));
    tab2.ws.send(JSON.stringify({ type: 'presence', status: 'away' }));
    await vi.waitFor(() => expect(statuses()).toEqual(['available', 'away']));

    tab1.ws.close();
    tab2.ws.close();
    await vi.waitFor(() =>
      expect(statuses()).toEqual(['available', 'away', 'offline']),
    );
  });

  it('tells watchers the status of the people they chat with, then every change', async () => {
    const seller = `seller:${'b'.repeat(24)}`;
    const stranger = `seller:${'e'.repeat(24)}`;
    vi.mocked(counterpartKeys).mockResolvedValue([seller]);
    await presence.touch([{ key: seller, status: 'away' }]);
    const { ws, next } = connect();
    await next(1);

    ws.send(JSON.stringify({ type: 'watch' }));

    expect(await next(2)).toEqual({
      type: 'presence',
      updates: [
        { key: seller, status: 'away', lastSeenAt: expect.any(String) },
      ],
    });
    expect(counterpartKeys).toHaveBeenCalledWith(shopper);

    const lastSeenAt = '2026-10-12T16:00:00.000Z';
    await bus.publish({ key: stranger, status: 'available', lastSeenAt });
    await bus.publish({ key: seller, status: 'offline', lastSeenAt });

    expect(await next(3)).toEqual({
      type: 'presence',
      updates: [{ key: seller, status: 'offline', lastSeenAt }],
    });
  });

  it('rejects unknown presence statuses', async () => {
    const { ws, next } = connect();
    await next(1);

    ws.send(JSON.stringify({ type: 'presence', status: 'busy' }));

    expect(await next(2)).toMatchObject({ type: 'error' });
  });

  it('passes typing on, at most every couple of seconds per chat', async () => {
    vi.mocked(announceTyping).mockResolvedValue(undefined);
    const { ws, next } = connect();
    await next(1);
    const chatA = 'c'.repeat(24);
    const chatB = 'd'.repeat(24);

    ws.send(JSON.stringify({ type: 'typing', conversationId: chatA }));
    ws.send(JSON.stringify({ type: 'typing', conversationId: chatA }));
    ws.send(JSON.stringify({ type: 'typing', conversationId: chatB }));

    await vi.waitFor(() => expect(announceTyping).toHaveBeenCalledTimes(2));
    expect(announceTyping).toHaveBeenCalledWith(shopper, chatA);
    expect(announceTyping).toHaveBeenCalledWith(shopper, chatB);
  });

  it('only lets admins set their status by hand', async () => {
    const { ws, next } = connect();
    await next(1);

    ws.send(JSON.stringify({ type: 'status', status: 'busy' }));

    expect(await next(2)).toEqual({
      type: 'error',
      message: 'Only admins can set their status by hand.',
    });
    expect(await presence.getManual(`user:${shopper.id}`)).toBeNull();
  });

  it('lets admins set busy, appear offline and go back to automatic', async () => {
    vi.mocked(authenticate).mockResolvedValue(admin);
    const key = `admin:${admin.id}`;
    const announced: PresenceUpdate[] = [];
    bus.subscribe((update) => announced.push(update));
    const tab1 = connect('/api/chat/ws?as=admin');
    expect(await tab1.next(1)).toMatchObject({ type: 'ready' });
    expect(await tab1.next(2)).toEqual({ type: 'status', manual: null });

    tab1.ws.send(JSON.stringify({ type: 'status', status: 'busy' }));
    expect(await tab1.next(3)).toEqual({ type: 'status', manual: 'busy' });
    expect(await presence.getManual(key)).toBe('busy');
    expect(announced.at(-1)).toMatchObject({
      key,
      status: 'busy',
      manual: 'busy',
    });

    // Another tab starts with the status already set.
    const tab2 = connect('/api/chat/ws?as=admin');
    await tab2.next(1);
    expect(await tab2.next(2)).toEqual({ type: 'status', manual: 'busy' });

    tab2.ws.send(JSON.stringify({ type: 'status', status: 'offline' }));
    expect(await tab1.next(4)).toEqual({ type: 'status', manual: 'offline' });
    expect(announced.at(-1)).toMatchObject({
      status: 'offline',
      lastSeenAt: null,
    });
    expect((await presence.get([key])).get(key)?.status).toBe('offline');

    tab1.ws.send(JSON.stringify({ type: 'status', status: null }));
    expect(await tab2.next(4)).toEqual({ type: 'status', manual: null });
    expect(announced.at(-1)).toMatchObject({ status: 'available' });
    expect(await presence.getManual(key)).toBeNull();
  });

  it('keeps an admin’s status across reconnects, without telling watchers how it was set', async () => {
    vi.mocked(authenticate).mockResolvedValue(admin);
    const key = `admin:${admin.id}`;
    await presence.setManual(key, 'dnd');
    vi.mocked(counterpartKeys).mockResolvedValue([key]);

    const { next } = connect('/api/chat/ws?as=admin');
    await next(1);
    expect(await next(2)).toEqual({ type: 'status', manual: 'dnd' });
    await vi.waitFor(async () =>
      expect((await presence.get([key])).get(key)?.status).toBe('dnd'),
    );

    vi.mocked(authenticate).mockResolvedValue(shopper);
    const watcher = connect();
    await watcher.next(1);
    watcher.ws.send(JSON.stringify({ type: 'watch' }));
    expect(await watcher.next(2)).toMatchObject({
      updates: [{ key, status: 'dnd' }],
    });

    await bus.publish({
      key,
      status: 'brb',
      lastSeenAt: '2026-10-12T16:00:00.000Z',
      manual: 'brb',
    });
    expect(await watcher.next(3)).toEqual({
      type: 'presence',
      updates: [{ key, status: 'brb', lastSeenAt: '2026-10-12T16:00:00.000Z' }],
    });
  });

  it('closes the socket when the session runs out', async () => {
    vi.mocked(authenticate).mockResolvedValue({
      ...shopper,
      expiresAt: Date.now() + 50,
    });
    const { ws } = connect();

    const code = await new Promise<number>((resolve) =>
      ws.on('close', (closeCode) => resolve(closeCode)),
    );

    expect(code).toBe(SESSION_EXPIRED_CODE);
    // The server's own close handler can run just after the client sees the close.
    await vi.waitFor(() => expect(hub.size).toBe(0));
  });
});
