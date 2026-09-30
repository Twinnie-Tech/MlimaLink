/** Client for the shop's orders, rider requests and delivery settings on the shop API, reached through the gateway. */

import type {
  ApiResponse,
  AvailableRider,
  DeliverySettings,
  Order,
} from '@org/models';
import { requestJson, withSession } from './seller-api';

const ORDERS_URL = '/api/seller/orders';

export const SHOP_ORDERS_KEY = ['seller-orders'];

const orderUrl = (id: string) => `${ORDERS_URL}/${encodeURIComponent(id)}`;

export async function listShopOrders(): Promise<Order[]> {
  const response = await withSession(() =>
    requestJson<ApiResponse<Order[]>>('GET', ORDERS_URL),
  );
  return response.data;
}

export function updateShopOrder(
  id: string,
  status: 'confirmed' | 'cancelled',
  note?: string,
) {
  return withSession(() =>
    requestJson<ApiResponse<Order>>(
      'PATCH',
      orderUrl(id),
      note ? { status, note } : { status },
    ),
  );
}

/** Offers the delivery to one rider, or posts it to every rider in the shop's town without one. */
export function requestDelivery(id: string, riderId?: string) {
  return withSession(() =>
    requestJson<ApiResponse<Order>>(
      'POST',
      `${orderUrl(id)}/delivery`,
      riderId ? { riderId } : {},
    ),
  );
}

export function withdrawDeliveryRequest(id: string) {
  return withSession(() =>
    requestJson<ApiResponse<Order>>('DELETE', `${orderUrl(id)}/delivery`),
  );
}

export async function listAvailableRiders(): Promise<AvailableRider[]> {
  const response = await withSession(() =>
    requestJson<ApiResponse<AvailableRider[]>>('GET', '/api/seller/riders'),
  );
  return response.data;
}

export async function getDeliverySettings(): Promise<DeliverySettings> {
  const response = await withSession(() =>
    requestJson<ApiResponse<DeliverySettings>>(
      'GET',
      '/api/seller/delivery-settings',
    ),
  );
  return response.data;
}

export function saveDeliverySettings(settings: DeliverySettings) {
  return withSession(() =>
    requestJson<ApiResponse<DeliverySettings>>(
      'PUT',
      '/api/seller/delivery-settings',
      settings,
    ),
  );
}
