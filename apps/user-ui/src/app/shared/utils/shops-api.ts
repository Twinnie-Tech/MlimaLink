/** Client for the public shop directory on the shop API, reached through the gateway. */

import type {
  ApiResponse,
  PaginatedResponse,
  ShopDetail,
  ShopFilter,
  ShopSummary,
} from '@org/models';
import { requestJson } from './request-json';

export const SHOPS_PAGE_SIZE = 12;

export const shopsQueryKey = (filter: ShopFilter, page: number) => [
  'shops',
  filter,
  page,
];
export const shopQueryKey = (id: string) => ['shop', id];

export function shopsUrl(filter: ShopFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter.search) params.set('search', filter.search);
  if (filter.category) params.set('category', filter.category);
  if (filter.zone) params.set('zone', filter.zone);
  params.set('page', String(page));
  params.set('pageSize', String(SHOPS_PAGE_SIZE));
  return `/api/shops?${params}`;
}

export async function listShops(
  filter: ShopFilter,
  page: number,
): Promise<PaginatedResponse<ShopSummary>> {
  const response = await requestJson<
    ApiResponse<PaginatedResponse<ShopSummary>>
  >('GET', shopsUrl(filter, page));
  return response.data;
}

export async function getShop(id: string): Promise<ShopDetail> {
  const response = await requestJson<ApiResponse<ShopDetail>>(
    'GET',
    `/api/shops/${encodeURIComponent(id)}`,
  );
  return response.data;
}
