/**
 * Logger service for MlimaLink: stores the platform logs every service publishes to the
 * logs topic, and serves them to admins.
 */

import './env';

import { LOGS_TOPIC } from '@org/utils/logs';
import { createApp } from './app';
import { LOGS_GROUP, startLogsConsumer } from './consumers/logs.consumer';
import { deleteOldLogs, retentionDays } from './logs/store';
import { prisma } from './prisma';

const CONSUMER_RETRY_MS = 30_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const port = Number(process.env.LOGGER_SERVICE_PORT) || 3337;
const server = createApp().listen(port, () => {
  console.log(`Logger service listening at http://localhost:${port}/api`);
});
server.on('error', console.error);

let stopConsumer: (() => Promise<void>) | undefined;
let retryTimer: NodeJS.Timeout | undefined;

async function startConsumer() {
  try {
    stopConsumer = await startLogsConsumer();
    console.log(`Consuming ${LOGS_TOPIC} as ${LOGS_GROUP}.`);
  } catch (error) {
    console.error(
      `Couldn't start the ${LOGS_TOPIC} consumer: ${error instanceof Error ? error.message : error}. Trying again in ${CONSUMER_RETRY_MS / 1000}s.`,
    );
    retryTimer = setTimeout(() => void startConsumer(), CONSUMER_RETRY_MS);
  }
}

async function cleanUp() {
  try {
    const removed = await deleteOldLogs();
    if (removed > 0) {
      console.log(
        `Deleted ${removed} log entries older than ${retentionDays()} days.`,
      );
    }
  } catch (error) {
    console.error(
      `Couldn't delete old logs: ${error instanceof Error ? error.message : error}`,
    );
  }
}

void startConsumer();
void cleanUp();
const cleanupTimer = setInterval(() => void cleanUp(), CLEANUP_INTERVAL_MS);

const shutdown = () => {
  clearTimeout(retryTimer);
  clearInterval(cleanupTimer);
  server.close();
  void (async () => {
    await stopConsumer?.().catch(console.error);
    await prisma.$disconnect();
  })().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
