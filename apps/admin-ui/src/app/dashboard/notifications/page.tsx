'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import {
  notificationTime,
  type NotificationStatus,
} from '@org/models/notifications';
import {
  useNotificationsFeed,
  useUnreadNotifications,
} from '../../shared/dashboard/use-notifications';
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  Panel,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';

const FILTERS: { value: NotificationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
];

export default function NotificationsPage() {
  const [filter, setFilter] = useState<NotificationStatus | 'all'>('all');
  const unread = useUnreadNotifications();
  const { feed, items, markRead, markAllRead } = useNotificationsFeed(
    filter === 'all' ? undefined : filter,
  );
  const failure = markRead.error ?? markAllRead.error;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `What's happening across MlimaLink. ${unread} unread.`
            : "What's happening across MlimaLink."
        }
        actions={
          <button
            type="button"
            disabled={unread === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            className={secondaryButtonClassName}
          >
            Mark all as read
          </button>
        }
      />

      <Panel>
        <div
          role="group"
          aria-label="Show notifications"
          className="mb-5 flex flex-wrap gap-2"
        >
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                filter === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {failure && <ErrorNotice message={failure.message} />}

        {feed.isPending ? (
          <Loading label="Loading notifications" />
        ) : feed.isError ? (
          <ErrorNotice message={feed.error.message} />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Bell}
            title={
              filter === 'unread'
                ? 'You’re all caught up'
                : 'No notifications yet'
            }
            description={
              filter === 'unread'
                ? 'Nothing unread right now.'
                : 'New orders and cancellations across MlimaLink show up here.'
            }
          />
        ) : (
          <ul
            aria-label="Notifications"
            className="divide-y divide-neutral-200"
          >
            {items.map((n) => {
              const isUnread = n.status === 'unread';
              const open = () => {
                if (isUnread) markRead.mutate(n.id);
              };
              return (
                <li key={n.id} className="flex gap-4 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Bell size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium text-neutral-900">
                      {n.title}
                      {isUnread && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-600">
                      {n.message}
                    </p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                      <time dateTime={n.createdAt} className="text-neutral-500">
                        {notificationTime(n.createdAt)}
                      </time>
                      {n.redirectLink && (
                        <Link
                          href={n.redirectLink}
                          onClick={open}
                          className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
                        >
                          View
                        </Link>
                      )}
                      {isUnread && (
                        <button
                          type="button"
                          onClick={open}
                          aria-label={`Mark "${n.title}" as read`}
                          className="font-medium text-neutral-600 hover:text-neutral-900"
                        >
                          Mark as read
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {feed.hasNextPage && (
          <div className="mt-5 flex justify-center">
            <button
              type="button"
              onClick={() => feed.fetchNextPage()}
              disabled={feed.isFetchingNextPage}
              className={secondaryButtonClassName}
            >
              {feed.isFetchingNextPage ? 'Loading…' : 'Show older'}
            </button>
          </div>
        )}
      </Panel>
    </>
  );
}
