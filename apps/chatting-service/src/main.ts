/**
 * Chatting service for MlimaLink: direct, shop and support chats between shoppers,
 * sellers and admins, carried over Kafka.
 *
 * Messages are published to the chat_messages topic. One consumer group, shared by every
 * instance, stores them; each instance also reads them in its own group and delivers
 * them to the WebSockets connected to it, so the service can run on many machines.
 */

import './env';

import { disconnectProducer } from '@org/utils/kafka';
import { createApp } from './app';
import { ChatHub } from './chat/hub';
import { closePresenceBus } from './chat/presence-bus';
import {
  startDeliveryConsumer,
  startPersistenceConsumer,
} from './consumers/chat.consumers';
import { log } from './log';
import { prisma } from './prisma';
import { disconnectRedis } from './redis';
import { CHAT_SOCKET_PATH, attachChatSockets } from './ws';

const CONSUMER_RETRY_MS = 30_000;

const hub = new ChatHub();
const port = Number(process.env.CHAT_SERVICE_PORT) || 3336;
const server = createApp({ hub }).listen(port, () => {
  console.log(`Chatting service listening at http://localhost:${port}/api`);
  console.log(`Live chat at ws://localhost:${port}${CHAT_SOCKET_PATH}`);
});
server.on('error', console.error);
const sockets = attachChatSockets(server, hub);

const stops: Array<() => Promise<void>> = [];
const retryTimers = new Set<NodeJS.Timeout>();

function keepTrying(name: string, start: () => Promise<() => Promise<void>>) {
  const attempt = async () => {
    try {
      stops.push(await start());
      log('info', `Chatting service: ${name} consumer started.`);
    } catch (error) {
      log(
        'warn',
        `Chatting service couldn't start the ${name} consumer: ${error instanceof Error ? error.message : error}. Trying again in ${CONSUMER_RETRY_MS / 1000}s.`,
      );
      const timer = setTimeout(() => {
        retryTimers.delete(timer);
        void attempt();
      }, CONSUMER_RETRY_MS);
      retryTimers.add(timer);
    }
  };
  void attempt();
}

keepTrying('persistence', startPersistenceConsumer);
keepTrying('delivery', () => startDeliveryConsumer(hub));

const shutdown = () => {
  retryTimers.forEach(clearTimeout);
  for (const ws of sockets.clients) ws.terminate();
  sockets.close();
  server.close();
  void (async () => {
    await Promise.all(stops.map((stop) => stop().catch(console.error)));
    await disconnectProducer().catch(console.error);
    await closePresenceBus().catch(console.error);
    await disconnectRedis();
    await prisma.$disconnect();
  })().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
