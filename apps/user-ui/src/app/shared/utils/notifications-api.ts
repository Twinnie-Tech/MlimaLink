/** Client for the signed-in shopper's notifications on the shop API, reached through the gateway. */

import type {
  ApiResponse,
  Notification,
  NotificationList,
  NotificationStatus,
} from '@org/models';
import { requestJson } from './request-json';
import { withSession } from './services-api';

const NOTIFICATIONS_URL = '/api/notifications';

export const NOTIFICATIONS_KEY = ['my-notifications'] as const;
export const NOTIFICATION_LISTS_KEY = [...NOTIFICATIONS_KEY, 'list'] as const;
export const NOTIFICATION_STATUS_KEY = [
  ...NOTIFICATIONS_KEY,
  'status',
] as const;

export async function listNotifications({
  status,
  before,
}: {
  status?: NotificationStatus;
  before?: string;
} = {}): Promise<NotificationList> {
  const query = new URLSearchParams({
    ...(status && { status }),
    ...(before && { before }),
  }).toString();
  const response = await withSession(() =>
    requestJson<ApiResponse<NotificationList>>(
      'GET',
      query ? `${NOTIFICATIONS_URL}?${query}` : NOTIFICATIONS_URL,
    ),
  );
  return response.data;
}

export async function getUnreadNotifications(): Promise<number> {
  const response = await withSession(() =>
    requestJson<ApiResponse<{ unread: number }>>(
      'GET',
      `${NOTIFICATIONS_URL}/status`,
    ),
  );
  return response.data.unread;
}

export function markNotificationRead(id: string) {
  return withSession(() =>
    requestJson<ApiResponse<Notification>>(
      'PATCH',
      `${NOTIFICATIONS_URL}/${encodeURIComponent(id)}/read`,
    ),
  );
}

export function markAllNotificationsRead() {
  return withSession(() =>
    requestJson<ApiResponse<{ updated: number }>>(
      'PATCH',
      `${NOTIFICATIONS_URL}/read-all`,
    ),
  );
}
