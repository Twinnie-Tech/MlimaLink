import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, type WebSocketServer } from 'ws';
import { findSignedInAdmin } from '../admin-auth';
import { LiveLogHub } from './hub';
import {
  SESSION_EXPIRED_CODE,
  allowedOrigins,
  attachLiveLogs,
} from './sockets';

vi.mock('../admin-auth', () => ({ findSignedInAdmin: vi.fn() }));

const ORIGIN = 'http://localhost:4400';
const admin = { id: 'e'.repeat(24), expiresAt: Date.now() + 60_000 };

let server: Server;
let sockets: WebSocketServer;
let hub: LiveLogHub;
let baseUrl: string;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(findSignedInAdmin).mockResolvedValue(admin);
  hub = new LiveLogHub();
  server = createServer();
  sockets = attachLiveLogs(server, hub, allowedOrigins(ORIGIN));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `ws://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const ws of sockets.clients) ws.terminate();
  sockets.close();
  await new Promise((resolve) => server.close(resolve));
});

function connect(origin = ORIGIN) {
  const ws = new WebSocket(`${baseUrl}/api/logs/ws`, {
    headers: { origin, cookie: 'adminAccessToken=token' },
  });
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
  return { ws, next };
}

function refusedWith(path: string, origin = ORIGIN): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${baseUrl}${path}`, { headers: { origin } });
    ws.on('unexpected-response', (_req, res) => resolve(res.statusCode ?? 0));
    ws.on('open', () => reject(new Error('connected')));
    ws.on('error', () => undefined);
  });
}

describe('attachLiveLogs', () => {
  it('only lets signed-in admins in from admin-ui', async () => {
    expect(await refusedWith('/api/logs/ws', 'https://evil.example')).toBe(403);
    expect(await refusedWith('/elsewhere')).toBe(404);

    vi.mocked(findSignedInAdmin).mockResolvedValue(null);
    expect(await refusedWith('/api/logs/ws')).toBe(401);
  });

  it('signs in with a socket ticket when admin-ui is on another site', async () => {
    const ws = new WebSocket(`${baseUrl}/api/logs/ws?ticket=t1`, {
      headers: { origin: ORIGIN },
    });
    ws.on('error', () => undefined);
    await new Promise((resolve) => ws.once('message', resolve));

    expect(findSignedInAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ origin: ORIGIN }),
      't1',
    );
  });

  it('greets the admin, then streams every line as it happens', async () => {
    const { next } = connect();

    expect(await next(1)).toEqual({ type: 'ready' });
    expect(findSignedInAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ cookie: 'adminAccessToken=token' }),
      undefined,
    );
    expect(hub.size).toBe(1);

    const log = {
      id: 'logs-0-1',
      level: 'error' as const,
      message: 'Payment failed',
      source: 'api',
      timestamp: '2026-10-13T10:00:00.000Z',
    };
    hub.broadcast(log);
    expect(await next(2)).toEqual({ type: 'log', log });
  });

  it('leaves the hub on close and closes when the session runs out', async () => {
    vi.mocked(findSignedInAdmin).mockResolvedValue({
      ...admin,
      expiresAt: Date.now() + 50,
    });
    const { ws, next } = connect();
    await next(1);

    const code = await new Promise<number>((resolve) =>
      ws.on('close', (closeCode) => resolve(closeCode)),
    );
    expect(code).toBe(SESSION_EXPIRED_CODE);
    await vi.waitFor(() => expect(hub.size).toBe(0));
  });
});
