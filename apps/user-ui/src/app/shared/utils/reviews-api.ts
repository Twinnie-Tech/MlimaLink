/** Client for product and shop reviews on the shop API, reached through the gateway. */

import type { ApiResponse, Review, ReviewInput, ReviewPage } from '@org/models';
import { REVIEWS_PAGE_SIZE } from '@org/models/reviews';
import { requestJson } from './request-json';
import { withSession } from './services-api';

export type ReviewTarget = { kind: 'products' | 'shops'; id: string };

export const reviewsQueryKey = (target: ReviewTarget) => [
  'reviews',
  target.kind,
  target.id,
];

const reviewsPath = ({ kind, id }: ReviewTarget) =>
  `/api/${kind}/${encodeURIComponent(id)}/reviews`;

export async function listReviews(
  target: ReviewTarget,
  page: number,
): Promise<ReviewPage> {
  const response = await requestJson<ApiResponse<ReviewPage>>(
    'GET',
    `${reviewsPath(target)}?page=${page}&pageSize=${REVIEWS_PAGE_SIZE}`,
  );
  return response.data;
}

export function postReview(target: ReviewTarget, review: ReviewInput) {
  return withSession(() =>
    requestJson<ApiResponse<Review>>('POST', reviewsPath(target), review),
  );
}
