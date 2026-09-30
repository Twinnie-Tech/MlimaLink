/** Client for the seller product endpoints of the shop API, reached through the gateway at /api/seller/products. */

import type { ApiResponse, Product } from '@org/models';
import type { ProductInput } from '@org/models/catalog';
import { requestJson, withSession } from './seller-api';

const PRODUCTS_URL = '/api/seller/products';

export async function listMyProducts(): Promise<Product[]> {
  const response = await withSession(() =>
    requestJson<ApiResponse<Product[]>>('GET', PRODUCTS_URL),
  );
  return response.data;
}

export function createProduct(
  product: Omit<ProductInput, 'stock'> & { stock?: number },
) {
  return withSession(() =>
    requestJson<ApiResponse<Product>>('POST', PRODUCTS_URL, product),
  );
}

export function deleteProduct(id: string) {
  return withSession(() =>
    requestJson<ApiResponse<null>>(
      'DELETE',
      `${PRODUCTS_URL}/${encodeURIComponent(id)}`,
    ),
  );
}
