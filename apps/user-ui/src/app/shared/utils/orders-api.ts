/** Client for checkout and the shopper's orders on the shop API, reached through the gateway. */

import type {
  ApiResponse,
  CheckoutInput,
  CheckoutItem,
  CheckoutQuote,
  Order,
} from '@org/models';
import { type CartItem, cartPaymentOption } from '../store/shop-store';
import { requestJson } from './request-json';
import { withSession } from './services-api';

export const MY_ORDERS_KEY = ['my-orders'];

/** The cart as the server needs it: ids, choices, quantities and how each line is paid. */
export const toCheckoutItems = (cart: CartItem[]): CheckoutItem[] =>
  cart.map((item) => ({
    productId: item.product.id,
    quantity: item.quantity,
    paymentOption: cartPaymentOption(item),
    ...(item.variant && { choices: item.variant.choices }),
  }));

export async function quoteCheckout(
  items: CheckoutItem[],
  discountCode?: string | null,
): Promise<CheckoutQuote> {
  const response = await requestJson<ApiResponse<CheckoutQuote>>(
    'POST',
    '/api/orders/quote',
    { items, ...(discountCode && { discountCode }) },
  );
  return response.data;
}

export function placeOrders(checkout: CheckoutInput) {
  return withSession(() =>
    requestJson<ApiResponse<Order[]>>('POST', '/api/orders', checkout),
  );
}

export async function listMyOrders(): Promise<Order[]> {
  const response = await withSession(() =>
    requestJson<ApiResponse<Order[]>>('GET', '/api/orders/mine'),
  );
  return response.data;
}

export function cancelMyOrder(id: string) {
  return withSession(() =>
    requestJson<ApiResponse<Order>>(
      'POST',
      `/api/orders/mine/${encodeURIComponent(id)}/cancel`,
    ),
  );
}
