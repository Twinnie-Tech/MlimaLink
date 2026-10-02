import request from 'supertest';
import { createApp } from './app';

describe('kafka-service app', () => {
  it('answers the health check', async () => {
    const response = await request(createApp()).get('/api');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ service: 'kafka-service', status: 'ok' });
  });
});
