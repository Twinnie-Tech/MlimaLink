import express from 'express';
import type { ApiResponse, Product } from '@org/models';
import { readAccessToken, verifyAccessToken } from '@org/utils/auth';
import type { RecommendationEngine } from './services/recommendation-engine';

export const DEFAULT_RECOMMENDATIONS = 8;
export const MAX_RECOMMENDATIONS = 20;

const OBJECT_ID = /^[a-f\d]{24}$/i;

export type Recommendations = Pick<RecommendationEngine, 'recommend'>;

function readLimit(value: unknown): number {
  const limit = Math.floor(Number(value));
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_RECOMMENDATIONS;
  return Math.min(limit, MAX_RECOMMENDATIONS);
}

export function createApp(engine: Recommendations) {
  const app = express();

  app.get('/api', (_req, res) => {
    res.send({ service: 'recommendation-service', status: 'ok' });
  });

  /**
   * Products picked for the signed-in shopper. Guests get an empty list rather than a 401;
   * an expired or invalid token gets a 401 so the shop can renew the session and retry.
   * `?exclude=<productId>` leaves out the product being viewed; `?limit` caps the count.
   */
  app.get('/api/recommendations', async (req, res) => {
    const token = readAccessToken(req.headers, 'user');
    if (!token) {
      res.json({ success: true, data: [] } satisfies ApiResponse<Product[]>);
      return;
    }
    const access = verifyAccessToken(token, 'user');
    if (!access) {
      res.status(401).json({
        success: false,
        data: [],
        error: 'Your session has expired. Please log in again.',
      } satisfies ApiResponse<Product[]>);
      return;
    }
    const exclude = req.query.exclude;
    try {
      const data = await engine.recommend(access.id, {
        limit: readLimit(req.query.limit),
        exclude:
          typeof exclude === 'string' && OBJECT_ID.test(exclude)
            ? [exclude]
            : [],
      });
      res.json({ success: true, data } satisfies ApiResponse<Product[]>);
    } catch (error) {
      console.error(
        `Couldn't recommend products: ${error instanceof Error ? error.message : error}`,
      );
      res.status(503).json({
        success: false,
        data: [],
        error: 'Recommendations are unavailable right now.',
      } satisfies ApiResponse<Product[]>);
    }
  });

  return app;
}
