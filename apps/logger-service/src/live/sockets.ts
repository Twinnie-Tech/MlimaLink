import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer } from 'ws';
import { findSignedInAdmin, type SignedInAdmin } from '../admin-auth';
import type { LiveLogHub } from './hub';

export const LOGS_SOCKET_PATH = '/api/logs/ws';
/** Sent when the access token runs out; the client refreshes its session and reconnects. */
export const SESSION_EXPIRED_CODE = 4001;

const DEFAULT_ALLOWED_ORIGINS = 'http://localhost:4400';
const HEARTBEAT_MS = 30_000;

/**
 * Browsers attach cookies to WebSocket upgrades from any site, so only admin-ui may
 * connect. Clients without an Origin (scripts) still need an admin token.
 */
export function allowedOrigins(
  value = process.env.LOGS_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS,
): Set<string> {
  return new Set(
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  );
}

function reject(socket: Duplex, status: number, reason: string) {
  socket.end(
    `HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
  );
}

/**
 * Serves live logs to signed-in admins at ws://host/api/logs/ws. The server sends
 * `{ type: 'ready' }`, then `{ type: 'log', log: { id, level, message, source,
 * timestamp, meta? } }` for every line any service logs, as it happens. Clients don't
 * send anything.
 */
export function attachLiveLogs(
  server: Server,
  hub: LiveLogHub,
  origins = allowedOrigins(),
): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== LOGS_SOCKET_PATH) {
        reject(socket, 404, 'Not Found');
        return;
      }
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) {
        reject(socket, 403, 'Forbidden');
        return;
      }
      const admin = await findSignedInAdmin(req.headers);
      if (!admin) {
        reject(socket, 401, 'Unauthorized');
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit('connection', ws, admin),
      );
    })().catch((error) => {
      console.error(error);
      reject(socket, 500, 'Internal Server Error');
    });
  });

  wss.on('connection', (ws: WebSocket, admin: SignedInAdmin) => {
    hub.add(ws);
    ws.send(JSON.stringify({ type: 'ready' }));
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));
    const expiry = setTimeout(
      () => ws.close(SESSION_EXPIRED_CODE, 'Session expired'),
      Math.max(admin.expiresAt - Date.now(), 0),
    );
    ws.on('close', () => {
      clearTimeout(expiry);
      hub.remove(ws);
    });
  });

  // Drops connections that stopped answering, e.g. a laptop that went to sleep.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
  }, HEARTBEAT_MS);
  wss.on('close', () => clearInterval(heartbeat));

  return wss;
}
