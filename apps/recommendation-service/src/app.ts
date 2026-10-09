import express from 'express';

export function createApp() {
  const app = express();

  app.get('/api', (_req, res) => {
    res.send({ service: 'recommendation-service', status: 'ok' });
  });

  return app;
}
