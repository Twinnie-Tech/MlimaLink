'use server';

import { cookies, headers } from 'next/headers';
import type { UserActivity } from '../app/shared/utils/events-api';
import { requestContext } from '../app/shared/utils/request-context';

const apiGatewayUrl = process.env.API_GATEWAY_URL || 'http://127.0.0.1:3000';

/** Set by auth-service for signed-in shoppers. */
const ACCESS_TOKEN_COOKIE = 'accessToken';
const TIMEOUT_MS = 5000;

/**
 * Sends what the signed-in shopper did to the api, which checks their session, looks up
 * the shop and publishes the event to Kafka's user_events topic for kafka-service to
 * store. Adds the device and, when the host provides it, the location. Server actions
 * can be called by anyone with any arguments, so only the known fields are forwarded
 * and the api does the validation. Resolves to whether the api accepted the event;
 * never throws.
 */
export async function sendKafkaEvent(activity: UserActivity): Promise<boolean> {
  const [cookieStore, requestHeaders] = await Promise.all([
    cookies(),
    headers(),
  ]);
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token || typeof activity !== 'object' || activity === null) return false;

  const { action } = activity;
  const target =
    activity.action === 'shop_visit'
      ? { shopId: activity.shopId }
      : { productId: activity.productId };

  try {
    const response = await fetch(`${apiGatewayUrl}/api/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        action,
        ...target,
        ...requestContext(requestHeaders),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return response.ok;
  } catch {
    return false;
  }
}
