import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { isAccountType } from '@org/utils/auth';
import { sendMessage } from './chat/conversations';
import type { ChatHub } from './chat/hub';
import { authenticate, type Participant } from './chat/participants';
import { MAX_MESSAGE_LENGTH } from './chat/protocol';
import { HttpError } from './http-error';

export const CHAT_SOCKET_PATH = '/api/chat/ws';

const DEFAULT_ALLOWED_ORIGINS =
  'http://localhost:4200,http://localhost:4300,http://localhost:4400';
const HEARTBEAT_MS = 30_000;
/** Sent when the access token runs out; the client refreshes its session and reconnects. */
export const SESSION_EXPIRED_CODE = 4001;

/**
 * Browsers attach cookies to WebSocket upgrades from any site, so only the MlimaLink UIs
 * may connect. Clients without an Origin (scripts, other services) still need a token.
 */
export function allowedOrigins(
  value = process.env.CHAT_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS,
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

function errorText(error: unknown): string {
  return error instanceof HttpError ? error.message : 'Something went wrong.';
}

function parseClientMessage(
  data: RawData,
): { conversationId: unknown; body: unknown; clientId?: string } | null {
  try {
    const parsed = JSON.parse(data.toString());
    if (parsed?.type !== 'send') return null;
    const clientId =
      typeof parsed.clientId === 'string' && parsed.clientId.length <= 100
        ? parsed.clientId
        : undefined;
    return {
      conversationId: parsed.conversationId,
      body: parsed.body,
      clientId,
    };
  } catch {
    return null;
  }
}

/**
 * Serves live chat at ws://host/api/chat/ws?as=user|seller|admin.
 *
 * The client sends `{ type: 'send', conversationId, body, clientId? }` and gets back
 * `{ type: 'sent', clientId, message }` or `{ type: 'error', clientId, message }`. Every
 * participant, including the sender's other tabs, then receives
 * `{ type: 'message', message }` once Kafka delivers it.
 */
export function attachChatSockets(
  server: Server,
  hub: ChatHub,
  origins = allowedOrigins(),
): WebSocketServer {
  // Room for a full message plus the JSON around it, even when every character is escaped.
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_MESSAGE_LENGTH * 6 + 1024,
  });
  const alive = new WeakMap<WebSocket, boolean>();

  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname !== CHAT_SOCKET_PATH) {
        reject(socket, 404, 'Not Found');
        return;
      }
      const origin = req.headers.origin;
      if (origin && !origins.has(origin)) {
        reject(socket, 403, 'Forbidden');
        return;
      }
      const account = url.searchParams.get('as');
      if (!isAccountType(account)) {
        reject(socket, 400, 'Bad Request');
        return;
      }
      const participant = await authenticate(account, req.headers);
      if (!participant) {
        reject(socket, 401, 'Unauthorized');
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) =>
        wss.emit('connection', ws, participant),
      );
    })().catch((error) => {
      console.error(error);
      reject(socket, 500, 'Internal Server Error');
    });
  });

  wss.on('connection', (ws: WebSocket, participant: Participant) => {
    const { role, id, name } = participant;
    hub.add(role, id, ws);
    alive.set(ws, true);
    ws.on('pong', () => alive.set(ws, true));

    const expiry = setTimeout(
      () => ws.close(SESSION_EXPIRED_CODE, 'Session expired'),
      Math.max(participant.expiresAt - Date.now(), 0),
    );

    ws.on('message', (data) => {
      const request = parseClientMessage(data);
      if (!request) {
        ws.send(
          JSON.stringify({
            type: 'error',
            message: 'Send { type: "send", conversationId, body }.',
          }),
        );
        return;
      }
      const { clientId } = request;
      sendMessage(participant, String(request.conversationId), request.body)
        .then((message) =>
          ws.send(JSON.stringify({ type: 'sent', clientId, message })),
        )
        .catch((error) => {
          if (!(error instanceof HttpError)) console.error(error);
          ws.send(
            JSON.stringify({
              type: 'error',
              clientId,
              message: errorText(error),
            }),
          );
        });
    });

    ws.on('close', () => {
      clearTimeout(expiry);
      hub.remove(role, id, ws);
    });

    ws.send(JSON.stringify({ type: 'ready', you: { role, id, name } }));
  });

  // Drops connections that stopped answering, e.g. a phone that lost signal.
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
