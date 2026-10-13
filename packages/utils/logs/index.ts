import { ensureTopic, getKafka, getProducer } from '../kafka/index.js';

/** Topic every service publishes its logs to; logger-service keeps them for a while. */
export const LOGS_TOPIC = 'logs';
/** Activity, like each request through the gateway: shown live to admins, never kept. */
export const LIVE_LOGS_TOPIC = 'live_logs';

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

const MAX_MESSAGE_LENGTH = 10_000;
const MAX_SOURCE_LENGTH = 100;

export interface LogEntry {
  level: LogLevel;
  message: string;
  /** The service that wrote the log, e.g. "auth-service". */
  source: string;
  /** ISO date string. */
  timestamp: string;
  meta?: Record<string, unknown>;
}

export function createLogEntry(
  level: LogLevel,
  message: string,
  source: string,
  meta?: Record<string, unknown>,
): LogEntry {
  return {
    level,
    message,
    source,
    timestamp: new Date().toISOString(),
    ...(meta && { meta }),
  };
}

export function isLogLevel(value: unknown): value is LogLevel {
  return LOG_LEVELS.includes(value as LogLevel);
}

/**
 * Reads a message from the logs topic; null when it isn't a valid entry. Overlong
 * messages are cut short rather than dropped, so a noisy service still shows up.
 */
export function parseLogEntry(raw: string | undefined): LogEntry | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object') return null;
  const { level, message, source, timestamp, meta } = data as Record<
    string,
    unknown
  >;
  if (!isLogLevel(level) || typeof message !== 'string') return null;
  if (
    typeof source !== 'string' ||
    !source.trim() ||
    source.length > MAX_SOURCE_LENGTH
  ) {
    return null;
  }
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    return null;
  }
  const hasMeta =
    meta !== null && typeof meta === 'object' && !Array.isArray(meta);
  return {
    level,
    message: message.slice(0, MAX_MESSAGE_LENGTH),
    source: source.trim(),
    timestamp: new Date(timestamp).toISOString(),
    ...(hasMeta && { meta: meta as Record<string, unknown> }),
  };
}

/**
 * Publishes a log entry to the logs topic, keyed by source so each service's logs stay
 * in order. Never throws: a broken log pipeline must not take the service down with it.
 */
export async function sendLog(entry: LogEntry): Promise<boolean> {
  try {
    const connected = await getProducer();
    await connected.send({
      topic: LOGS_TOPIC,
      messages: [{ key: entry.source, value: JSON.stringify(entry) }],
    });
    return true;
  } catch (error) {
    console.error(
      `Couldn't send log to Kafka: ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

export interface LogBatcher {
  push(entry: LogEntry): void;
  /** Sends what's waiting now. Never throws. */
  flush(): Promise<void>;
  /** Sends what's waiting and stops the timer, e.g. on shutdown. */
  stop(): Promise<void>;
}

/**
 * Collects entries and publishes them together every `everyMs`, or as soon as `maxBatch`
 * are waiting, so a busy service makes one Kafka request instead of one per entry. While
 * Kafka is unreachable entries are dropped, keeping at most ten batches waiting, and the
 * failure is reported once until a send works again.
 */
export function createLogBatcher({
  topic = LOGS_TOPIC,
  everyMs = 1000,
  maxBatch = 200,
}: { topic?: string; everyMs?: number; maxBatch?: number } = {}): LogBatcher {
  const maxWaiting = maxBatch * 10;
  let waiting: LogEntry[] = [];
  let sending: Promise<void> | null = null;
  let failing = false;
  let topicChecked: Promise<void> | null = null;

  const send = async (entries: LogEntry[]) => {
    try {
      topicChecked ??= ensureTopic(getKafka(), topic);
      await topicChecked;
      const connected = await getProducer();
      await connected.send({
        topic,
        messages: entries.map((entry) => ({
          key: entry.source,
          value: JSON.stringify(entry),
        })),
      });
      failing = false;
    } catch (error) {
      if (!failing) {
        console.error(
          `Couldn't send ${entries.length} log(s) to ${topic}: ${error instanceof Error ? error.message : error}`,
        );
      }
      failing = true;
    }
  };

  const flush = async () => {
    while (sending) await sending;
    if (waiting.length === 0) return;
    const entries = waiting;
    waiting = [];
    sending = send(entries).finally(() => {
      sending = null;
    });
    await sending;
  };

  const timer = setInterval(() => void flush(), everyMs);
  timer.unref?.();

  return {
    push(entry) {
      waiting.push(entry);
      if (waiting.length > maxWaiting) waiting = waiting.slice(-maxWaiting);
      if (waiting.length >= maxBatch && !sending) void flush();
    },
    flush,
    async stop() {
      clearInterval(timer);
      await flush();
    },
  };
}
