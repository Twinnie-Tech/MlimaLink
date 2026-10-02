/**
 * Kafka service for MlimaLink: home for the consumers that react to marketplace events.
 */

import './env';

import { disconnectLogProducer } from '@org/utils/logs';
import { createApp } from './app';

const port = Number(process.env.KAFKA_SERVICE_PORT) || 3335;
const server = createApp().listen(port, () => {
  console.log(`Kafka service listening at http://localhost:${port}/api`);
});
server.on('error', console.error);

const shutdown = () => {
  server.close();
  void disconnectLogProducer().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
