/** Client for the recommendation service, reached through the gateway. */

import type { ApiResponse, Product } from '@org/models';
import { requestJson } from './request-json';
import { withSession } from './services-api';

export const recommendationsQueryKey = (exclude?: string) => [
  'recommendations',
  exclude ?? null,
];

/** Products picked for the signed-in shopper, leaving out `exclude` (the product being viewed). */
export async function getRecommendations(exclude?: string): Promise<Product[]> {
  const query = exclude ? `?exclude=${encodeURIComponent(exclude)}` : '';
  const response = await withSession(() =>
    requestJson<ApiResponse<Product[]>>('GET', `/api/recommendations${query}`),
  );
  return response.data;
}
