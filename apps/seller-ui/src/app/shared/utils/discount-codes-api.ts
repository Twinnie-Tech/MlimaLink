/** Client for the seller discount code endpoints of the shop API, reached through the gateway. */

import type { ApiResponse, DiscountCode, DiscountCodeInput } from '@org/models';
import { requestJson, withSession } from './seller-api';

const DISCOUNT_CODES_URL = '/api/seller/discount-codes';

const codeUrl = (id: string) =>
  `${DISCOUNT_CODES_URL}/${encodeURIComponent(id)}`;

export async function listMyDiscountCodes(): Promise<DiscountCode[]> {
  const response = await withSession(() =>
    requestJson<ApiResponse<DiscountCode[]>>('GET', DISCOUNT_CODES_URL),
  );
  return response.data;
}

export function createDiscountCode(discount: DiscountCodeInput) {
  return withSession(() =>
    requestJson<ApiResponse<DiscountCode>>(
      'POST',
      DISCOUNT_CODES_URL,
      discount,
    ),
  );
}

export function setDiscountCodeActive(id: string, active: boolean) {
  return withSession(() =>
    requestJson<ApiResponse<DiscountCode>>('PATCH', codeUrl(id), { active }),
  );
}

export function deleteDiscountCode(id: string) {
  return withSession(() =>
    requestJson<ApiResponse<null>>('DELETE', codeUrl(id)),
  );
}
