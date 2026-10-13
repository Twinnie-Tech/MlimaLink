'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { notificationTime, type NotificationStatus } from '@org/models';
import {
  useNotificationsFeed,
  useUnreadNotifications,
} from '../../../shared/dashboard/use-notifications';
import {
  EmptyState,
  PageHeader,
  Panel,
  secondaryButtonClassName,
} from '../../../shared/dashboard/ui';

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
  const failure = feed.error ?? markRead.error ?? markAllRead.error;

  return (
    <>
      <PageHeader
        title="Notifications"
        description={
          unread > 0
            ? `Updates about your orders. ${unread} unread.`
            : 'Updates about your orders.'
        }
        actions={
          <button
            type="button"
            disabled={unread === 0 || markAllRead.isPending}
            onClick={() => markAllRead.mutate()}
            className={`${secondaryButtonClassName} disabled:cursor-not-allowed disabled:opacity-60`}
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
                  ? 'bg-brand-start text-white'
                  : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {failure && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
          >
            {failure.message}
          </p>
        )}

        {feed.isPending ? (
          <p
            role="status"
            className="py-10 text-center text-sm text-neutral-500"
          >
            Loading notifications…
          </p>
        ) : feed.isError ? null : items.length === 0 ? (
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
                : 'We’ll let you know here when a shop confirms your order, a rider is on the way, and when it’s delivered.'
            }
            action={
              filter === 'unread'
                ? undefined
                : { label: 'Browse products', href: '/products' }
            }
          />
        ) : (
          <ul
            aria-label="Notifications"
            className="divide-y divide-neutral-100"
          >
            {items.map((n) => {
              const isUnread = n.status === 'unread';
              const open = () => {
                if (isUnread) markRead.mutate(n.id);
              };
              return (
                <li key={n.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-start/10 text-brand-start">
                    <Bell size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="flex items-center gap-2 font-medium text-neutral-900">
                        {n.title}
                        {isUnread && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-brand-start">
                            <span className="sr-only">Unread</span>
                          </span>
                        )}
                      </p>
                      <time
                        dateTime={n.createdAt}
                        className="text-xs text-neutral-400"
                      >
                        {notificationTime(n.createdAt)}
                      </time>
                    </div>
                    <p className="mt-0.5 text-sm text-neutral-500">
                      {n.message}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                      {n.redirectLink && (
                        <Link
                          href={n.redirectLink}
                          onClick={open}
                          className="font-medium text-brand-start hover:text-brand-end"
                        >
                          View
                        </Link>
                      )}
                      {isUnread && (
                        <button
                          type="button"
                          onClick={open}
                          aria-label={`Mark "${n.title}" as read`}
                          className="font-medium text-neutral-500 hover:text-neutral-900"
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
