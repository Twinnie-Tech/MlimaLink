import type { Kafka } from 'kafkajs';
import {
  USER_EVENTS_TOPIC,
  isProductAction,
  parseUserEvent,
  type UserEvent,
} from '@org/utils/events';
import { getKafka } from '@org/utils/kafka';
import {
  updateProductAnalytics,
  updateShopAnalytics,
  updateUserAnalytics,
} from '../services/analytics.service';

export const USER_EVENTS_GROUP = 'user-events-group';

/** How often queued events are written to the database. */
export const PROCESS_INTERVAL_MS = 3000;

/** Events read from Kafka, waiting to be written to the database. */
export const eventQueue: UserEvent[] = [];

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

let running: Promise<void> | undefined;

async function drainQueue(): Promise<void> {
  const events = [...eventQueue];
  eventQueue.length = 0;

  for (const event of events) {
    try {
      if (event.action === 'shop_visit') {
        await updateShopAnalytics(event);
        continue;
      }
      if (!isProductAction(event.action)) continue;
      await updateUserAnalytics(event);
      await updateProductAnalytics(event);
    } catch (error) {
      // One failed write mustn't hold up the rest of the batch.
      console.error(
        `Couldn't record ${event.action} for user ${event.userId}: ${errorMessage(error)}`,
      );
    }
  }
}

/** Writes the queued events to the analytics collections; overlapping calls share one run. */
export function processQueue(): Promise<void> {
  running ??= drainQueue().finally(() => {
    running = undefined;
  });
  return running;
}

/** Creates the topic when the cluster allows it; Confluent Cloud doesn't create topics on first use. */
async function ensureTopic(kafka: Kafka): Promise<void> {
  const admin = kafka.admin();
  try {
    await admin.connect();
    if ((await admin.listTopics()).includes(USER_EVENTS_TOPIC)) return;
    await admin.createTopics({ topics: [{ topic: USER_EVENTS_TOPIC }] });
    console.log(`Created the ${USER_EVENTS_TOPIC} topic.`);
  } catch (error) {
    console.warn(
      `Couldn't make sure the ${USER_EVENTS_TOPIC} topic exists: ${errorMessage(error)}`,
    );
  } finally {
    await admin.disconnect().catch(() => undefined);
  }
}

/**
 * Reads new messages on user_events into `eventQueue` and writes them to the database
 * every PROCESS_INTERVAL_MS. Resolves with a function that stops the consumer and
 * writes whatever is still queued.
 */
export async function startUserEventsConsumer(): Promise<() => Promise<void>> {
  const kafka = getKafka();
  await ensureTopic(kafka);

  const consumer = kafka.consumer({ groupId: USER_EVENTS_GROUP });
  await consumer.connect();
  try {
    await consumer.subscribe({
      topic: USER_EVENTS_TOPIC,
      fromBeginning: false,
    });
    await consumer.run({
      eachMessage: async ({ message }) => {
        const event = parseUserEvent(message.value?.toString());
        if (event) {
          eventQueue.push(event);
        } else {
          console.warn(
            `Skipped a malformed message on ${USER_EVENTS_TOPIC} at offset ${message.offset}.`,
          );
        }
      },
    });
  } catch (error) {
    await consumer.disconnect().catch(() => undefined);
    throw error;
  }

  const timer = setInterval(() => void processQueue(), PROCESS_INTERVAL_MS);

  return async () => {
    clearInterval(timer);
    await consumer.disconnect();
    await running;
    await processQueue();
  };
}
