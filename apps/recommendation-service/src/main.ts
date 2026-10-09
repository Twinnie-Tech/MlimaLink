/**
 * Recommendation service for MlimaLink: product suggestions built from shopper activity.
 */

import './env';

import { createApp } from './app';

const port = Number(process.env.RECOMMENDATION_SERVICE_PORT) || 3338;
const server = createApp().listen(port, () => {
  console.log(
    `Recommendation service listening at http://localhost:${port}/api`,
  );
});
server.on('error', console.error);

const shutdown = () => {
  server.close(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
