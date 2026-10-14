/**
 * Recommendation service for MlimaLink: product suggestions built from shopper activity.
 */

import './env';

import { createApp } from './app';
import { prisma } from './prisma';
import { RecommendationEngine } from './services/recommendation-engine';

const engine = new RecommendationEngine();
const port = Number(process.env.RECOMMENDATION_SERVICE_PORT) || 3338;
const server = createApp(engine).listen(port, () => {
  console.log(
    `Recommendation service listening at http://localhost:${port}/api`,
  );
  engine.warmUp();
});
server.on('error', console.error);

const shutdown = () => {
  server.close();
  void prisma.$disconnect().finally(() => process.exit(0));
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
