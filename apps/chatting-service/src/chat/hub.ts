import type { AccountType } from '@org/utils/auth';
import type { ActiveStatus } from './presence';
import { participantKey, type ChatEnvelope } from './protocol';

/** The part of a ws WebSocket the hub uses. */
export interface ChatSocket {
  readyState: number;
  send(data: string): void;
}

const OPEN = 1;

/**
 * The sockets connected to this instance. Every instance reads every chat message
 * from Kafka and passes it to its own sockets, so participants can be connected to
 * any instance.
 */
export class ChatHub {
  /** Each person's sockets, with the status each tab last reported. */
  private readonly sockets = new Map<string, Map<ChatSocket, ActiveStatus>>();
  /** Sockets that want status changes, by the person they're watching. */
  private readonly watchers = new Map<string, Set<ChatSocket>>();
  private readonly watching = new Map<ChatSocket, string[]>();

  add(role: AccountType, id: string, socket: ChatSocket): void {
    const key = participantKey(role, id);
    const tabs = this.sockets.get(key) ?? new Map();
    tabs.set(socket, 'available');
    this.sockets.set(key, tabs);
  }

  remove(role: AccountType, id: string, socket: ChatSocket): void {
    const key = participantKey(role, id);
    const tabs = this.sockets.get(key);
    tabs?.delete(socket);
    if (tabs?.size === 0) this.sockets.delete(key);
    this.unwatch(socket);
  }

  /** From now on this socket hears status changes for exactly these people. */
  watch(socket: ChatSocket, keys: string[]): void {
    this.unwatch(socket);
    for (const key of keys) {
      const sockets = this.watchers.get(key) ?? new Set();
      sockets.add(socket);
      this.watchers.set(key, sockets);
    }
    this.watching.set(socket, keys);
  }

  unwatch(socket: ChatSocket): void {
    for (const key of this.watching.get(socket) ?? []) {
      const sockets = this.watchers.get(key);
      sockets?.delete(socket);
      if (sockets?.size === 0) this.watchers.delete(key);
    }
    this.watching.delete(socket);
  }

  /** Sends `data` to every socket here watching this person. */
  sendToWatchers(key: string, data: unknown): number {
    const text = JSON.stringify(data);
    let sent = 0;
    for (const socket of this.watchers.get(key) ?? []) {
      if (socket.readyState !== OPEN) continue;
      socket.send(text);
      sent += 1;
    }
    return sent;
  }

  /** Records what one tab reports, e.g. "away" after the person goes idle. */
  setStatus(
    role: AccountType,
    id: string,
    socket: ChatSocket,
    status: ActiveStatus,
  ): void {
    const tabs = this.sockets.get(participantKey(role, id));
    if (tabs?.has(socket)) tabs.set(socket, status);
  }

  /** Available if any of the person's tabs here is, away if all are idle, null if none are open. */
  statusOf(role: AccountType, id: string): ActiveStatus | null {
    const tabs = this.sockets.get(participantKey(role, id));
    if (!tabs?.size) return null;
    return [...tabs.values()].includes('available') ? 'available' : 'away';
  }

  /** Everyone connected here with their status, for renewing presence. */
  connected(): Array<{ key: string; status: ActiveStatus }> {
    return [...this.sockets].map(([key, tabs]) => ({
      key,
      status: [...tabs.values()].includes('available') ? 'available' : 'away',
    }));
  }

  /** Open sockets, across every participant. */
  get size(): number {
    let count = 0;
    for (const tabs of this.sockets.values()) count += tabs.size;
    return count;
  }

  /** Sends `data` to every open socket this person has here, e.g. all their tabs. */
  sendTo(role: AccountType, id: string, data: unknown): number {
    const text = JSON.stringify(data);
    let sent = 0;
    for (const socket of this.sockets.get(participantKey(role, id))?.keys() ??
      []) {
      if (socket.readyState !== OPEN) continue;
      socket.send(text);
      sent += 1;
    }
    return sent;
  }

  /**
   * Sends the event to everyone in the chat connected here, except that typing doesn't go
   * back to the typist; returns how many sockets got it.
   */
  deliver(envelope: ChatEnvelope): number {
    const { audience } = envelope;
    const skip = envelope.type === 'typing' ? envelope.from.key : null;
    const targets = new Set<ChatSocket>();
    const addAll = (key: string) => {
      if (key === skip) return;
      for (const socket of this.sockets.get(key)?.keys() ?? []) {
        targets.add(socket);
      }
    };

    if (audience.userId) addAll(participantKey('user', audience.userId));
    if (audience.sellerId) addAll(participantKey('seller', audience.sellerId));
    audience.participants?.forEach(addAll);
    if (audience.support) {
      for (const key of this.sockets.keys()) {
        if (key.startsWith('admin:')) addAll(key);
      }
    }

    // The event as clients see it: who it's for stays on the server.
    const data = JSON.stringify({ ...envelope, audience: undefined });
    let sent = 0;
    for (const socket of targets) {
      if (socket.readyState !== OPEN) continue;
      socket.send(data);
      sent += 1;
    }
    return sent;
  }
}
