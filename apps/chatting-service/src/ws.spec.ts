import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, type WebSocketServer } from 'ws';
import { sendMessage } from './chat/conversations';
import { ChatHub } from './chat/hub';
import { authenticate, type Participant } from './chat/participants';
import { HttpError } from './http-error';
import { SESSION_EXPIRED_CODE, allowedOrigins, attachChatSockets } from './ws';

vi.mock('./chat/participants', () => ({ authenticate: vi.fn() }));
vi.mock('./chat/conversations', () => ({ sendMessage: vi.fn() }));

const shopper: Participant = {
  role: 'user',
  id: 'a'.repeat(24),
  name: 'Amina',
  expiresAt: Date.now() + 60_000,
};
const ORIGIN = 'http://localhost:4200';

let server: Server;
let sockets: WebSocketServer;
let hub: ChatHub;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(authenticate).mockResolvedValue(shopper);
  hub = new ChatHub();
  server = createServer();
  sockets = attachChatSockets(server, hub, allowedOrigins(ORIGIN));
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
