/**
 * Kafka service for MlimaLink: home for the consumers that react to marketplace events.
 */

import './env';

import { USER_EVENTS_TOPIC } from '@org/utils/events';
import { disconnectProducer } from '@org/utils/kafka';
import { createApp } from './app';
import {
  USER_EVENTS_GROUP,
  startUserEventsConsumer,
} from './consumers/user-events.consumer';
import { prisma } from './prisma';

const CONSUMER_RETRY_MS = 30_000;

const port = Number(process.env.KAFKA_SERVICE_PORT) || 3335;
const server = createApp().listen(port, () => {
  console.log(`Kafka service listening at http://localhost:${port}/api`);
});
server.on('error', console.error);

let stopConsumer: (() => Promise<void>) | undefined;
let retryTimer: NodeJS.Timeout | undefined;

async function startConsumer() {
  try {
    stopConsumer = await startUserEventsConsumer();
    console.log(`Consuming ${USER_EVENTS_TOPIC} as ${USER_EVENTS_GROUP}.`);
  } catch (error) {
    console.error(
      `Couldn't start the ${USER_EVENTS_TOPIC} consumer: ${error instanceof Error ? error.message : error}. Trying again in ${CONSUMER_RETRY_MS / 1000}s.`,
    );
    retryTimer = setTimeout(() => void startConsumer(), CONSUMER_RETRY_MS);
  }
}

void startConsumer();

const shutdown = () => {
  clearTimeout(retryTimer);
  server.close();
  void (async () => {
    await stopConsumer?.().catch(console.error);
    await disconnectProducer().catch(console.error);
    await prisma.$disconnect();
  })().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
