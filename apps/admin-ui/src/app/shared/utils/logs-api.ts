/**
 * Platform logs from logger-service, reached through the API gateway: recent history at
 * /api/logs and every new line, live, over the /api/logs/ws WebSocket.
 */

import { requestJson, withSession } from './admin-api';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface LogLine {
  id: string;
  level: LogLevel;
  message: string;
  /** The service that wrote it, e.g. "api-gateway" or "chatting-service". */
  source: string;
  /** ISO date string. */
  timestamp: string;
  meta?: Record<string, unknown>;
}

export type LogsSocketEvent = { type: 'ready' } | { type: 'log'; log: LogLine };

/** Sent by logger-service when the access token runs out. */
export const LOGS_SESSION_EXPIRED_CODE = 4001;
export const HISTORY_SIZE = 200;

export const LOGS_KEY = ['admin', 'logs'] as const;

/** The newest stored lines, newest first, and every service that has logged. */
export function getRecentLogs() {
  return withSession(() =>
    requestJson<{ logs: LogLine[]; sources: string[] }>(
      'GET',
      `/api/logs?limit=${HISTORY_SIZE}`,
    ),
  );
}

/** NEXT_PUBLIC_LOGS_WS_URL when set, otherwise this site's own /api/logs/ws. */
export function logsSocketUrl(
  configured = process.env.NEXT_PUBLIC_LOGS_WS_URL,
): string {
  if (configured) return configured;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/api/logs/ws`;
}

export function parseLogsEvent(data: unknown): LogsSocketEvent | null {
  if (typeof data !== 'string') return null;
  try {
    const event = JSON.parse(data);
    if (event?.type === 'ready') return { type: 'ready' };
    const log = event?.type === 'log' ? event.log : null;
    return log &&
      typeof log.id === 'string' &&
      LOG_LEVELS.includes(log.level) &&
      typeof log.message === 'string' &&
      typeof log.source === 'string' &&
      typeof log.timestamp === 'string'
      ? { type: 'log', log }
      : null;
  } catch {
    return null;
  }
}

const lineKey = (line: LogLine) =>
  `${line.timestamp}|${line.source}|${line.message}`;

/**
 * Oldest first, without repeats, keeping the newest `max`. A stored line can also arrive
 * live, with a different id, so lines are matched by time, service and message.
 */
export function mergeLogs(
  current: LogLine[],
  incoming: LogLine[],
  max: number,
): LogLine[] {
  const seen = new Set(current.map(lineKey));
  const added = incoming.filter((line) => {
    const key = lineKey(line);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  if (added.length === 0) return current;
  const merged = [...current, ...added].sort((a, b) =>
    a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0,
  );
  return merged.length > max ? merged.slice(-max) : merged;
}
