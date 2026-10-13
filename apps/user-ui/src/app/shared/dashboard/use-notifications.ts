'use client';

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from '@tanstack/react-query';
import {
  NOTIFICATIONS_PAGE_SIZE,
  type NotificationList,
  type NotificationStatus,
} from '@org/models/notifications';
import {
  NOTIFICATIONS_KEY,
  NOTIFICATION_LISTS_KEY,
  NOTIFICATION_STATUS_KEY,
  getUnreadNotifications,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../utils/notifications-api';

/** New notifications show up within this long. */
const REFRESH_MS = 30_000;

/** How many of the shopper's notifications are unread, for the sidebar and page header. */
export function useUnreadNotifications(): number {
  const { data } = useQuery({
    queryKey: NOTIFICATION_STATUS_KEY,
    queryFn: getUnreadNotifications,
    refetchInterval: REFRESH_MS,
  });
  return data ?? 0;
}

/** The shopper's notifications, newest first, a page at a time, with ways to mark them read. */
export function useNotificationsFeed(status?: NotificationStatus) {
  const queryClient = useQueryClient();

  const feed = useInfiniteQuery({
    queryKey: [...NOTIFICATION_LISTS_KEY, status ?? 'all'],
    queryFn: ({ pageParam }) =>
      listNotifications({ status, before: pageParam }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) =>
      last.items.length === NOTIFICATIONS_PAGE_SIZE
        ? last.items.at(-1)?.createdAt
        : undefined,
    refetchInterval: REFRESH_MS,
  });

  // Shows the change straight away; the refetch afterwards brings back the server's view.
  const markLocally = (id?: string) => {
    queryClient.setQueriesData<InfiniteData<NotificationList>>(
      { queryKey: NOTIFICATION_LISTS_KEY },
      (data) =>
        data && {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            items: page.items.map((item) =>
              !id || item.id === id ? { ...item, status: 'read' } : item,
            ),
          })),
        },
    );
    queryClient.setQueryData<number>(NOTIFICATION_STATUS_KEY, (unread = 0) =>
      id ? Math.max(unread - 1, 0) : 0,
    );
  };
  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: NOTIFICATIONS_KEY });

  const markRead = useMutation({
    mutationFn: markNotificationRead,
    onMutate: (id) => markLocally(id),
    onSettled: refresh,
  });
  const markAllRead = useMutation({
    mutationFn: markAllNotificationsRead,
    onMutate: () => markLocally(),
    onSettled: refresh,
  });

  const seen = new Set<string>();
  const items = (feed.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((item) => !seen.has(item.id) && Boolean(seen.add(item.id)));

  return { feed, items, markRead, markAllRead };
}
