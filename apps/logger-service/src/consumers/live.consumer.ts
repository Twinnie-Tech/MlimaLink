import { hostname } from 'node:os';
import { ensureTopic, getKafka } from '@org/utils/kafka';
import { LIVE_LOGS_TOPIC, LOGS_TOPIC, parseLogEntry } from '@org/utils/logs';
import type { LiveLogHub } from '../live/hub';

/** Names this instance; set LOGGER_INSTANCE_ID to keep the same name across restarts. */
export const instanceId = () =>
  process.env.LOGGER_INSTANCE_ID?.trim() || `${hostname()}-${process.pid}`;

/**
 * One group per instance, so every instance sees every line and can pass it to the
 * admins connected to it.
 */
export function liveGroupId(instance = instanceId()): string {
  return `logger-live-${instance}`;
}

/**
 * Streams the logs and live_logs topics to the admins connected here as lines arrive.
 * Nothing is stored here: the logs group keeps the logs topic, and live_logs (like each
 * request through the gateway) is only ever shown live.
 */
export async function startLiveConsumer(
  hub: LiveLogHub,
  instance = instanceId(),
): Promise<() => Promise<void>> {
  const kafka = getKafka();
  await Promise.all([
    ensureTopic(kafka, LOGS_TOPIC),
    ensureTopic(kafka, LIVE_LOGS_TOPIC),
  ]);

  const consumer = kafka.consumer({ groupId: liveGroupId(instance) });
  await consumer.connect();
  try {
    await consumer.subscribe({
      topics: [LOGS_TOPIC, LIVE_LOGS_TOPIC],
      fromBeginning: false,
    });
    await consumer.run({
      eachMessage: async ({ topic, partition, message }) => {
        const entry = parseLogEntry(message.value?.toString());
        if (!entry) return;
        hub.broadcast({
          id: `${topic}-${partition}-${message.offset}`,
          ...entry,
        });
      },
    });
  } catch (error) {
    await consumer.disconnect().catch(() => undefined);
    throw error;
  }
  return () => consumer.disconnect();
}
