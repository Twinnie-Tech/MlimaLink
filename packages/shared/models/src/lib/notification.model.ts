export const NOTIFICATION_STATUSES = ['unread', 'read'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

/** Something to tell a shopper, seller or admin. */
export interface Notification {
  id: string;
  /** The shopper, seller, rider or admin whose action caused it. */
  creatorId: string | null;
  receiverId: string;
  title: string;
  message: string;
  /** A path in the receiver's own app, e.g. "/dashboard/orders". */
  redirectLink: string | null;
  status: NotificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationList {
  /** Newest first. */
  items: Notification[];
  /** All of the receiver's unread notifications, not only those listed. */
  unread: number;
}

export const NOTIFICATIONS_PAGE_SIZE = 50;
export const NOTIFICATIONS_MAX_PAGE_SIZE = 100;

export interface NotificationQuery {
  status?: NotificationStatus;
  limit: number;
  /** Only notifications created before this, for the next page. */
  before?: Date;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "Just now", "5 min ago", "3 h ago", "Yesterday", then the date, e.g. "13 Oct 2026". */
export function notificationTime(iso: string, now = new Date()): string {
  const at = new Date(iso);
  const ago = now.getTime() - at.getTime();
  if (ago < MINUTE) return 'Just now';
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min ago`;
  if (ago < DAY) return `${Math.floor(ago / HOUR)} h ago`;
  if (ago < 2 * DAY) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(at);
}

/** Reads `?status=&limit=&before=`, ignoring values that don't make sense. */
export function parseNotificationQuery(
  query: Record<string, unknown>,
): NotificationQuery {
  const status = NOTIFICATION_STATUSES.find((s) => s === query['status']);
  const limit = Number(query['limit']);
  const before =
    typeof query['before'] === 'string' ? new Date(query['before']) : null;
  return {
    ...(status && { status }),
    limit:
      Number.isInteger(limit) && limit > 0
        ? Math.min(limit, NOTIFICATIONS_MAX_PAGE_SIZE)
        : NOTIFICATIONS_PAGE_SIZE,
    ...(before && !Number.isNaN(before.getTime()) && { before }),
  };
}
