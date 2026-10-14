import jwt from 'jsonwebtoken';
import request from 'supertest';
import type { Product } from '@org/models';
import {
  DEFAULT_RECOMMENDATIONS,
  MAX_RECOMMENDATIONS,
  createApp,
  type Recommendations,
} from './app';

const SECRET = 'u'.repeat(64);
const userId = 'a'.repeat(24);
const productId = 'c'.repeat(24);
const product = { id: productId, name: 'Phone' } as Product;

const shopperToken = (payload: object = { userId, role: 'user' }) =>
  jwt.sign(payload, SECRET, {
    audience: 'user',
    issuer: 'mlimalink-auth',
    expiresIn: 900,
  });

const engine = { recommend: vi.fn() } satisfies Recommendations;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('ACCESS_TOKEN_SECRET', SECRET);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('recommendation-service app', () => {
  it('answers the health check', async () => {
    const response = await request(createApp(engine)).get('/api');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      service: 'recommendation-service',
      status: 'ok',
    });
  });
});

describe('GET /api/recommendations', () => {
  it('recommends products for the signed-in shopper', async () => {
    engine.recommend.mockResolvedValue([product]);

    const response = await request(createApp(engine))
      .get('/api/recommendations')
      .set('Cookie', `accessToken=${shopperToken()}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [product] });
    expect(engine.recommend).toHaveBeenCalledWith(userId, {
      limit: DEFAULT_RECOMMENDATIONS,
      exclude: [],
    });
  });

  it('leaves out the product being viewed and caps the limit', async () => {
    engine.recommend.mockResolvedValue([]);

    await request(createApp(engine))
      .get(`/api/recommendations?exclude=${productId}&limit=500`)
      .set('Authorization', `Bearer ${shopperToken()}`);

    expect(engine.recommend).toHaveBeenCalledWith(userId, {
      limit: MAX_RECOMMENDATIONS,
      exclude: [productId],
    });
  });

  it('ignores an exclude that isn’t a product id', async () => {
    engine.recommend.mockResolvedValue([]);

    await request(createApp(engine))
      .get('/api/recommendations?exclude=abc&limit=3')
      .set('Cookie', `accessToken=${shopperToken()}`);

    expect(engine.recommend).toHaveBeenCalledWith(userId, {
      limit: 3,
      exclude: [],
    });
  });

  it('gives guests an empty list without a 401', async () => {
    const response = await request(createApp(engine)).get(
      '/api/recommendations',
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, data: [] });
    expect(engine.recommend).not.toHaveBeenCalled();
  });

  it.each([
    [
      'expired sessions',
      jwt.sign({ userId, role: 'user' }, SECRET, {
        audience: 'user',
        issuer: 'mlimalink-auth',
        expiresIn: -10,
      }),
    ],
    ['seller tokens', shopperToken({ userId, role: 'seller' })],
  ])('answers 401 for %s so the shop can renew', async (_label, token) => {
    const response = await request(createApp(engine))
      .get('/api/recommendations')
      .set('Cookie', `accessToken=${token}`);

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
    expect(engine.recommend).not.toHaveBeenCalled();
  });

  it('answers 503 when recommendations fail', async () => {
    engine.recommend.mockRejectedValue(new Error('database down'));

    const response = await request(createApp(engine))
      .get('/api/recommendations')
      .set('Cookie', `accessToken=${shopperToken()}`);

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      success: false,
      data: [],
      error: 'Recommendations are unavailable right now.',
    });
  });
});
