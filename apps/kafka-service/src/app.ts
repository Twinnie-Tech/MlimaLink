import express from 'express';

export function createApp() {
  const app = express();

  app.get('/api', (_req, res) => {
    res.send({ service: 'kafka-service', status: 'ok' });
  });

  return app;
}
