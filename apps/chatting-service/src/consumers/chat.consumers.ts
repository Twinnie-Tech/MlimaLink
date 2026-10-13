import type { Consumer, ConsumerRunConfig, KafkaMessage } from 'kafkajs';
import { ensureTopic, getKafka } from '@org/utils/kafka';
import { storeMessages } from '../chat/conversations';
import type { ChatHub } from '../chat/hub';
import {
  CHAT_MESSAGES_TOPIC,
  instanceId,
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
export function deliveryGroupId(instance = instanceId()): string {
  return `chat-delivery-${instance}`;
}

function readEnvelope(message: KafkaMessage): ChatEnvelope | null {
  const envelope = parseChatEnvelope(message.value?.toString());
  if (!envelope) {
    console.warn(
      `Skipped a malformed message on ${CHAT_MESSAGES_TOPIC} at offset ${message.offset}.`,
    );
  }
  return envelope;
}

async function startConsumer(
  groupId: string,
  run: ConsumerRunConfig,
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
    await consumer.run(run);
  } catch (error) {
    await consumer.disconnect().catch(() => undefined);
    throw error;
  }
  return () => consumer.disconnect();
}

/**
 * Stores chat messages in MongoDB a batch at a time, so a busy topic means fewer, larger
 * writes. Offsets are committed only after the batch is written; a failed write throws,
 * so Kafka offers the whole batch again instead of losing it.
 */
export function startPersistenceConsumer(): Promise<() => Promise<void>> {
  return startConsumer(CHAT_PERSISTENCE_GROUP, {
    eachBatchAutoResolve: false,
    eachBatch: async ({ batch, resolveOffset, heartbeat, isStale }) => {
      if (isStale() || batch.messages.length === 0) return;
      const envelopes = batch.messages.flatMap((message) => {
        const envelope = readEnvelope(message);
        return envelope?.type === 'message' ? [envelope] : [];
      });
      try {
        await storeMessages(envelopes.map(({ message }) => message));
      } catch (error) {
        log(
          'error',
          `Couldn't store ${envelopes.length} chat messages from partition ${batch.partition}.`,
          {
            firstOffset: batch.firstOffset(),
            lastOffset: batch.lastOffset(),
            error: error instanceof Error ? error.message : String(error),
          },
        );
        throw error;
      }
      resolveOffset(batch.lastOffset());
      await heartbeat();
    },
  });
}

/**
 * Pushes each chat event to the participants connected to this instance, except those
 * this instance already pushed when it published them.
 */
export function startDeliveryConsumer(
  hub: ChatHub,
  instance = instanceId(),
): Promise<() => Promise<void>> {
  return startConsumer(deliveryGroupId(instance), {
    eachMessage: async ({ message }) => {
      const envelope = readEnvelope(message);
      if (envelope && envelope.origin !== instance) hub.deliver(envelope);
    },
  });
}
