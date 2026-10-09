import type { Prisma } from '@prisma/client';
import type { LogEntry, LogLevel } from '@org/utils/logs';
import { prisma } from '../prisma';

export const DEFAULT_RETENTION_DAYS = 7;
export const MAX_PAGE_SIZE = 200;
const DEFAULT_PAGE_SIZE = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface StoredLog extends LogEntry {
  id: string;
}

export interface LogQuery {
  level?: LogLevel;
  source?: string;
  /** Matches anywhere in the message, ignoring case. */
  search?: string;
  /** Only entries older than this, for the next page. */
  before?: Date;
  limit?: number;
}

/** LOG_RETENTION_DAYS, or the default when it's unset or not a positive number. */
export function retentionDays(value = process.env.LOG_RETENTION_DAYS): number {
  const days = Number(value);
  return Number.isFinite(days) && days > 0 ? days : DEFAULT_RETENTION_DAYS;
}

export async function saveLogs(entries: LogEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await prisma.platform_logs.createMany({
    data: entries.map((entry) => ({
      level: entry.level,
      message: entry.message,
      source: entry.source,
      meta: entry.meta as Prisma.InputJsonValue | undefined,
      timestamp: new Date(entry.timestamp),
    })),
  });
}

/** Newest first. */
export async function queryLogs(query: LogQuery = {}): Promise<StoredLog[]> {
  const limit = Math.min(
    Math.max(Math.floor(query.limit ?? DEFAULT_PAGE_SIZE), 1),
    MAX_PAGE_SIZE,
  );
  const rows = await prisma.platform_logs.findMany({
    where: {
      ...(query.level && { level: query.level }),
      ...(query.source && { source: query.source }),
      ...(query.search && {
        message: { contains: query.search, mode: 'insensitive' as const },
      }),
      ...(query.before && { timestamp: { lt: query.before } }),
    },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });
  return rows.map((row) => ({
    id: row.id,
    level: row.level as LogLevel,
    message: row.message,
    source: row.source,
    timestamp: row.timestamp.toISOString(),
    ...(row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
      ? { meta: row.meta as Record<string, unknown> }
      : {}),
  }));
}

/** Every service that has logged something still kept. */
export async function listSources(): Promise<string[]> {
  const rows = await prisma.platform_logs.findMany({
    distinct: ['source'],
    select: { source: true },
  });
  return rows.map((row) => row.source).sort();
}

/** Deletes entries older than the retention period; returns how many went. */
export async function deleteOldLogs(
  days = retentionDays(),
  now = Date.now(),
): Promise<number> {
  const { count } = await prisma.platform_logs.deleteMany({
    where: { timestamp: { lt: new Date(now - days * DAY_MS) } },
  });
  return count;
}
