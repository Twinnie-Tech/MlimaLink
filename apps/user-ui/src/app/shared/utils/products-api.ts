/** Client for the public product catalogue on the shop API, reached through the gateway. */

import type {
  ApiResponse,
  PaginatedResponse,
  Product,
  ProductFacets,
  ProductFilter,
} from '@org/models';
import { requestJson } from './request-json';

export const PRODUCTS_PAGE_SIZE = 12;

export const productsQueryKey = (filter: ProductFilter, page: number) => [
  'products',
  filter,
  page,
];
export const productFacetsQueryKey = (
  filter: Pick<ProductFilter, 'category' | 'searchTerm'>,
) => ['product-facets', filter];
export const OFFERS_QUERY_KEY = ['product-offers'];

export function productsUrl(filter: ProductFilter, page: number): string {
  const params = new URLSearchParams();
  if (filter.searchTerm) params.set('searchTerm', filter.searchTerm);
  if (filter.category) params.set('category', filter.category);
  if (filter.subCategory) params.set('subCategory', filter.subCategory);
  if (filter.minPrice !== undefined) {
    params.set('minPrice', String(filter.minPrice));
  }
  if (filter.maxPrice !== undefined) {
    params.set('maxPrice', String(filter.maxPrice));
  }
  if (filter.colors?.length) params.set('colors', filter.colors.join(','));
  if (filter.sizes?.length) params.set('sizes', filter.sizes.join(','));
  if (filter.minRating) params.set('minRating', String(filter.minRating));
  if (filter.onSale) params.set('onSale', 'true');
  if (filter.inStock) params.set('inStock', 'true');
  if (filter.sort && filter.sort !== 'newest') params.set('sort', filter.sort);
  params.set('page', String(page));
  params.set('pageSize', String(PRODUCTS_PAGE_SIZE));
  return `/api/products?${params}`;
}

export async function listProducts(
  filter: ProductFilter,
  page: number,
): Promise<PaginatedResponse<Product>> {
  const response = await requestJson<ApiResponse<PaginatedResponse<Product>>>(
    'GET',
    productsUrl(filter, page),
  );
  return response.data;
}

export async function getProductFacets(
  filter: Pick<ProductFilter, 'category' | 'searchTerm'>,
): Promise<ProductFacets> {
  const params = new URLSearchParams();
  if (filter.category) params.set('category', filter.category);
  if (filter.searchTerm) params.set('searchTerm', filter.searchTerm);
  const query = params.toString();
  const response = await requestJson<ApiResponse<ProductFacets>>(
    'GET',
    query ? `/api/products/facets?${query}` : '/api/products/facets',
  );
  return response.data;
}

export async function listOffers(): Promise<Product[]> {
  const response = await requestJson<ApiResponse<Product[]>>(
    'GET',
    '/api/products/offers',
  );
  return response.data;
}
