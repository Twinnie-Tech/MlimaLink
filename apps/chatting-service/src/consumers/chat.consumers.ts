import { hostname } from 'node:os';
import type { Consumer } from 'kafkajs';
import { ensureTopic, getKafka } from '@org/utils/kafka';
import { storeMessage } from '../chat/conversations';
import type { ChatHub } from '../chat/hub';
import {
  CHAT_MESSAGES_TOPIC,
  parseChatEnvelope,
  type ChatEnvelope,
} from '../chat/protocol';
import { log } from '../log';

/** Shared by every instance, so each message is stored once. */
export const CHAT_PERSISTENCE_GROUP = 'chat-persistence-group';

/**
 * One group per instance, so every instance sees every message and can deliver it to
 * its own sockets. Set CHAT_INSTANCE_ID to keep the same group across restarts.
 */
export function deliveryGroupId(
  instanceId = process.env.CHAT_INSTANCE_ID?.trim(),
): string {
  return `chat-delivery-${instanceId || `${hostname()}-${process.pid}`}`;
}

async function startConsumer(
  groupId: string,
  handle: (envelope: ChatEnvelope) => Promise<void> | void,
): Promise<() => Promise<void>> {
  const kafka = getKafka();
  await ensureTopic(kafka, CHAT_MESSAGES_TOPIC);

  const consumer: Consumer = kafka.consumer({ groupId });
  await consumer.connect();
  try {
    await consumer.subscribe({
      topic: CHAT_MESSAGES_TOPIC,
      fromBeginning: false,
    });
    await consumer.run({
      eachMessage: async ({ message }) => {
        const envelope = parseChatEnvelope(message.value?.toString());
        if (!envelope) {
          console.warn(
            `Skipped a malformed message on ${CHAT_MESSAGES_TOPIC} at offset ${message.offset}.`,
          );
          return;
        }
        await handle(envelope);
      },
    });
  } catch (error) {
    await consumer.disconnect().catch(() => undefined);
    throw error;
  }
  return () => consumer.disconnect();
}

/**
 * Stores each chat message in MongoDB. A failed write throws, so Kafka offers the
 * message again instead of losing it.
 */
export function startPersistenceConsumer(): Promise<() => Promise<void>> {
  return startConsumer(CHAT_PERSISTENCE_GROUP, async ({ message }) => {
    try {
      await storeMessage(message);
    } catch (error) {
      log('error', `Couldn't store chat message ${message.id}.`, {
        conversationId: message.conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  });
}

/** Pushes each chat message to the participants connected to this instance. */
export function startDeliveryConsumer(
  hub: ChatHub,
): Promise<() => Promise<void>> {
  return startConsumer(deliveryGroupId(), (envelope) => {
    hub.deliver(envelope);
  });
}
