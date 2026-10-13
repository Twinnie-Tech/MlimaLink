'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Bell, Landmark } from 'lucide-react';
import {
  notificationTime,
  type NotificationStatus,
} from '@org/models/notifications';
import { useDashboardSeller } from '../../shared/dashboard/seller-context';
import {
  useNotificationsFeed,
  useUnreadNotifications,
} from '../../shared/dashboard/use-notifications';
import {
  EmptyState,
  PageHeader,
  Panel,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';

const FILTERS: { value: NotificationStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
];

export default function NotificationsPage() {
  const seller = useDashboardSeller();
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
            ? `Updates about your shop and orders. ${unread} unread.`
            : 'Updates about your shop and orders.'
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

      {!seller.stripeId && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm">
          <Landmark
            size={18}
            className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
          <p className="text-amber-800">
            Connect your bank to get paid. You need a payout account before you
            can receive money from sales.{' '}
            <Link
              href="/dashboard/payments"
              className="font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
            >
              Connect bank
            </Link>
          </p>
        </div>
      )}

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

        {failure && (
          <p
            role="alert"
            className="mb-5 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-700 dark:text-rose-300"
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
                : 'New orders, cancellations and deliveries show up here.'
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
                <li key={n.id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
                    <Bell size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="flex items-center gap-2 font-medium text-neutral-900">
                        {n.title}
                        {isUnread && (
                          <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500">
                            <span className="sr-only">Unread</span>
                          </span>
                        )}
                      </p>
                      <time
                        dateTime={n.createdAt}
                        className="text-xs text-neutral-500"
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
