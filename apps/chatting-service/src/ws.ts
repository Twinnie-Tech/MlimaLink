import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import { isAccountType, type AccountType } from '@org/utils/auth';
import {
  announceTyping,
  counterpartKeys,
  markRead,
  sendMessage,
} from './chat/conversations';
import type { ChatHub } from './chat/hub';
import { authenticate, type Participant } from './chat/participants';
import {
  effectiveStatus,
  isActiveStatus,
  isManualStatus,
  presenceStore,
  type ActiveStatus,
  type ManualStatus,
  type PresenceStatus,
  type PresenceStore,
} from './chat/presence';
import { presenceBus, type PresenceBus } from './chat/presence-bus';
import {
  MAX_ATTACHMENTS,
  MAX_MESSAGE_LENGTH,
  parseParticipantKey,
  participantKey,
} from './chat/protocol';
import { HttpError } from './http-error';

export const CHAT_SOCKET_PATH = '/api/chat/ws';

const DEFAULT_ALLOWED_ORIGINS =
  'http://localhost:4200,http://localhost:4300,http://localhost:4400';
const HEARTBEAT_MS = 30_000;
/** Typing is passed on at most this often per tab and chat; clients send every 3 s. */
const TYPING_EVERY_MS = 2_000;
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

type ClientMessage =
  | {
      type: 'send';
      conversationId: unknown;
      body: unknown;
      attachments: unknown;
      files: unknown;
      gif: unknown;
      replyToId: unknown;
      clientId?: string;
    }
  | { type: 'read'; conversationId: unknown }
  | { type: 'presence'; status: ActiveStatus }
  | { type: 'watch' }
  | { type: 'typing'; conversationId: string }
  | { type: 'status'; status: ManualStatus | null };

function parseClientMessage(data: RawData): ClientMessage | null {
  try {
    const parsed = JSON.parse(data.toString());
    if (parsed?.type === 'read') {
      return { type: 'read', conversationId: parsed.conversationId };
    }
    if (parsed?.type === 'watch') return { type: 'watch' };
    if (parsed?.type === 'presence') {
      return isActiveStatus(parsed.status)
        ? { type: 'presence', status: parsed.status }
        : null;
    }
    if (parsed?.type === 'typing') {
      return typeof parsed.conversationId === 'string'
        ? { type: 'typing', conversationId: parsed.conversationId }
        : null;
    }
    if (parsed?.type === 'status') {
      return parsed.status === null || isManualStatus(parsed.status)
        ? { type: 'status', status: parsed.status }
        : null;
    }
    if (parsed?.type !== 'send') return null;
    const clientId =
      typeof parsed.clientId === 'string' && parsed.clientId.length <= 100
        ? parsed.clientId
        : undefined;
    return {
      type: 'send',
      conversationId: parsed.conversationId,
      body: parsed.body,
      attachments: parsed.attachments,
      files: parsed.files,
      gif: parsed.gif,
      replyToId: parsed.replyToId,
      clientId,
    };
  } catch {
    return null;
  }
}

/**
 * Serves live chat at ws://host/api/chat/ws?as=user|seller|admin.
 *
 * The client sends `{ type: 'send', conversationId, body?, attachments?, files?, gif?,
 * replyToId?, clientId? }`, where attachments (photo URLs) and files come from
 * POST /api/chat/attachments, and gets back `{ type: 'sent', clientId, message }` or
 * `{ type: 'error', clientId, message }`. Every participant, including the sender's other
 * tabs, then receives `{ type: 'message', message }` once Kafka delivers it. Edits,
 * deletions and reactions (over REST) arrive as `{ type: 'updated', message }`.
 *
 * `{ type: 'read', conversationId }` marks the chat as seen; every tab the person has
 * open on this instance then gets `{ type: 'read', conversationId, lastReadAt }` so it
 * can clear its unseen badge, and everyone in the chat gets
 * `{ type: 'seen', conversationId, reader, lastReadAt }` for seen receipts.
 *
 * `{ type: 'typing', conversationId }`, sent every few seconds while typing, reaches the
 * others in the chat as `{ type: 'typing', conversationId, from: { key, name } }`.
 *
 * Being connected makes the person "available". A tab sends
 * `{ type: 'presence', status: 'away' | 'available' }` when they go idle or come back;
 * they're away only when every tab is. Closing the last tab makes them offline. Admins
 * can also send `{ type: 'status', status: 'busy' | 'dnd' | 'brb' | 'away' | 'offline' |
 * null }` to set their status by hand (offline appears offline; null is automatic); their
 * tabs get `{ type: 'status', manual }` on connecting and whenever it changes.
 *
 * `{ type: 'watch' }` asks for the status of everyone the person chats with: the reply is
 * `{ type: 'presence', updates: [{ key, status, lastSeenAt }] }`, and the same event
 * follows whenever one of them changes, from any instance. Send it again when a new
 * chat appears.
 */
