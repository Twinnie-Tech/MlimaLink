'use client';

import { useState } from 'react';
import {
  BadgeDollarSign,
  Bell,
  PackageCheck,
  ShoppingBag,
  Store,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import {
  EmptyState,
  PageHeader,
  Panel,
  PreviewNotice,
  secondaryButtonClassName,
} from '../../shared/dashboard/ui';

type Topic = 'orders' | 'accounts' | 'payments';

type Notification = {
  id: string;
  topic: Topic;
  icon: LucideIcon;
  title: string;
  body: string;
  time: string;
};

/** Examples of what will arrive live; replaced by the WebSocket feed later. */
const SAMPLE: Notification[] = [
  {
    id: 'n1',
    topic: 'orders',
    icon: ShoppingBag,
    title: 'New order ML-7Q2K9D',
    body: 'Hudson Ngira ordered 2 items from Kicks KE for $105.00.',
    time: '5 minutes ago',
  },
  {
    id: 'n2',
    topic: 'accounts',
    icon: Store,
    title: 'New seller signed up',
    body: 'Chai Corner created a shop in Nyeri and is waiting to list products.',
    time: '1 hour ago',
  },
  {
    id: 'n3',
    topic: 'payments',
    icon: BadgeDollarSign,
    title: 'Fee earned',
    body: 'MlimaLink earned $10.00 on order ML-4H8P2C once it was delivered.',
    time: '3 hours ago',
  },
  {
    id: 'n4',
    topic: 'orders',
    icon: PackageCheck,
    title: 'Order delivered',
    body: 'A rider delivered ML-4H8P2C to Ring road, Nyeri.',
    time: '3 hours ago',
  },
  {
    id: 'n5',
    topic: 'accounts',
    icon: UserX,
    title: 'Shopper suspended',
    body: 'An admin suspended a shopper account after repeated cancelled orders.',
    time: 'Yesterday',
  },
];

const TOPICS: { value: Topic | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'orders', label: 'Orders' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'payments', label: 'Payments' },
];

export default function NotificationsPage() {
  const [topic, setTopic] = useState<Topic | 'all'>('all');
  const [read, setRead] = useState<Set<string>>(() => new Set(['n4', 'n5']));
  const shown = SAMPLE.filter((n) => topic === 'all' || n.topic === topic);
  const unread = SAMPLE.filter((n) => !read.has(n.id)).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What's happening across MlimaLink."
        actions={
          <button
            type="button"
            disabled={unread === 0}
            onClick={() => setRead(new Set(SAMPLE.map((n) => n.id)))}
            className={secondaryButtonClassName}
          >
            Mark all as read
          </button>
        }
      />
      <PreviewNotice>
        These are examples. Live notifications will arrive here as they happen
        once the real-time (WebSocket) feed is connected.
      </PreviewNotice>

      <Panel>
        <div
          role="group"
          aria-label="Show notifications about"
          className="mb-5 flex flex-wrap gap-2"
        >
          {TOPICS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={topic === option.value}
              onClick={() => setTopic(option.value)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                topic === option.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {shown.length === 0 ? (
          <EmptyState
            icon={Bell}
            title="Nothing here"
            description="No notifications about this yet."
          />
        ) : (
          <ul
            aria-label="Notifications"
            className="divide-y divide-neutral-200"
          >
            {shown.map((n) => {
              const Icon = n.icon;
              const isUnread = !read.has(n.id);
              return (
                <li key={n.id} className="flex gap-4 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
                    <Icon size={18} aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium text-neutral-900">
                      {n.title}
                      {isUnread && (
                        <span className="h-2 w-2 rounded-full bg-blue-500">
                          <span className="sr-only">Unread</span>
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-neutral-600">{n.body}</p>
                    <p className="mt-1 text-xs text-neutral-500">{n.time}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </>
  );
}
