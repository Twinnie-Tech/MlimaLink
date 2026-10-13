/**
 * Logger service for MlimaLink: stores the platform logs every service publishes to the
 * logs topic and serves them to admins, and streams those plus live-only activity (like
 * each request through the gateway) to the admin Loggers page as it happens.
 */

import './env';

import { LIVE_LOGS_TOPIC, LOGS_TOPIC } from '@org/utils/logs';
import { createApp } from './app';
import { liveGroupId, startLiveConsumer } from './consumers/live.consumer';
import { LOGS_GROUP, startLogsConsumer } from './consumers/logs.consumer';
import { LiveLogHub } from './live/hub';
import { LOGS_SOCKET_PATH, attachLiveLogs } from './live/sockets';
import { deleteOldLogs, retentionDays } from './logs/store';
import { prisma } from './prisma';

const CONSUMER_RETRY_MS = 30_000;
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

const port = Number(process.env.LOGGER_SERVICE_PORT) || 3337;
const server = createApp().listen(port, () => {
  console.log(`Logger service listening at http://localhost:${port}/api`);
  console.log(`Live logs at ws://localhost:${port}${LOGS_SOCKET_PATH}`);
});
server.on('error', console.error);
const hub = new LiveLogHub();
const sockets = attachLiveLogs(server, hub);

const stops: Array<() => Promise<void>> = [];
const retryTimers = new Set<NodeJS.Timeout>();

function keepTrying(
  description: string,
  start: () => Promise<() => Promise<void>>,
) {
  const attempt = async () => {
    try {
      stops.push(await start());
      console.log(`Consuming ${description}.`);
    } catch (error) {
      console.error(
        `Couldn't start consuming ${description}: ${error instanceof Error ? error.message : error}. Trying again in ${CONSUMER_RETRY_MS / 1000}s.`,
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

keepTrying(`${LOGS_TOPIC} as ${LOGS_GROUP}`, startLogsConsumer);
keepTrying(
  `${LOGS_TOPIC} and ${LIVE_LOGS_TOPIC} live as ${liveGroupId()}`,
  () => startLiveConsumer(hub),
);
void cleanUp();
const cleanupTimer = setInterval(() => void cleanUp(), CLEANUP_INTERVAL_MS);

const shutdown = () => {
  retryTimers.forEach(clearTimeout);
  clearInterval(cleanupTimer);
  for (const ws of sockets.clients) ws.terminate();
  sockets.close();
  server.close();
  void (async () => {
    await Promise.all(stops.map((stop) => stop().catch(console.error)));
    await prisma.$disconnect();
  })().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