export function attachChatSockets(
  server: Server,
  hub: ChatHub,
  origins = allowedOrigins(),
  presence: PresenceStore = presenceStore(),
  bus: PresenceBus = presenceBus(),
): WebSocketServer {
  // Room for a full message, its photo and document URLs and names, and a GIF, plus the
  // JSON around them, even when every character is escaped.
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: (MAX_MESSAGE_LENGTH + MAX_ATTACHMENTS * 2600 + 2600) * 6 + 1024,
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

  const ignore = (error: unknown) => console.error('[presence]', error);
  /** The status last announced for each person connected here. */
  const announced = new Map<string, PresenceStatus>();
  /** Statuses admins connected here set by hand. */
  const manualStatuses = new Map<string, ManualStatus>();
  /**
   * Records the person's combined status across their tabs here and announces changes.
   * `manual` is passed when an admin just set their status, so their tabs everywhere
   * hear about it even if what others see stays the same.
   */
  const updatePresence = (
    role: AccountType,
    id: string,
    manual?: ManualStatus | null,
  ) => {
    const key = participantKey(role, id);
    const status = hub.statusOf(role, id);
    (status ? presence.touch([{ key, status }]) : presence.leave(key)).catch(
      ignore,
    );
    const set = manualStatuses.get(key);
    const current = status ? effectiveStatus(status, set) : 'offline';
    if (announced.get(key) === current && manual === undefined) return;
    if (status) {
      announced.set(key, current);
    } else {
      announced.delete(key);
      manualStatuses.delete(key);
    }
    bus
      .publish({
        key,
        status: current,
        // Appearing offline hides when they were last around, too.
        lastSeenAt: set === 'offline' ? null : new Date().toISOString(),
        ...(manual !== undefined && { manual }),
      })
      .catch(ignore);
  };
  const stopListening = bus.subscribe(({ manual, ...update }) => {
    hub.sendToWatchers(update.key, { type: 'presence', updates: [update] });
    if (manual === undefined) return;
    const person = parseParticipantKey(update.key);
    if (!person || !hub.statusOf(person.role, person.id)) return;
    if (manual) manualStatuses.set(update.key, manual);
    else manualStatuses.delete(update.key);
    hub.sendTo(person.role, person.id, { type: 'status', manual });
  });

  /** Starts sending this socket the status of everyone the person chats with. */
  const watch = async (ws: WebSocket, participant: Participant) => {
    const keys = await counterpartKeys(participant);
    if (ws.readyState !== WebSocket.OPEN) return;
    hub.watch(ws, keys);
    const current = await presence.get(keys);
    ws.send(
      JSON.stringify({
        type: 'presence',
        updates: keys.map((key) => ({
          key,
          ...(current.get(key) ?? { status: 'offline', lastSeenAt: null }),
        })),
      }),
    );
  };

  /** Passes typing on, at most every TYPING_EVERY_MS per chat for this tab. */
  const typingSentAt = new WeakMap<WebSocket, Map<string, number>>();
  const typing = (
    ws: WebSocket,
    participant: Participant,
    conversationId: string,
  ) => {
    const sent = typingSentAt.get(ws) ?? new Map<string, number>();
    typingSentAt.set(ws, sent);
    const now = Date.now();
    if (now - (sent.get(conversationId) ?? 0) < TYPING_EVERY_MS) return;
    sent.set(conversationId, now);
    announceTyping(participant, conversationId).catch((error) => {
      if (!(error instanceof HttpError)) console.error(error);
    });
  };

  wss.on('connection', (ws: WebSocket, participant: Participant) => {
    const { role, id, name } = participant;
    const key = participantKey(role, id);
    hub.add(role, id, ws);
    ws.send(JSON.stringify({ type: 'ready', you: { role, id, name } }));
    if (role === 'admin' && !manualStatuses.has(key)) {
      // Their status set by hand outlasts the connection; load it before announcing.
      presence
        .getManual(key)
        .catch(() => null)
        .then((manual) => {
          if (manual && hub.statusOf(role, id)) manualStatuses.set(key, manual);
          updatePresence(role, id);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'status', manual: manual ?? null }));
          }
        });
    } else {
      updatePresence(role, id);
      if (role === 'admin') {
        ws.send(
          JSON.stringify({
            type: 'status',
            manual: manualStatuses.get(key) ?? null,
          }),
        );
      }
    }
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
            message:
              'Send { type: "send", conversationId, body, attachments?, files?, gif?, replyToId? }, { type: "read", conversationId }, { type: "typing", conversationId }, { type: "presence", status: "available" | "away" }, { type: "status", status } (admins) or { type: "watch" }.',
          }),
        );
        return;
      }
      if (request.type === 'presence') {
        hub.setStatus(role, id, ws, request.status);
        updatePresence(role, id);
        return;
      }
      if (request.type === 'typing') {
        typing(ws, participant, request.conversationId);
        return;
      }
      if (request.type === 'status') {
        if (role !== 'admin') {
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Only admins can set their status by hand.',
            }),
          );
          return;
        }
        const manual = request.status;
        if (manual) manualStatuses.set(key, manual);
        else manualStatuses.delete(key);
        presence.setManual(key, manual).catch(ignore);
        updatePresence(role, id, manual);
        return;
      }
      if (request.type === 'watch') {
        watch(ws, participant).catch((error) => {
          console.error(error);
          ws.send(JSON.stringify({ type: 'error', message: errorText(error) }));
        });
        return;
      }
      if (request.type === 'read') {
        markRead(participant, String(request.conversationId))
          .then((read) => hub.sendTo(role, id, { type: 'read', ...read }))
          .catch((error) => {
            if (!(error instanceof HttpError)) console.error(error);
            ws.send(
              JSON.stringify({ type: 'error', message: errorText(error) }),
            );
          });
        return;
      }
      const { clientId, body, attachments, files, gif, replyToId } = request;
      sendMessage(participant, String(request.conversationId), {
        body,
        attachments,
        files,
        gif,
        replyToId,
      })
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
      updatePresence(role, id);
    });
  });

  // Drops connections that stopped answering, e.g. a phone that lost signal, and renews
  // everyone else's presence before it expires.
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!alive.get(ws)) {
        ws.terminate();
        continue;
      }
      alive.set(ws, false);
      ws.ping();
    }
    presence.touch(hub.connected()).catch(ignore);
  }, HEARTBEAT_MS);
  wss.on('close', () => {
    clearInterval(heartbeat);
    stopListening();
  });

  return wss;
}
