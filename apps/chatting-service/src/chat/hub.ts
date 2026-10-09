import type { AccountType } from '@org/utils/auth';
import type { ChatEnvelope } from './protocol';

/** The part of a ws WebSocket the hub uses. */
export interface ChatSocket {
  readyState: number;
  send(data: string): void;
}

const OPEN = 1;

const keyFor = (role: AccountType, id: string) => `${role}:${id}`;

/**
 * The sockets connected to this instance. Every instance reads every chat message
 * from Kafka and passes it to its own sockets, so participants can be connected to
 * any instance.
 */
export class ChatHub {
  private readonly sockets = new Map<string, Set<ChatSocket>>();

  add(role: AccountType, id: string, socket: ChatSocket): void {
    const key = keyFor(role, id);
    const set = this.sockets.get(key) ?? new Set();
    set.add(socket);
    this.sockets.set(key, set);
  }

  remove(role: AccountType, id: string, socket: ChatSocket): void {
    const key = keyFor(role, id);
    const set = this.sockets.get(key);
    set?.delete(socket);
    if (set?.size === 0) this.sockets.delete(key);
  }

  /** Open sockets, across every participant. */
  get size(): number {
    let count = 0;
    for (const set of this.sockets.values()) count += set.size;
    return count;
  }

  /** Sends the message to everyone in the chat connected here; returns how many sockets got it. */
  deliver({ message, audience }: ChatEnvelope): number {
    const targets = new Set<ChatSocket>();
    const addAll = (key: string) =>
      this.sockets.get(key)?.forEach((socket) => targets.add(socket));

    if (audience.userId) addAll(keyFor('user', audience.userId));
    if (audience.sellerId) addAll(keyFor('seller', audience.sellerId));
    if (audience.support) {
      for (const key of this.sockets.keys()) {
        if (key.startsWith('admin:')) addAll(key);
      }
    }

    const data = JSON.stringify({ type: 'message', message });
    let sent = 0;
    for (const socket of targets) {
      if (socket.readyState !== OPEN) continue;
      socket.send(data);
      sent += 1;
    }
    return sent;
  }
}
