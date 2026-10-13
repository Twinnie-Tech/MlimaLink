import type { LogEntry } from '@org/utils/logs';

/** A log line as it streams to admins; the id is unique per Kafka message. */
export interface LiveLog extends LogEntry {
  id: string;
}

/** The part of a ws WebSocket the hub uses. */
export interface LiveSocket {
  readyState: number;
  bufferedAmount: number;
  send(data: string): void;
}

const OPEN = 1;
/** A tab that can't keep up skips lines instead of filling the server's memory. */
const MAX_BUFFERED_BYTES = 1024 * 1024;

/** Admin sockets connected to this instance that want every log line as it happens. */
export class LiveLogHub {
  private readonly sockets = new Set<LiveSocket>();

  add(socket: LiveSocket): void {
    this.sockets.add(socket);
  }

  remove(socket: LiveSocket): void {
    this.sockets.delete(socket);
  }

  get size(): number {
    return this.sockets.size;
  }

  /** Sends the line to every open socket; returns how many got it. */
  broadcast(log: LiveLog): number {
    if (this.sockets.size === 0) return 0;
    const data = JSON.stringify({ type: 'log', log });
    let sent = 0;
    for (const socket of this.sockets) {
      if (socket.readyState !== OPEN) continue;
      if (socket.bufferedAmount > MAX_BUFFERED_BYTES) continue;
      socket.send(data);
      sent += 1;
    }
    return sent;
  }
}
