import type { Producer } from 'kafkajs';
import { getKafka } from '../kafka/index.js';

/** Topic every service publishes its logs to. */
export const LOGS_TOPIC = 'logs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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

let producer: Promise<Producer> | undefined;

function logProducer(): Promise<Producer> {
  producer ??= (async () => {
    const created = getKafka().producer();
    await created.connect();
    return created;
  })().catch((error) => {
    producer = undefined;
    throw error;
  });
  return producer;
}

/**
 * Publishes a log entry to the logs topic, keyed by source so each service's logs stay
 * in order. Never throws: a broken log pipeline must not take the service down with it.
 */
export async function sendLog(entry: LogEntry): Promise<boolean> {
  try {
    const connected = await logProducer();
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

/** Call on shutdown so buffered logs are flushed. */
export async function disconnectLogProducer(): Promise<void> {
  const current = producer;
  producer = undefined;
  if (current) await (await current.catch(() => undefined))?.disconnect();
}
