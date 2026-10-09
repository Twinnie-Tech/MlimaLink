import { ensureTopic, getKafka } from '@org/utils/kafka';
import { LOGS_TOPIC, parseLogEntry, type LogEntry } from '@org/utils/logs';
import { saveLogs } from '../logs/store';

/** Shared by every logger-service instance, so each entry is stored once. */
export const LOGS_GROUP = 'logger-service-group';

/**
 * Stores entries from the logs topic a batch at a time. A batch is only marked as read
 * once it's saved, so a failed write is retried instead of losing logs.
 *
 * Failures go to the console only: publishing them to the logs topic would feed them
 * straight back into this consumer.
 */
export async function startLogsConsumer(): Promise<() => Promise<void>> {
  const kafka = getKafka();
  await ensureTopic(kafka, LOGS_TOPIC);

  const consumer = kafka.consumer({ groupId: LOGS_GROUP });
  await consumer.connect();
  try {
    await consumer.subscribe({ topic: LOGS_TOPIC, fromBeginning: false });
    await consumer.run({
      eachBatch: async ({ batch }) => {
        const entries: LogEntry[] = [];
        let skipped = 0;
        for (const message of batch.messages) {
          const entry = parseLogEntry(message.value?.toString());
          if (entry) entries.push(entry);
          else skipped += 1;
        }
        if (skipped > 0) {
          console.warn(
            `Skipped ${skipped} malformed message(s) on ${LOGS_TOPIC}.`,
          );
        }
        try {
          await saveLogs(entries);
        } catch (error) {
          console.error(
            `Couldn't store ${entries.length} log entries: ${error instanceof Error ? error.message : error}`,
          );
          throw error;
        }
      },
    });
  } catch (error) {
    await consumer.disconnect().catch(() => undefined);
    throw error;
  }
  return () => consumer.disconnect();
}
