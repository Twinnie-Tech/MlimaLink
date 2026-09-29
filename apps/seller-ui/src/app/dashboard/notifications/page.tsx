'use client';

import Link from 'next/link';
import { Landmark, PartyPopper, Store, type LucideIcon } from 'lucide-react';
import { firstName } from '../../shared/hooks/use-seller';
import { useDashboardSeller } from '../../shared/dashboard/seller-context';
import { PageHeader, Panel, formatDate } from '../../shared/dashboard/ui';

type Notification = {
  id: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  body: string;
  date: string;
  action?: { label: string; href: string };
};

export default function NotificationsPage() {
  const seller = useDashboardSeller();
  const { shop } = seller;

  const notifications: Notification[] = [
    ...(seller.stripeId
      ? []
      : [
          {
            id: 'connect-bank',
            icon: Landmark,
            tone: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
            title: 'Connect your bank to get paid',
            body: 'You need a payout account before you can receive money from sales.',
            date: shop.createdAt,
            action: { label: 'Connect bank', href: '/dashboard/payments' },
          },
        ]),
    {
      id: 'shop-live',
      icon: Store,
      tone: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
      title: `${shop.name} is set up`,
      body: 'Add your first product so shoppers can start buying from you.',
      date: shop.createdAt,
      action: { label: 'Create product', href: '/dashboard/create-product' },
    },
    {
      id: 'welcome',
      icon: PartyPopper,
      tone: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
      title: `Welcome to MlimaLink, ${firstName(seller.name)}`,
      body: 'Your seller account is ready.',
      date: seller.createdAt,
    },
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your shop and account."
      />

      <Panel>
        <ul className="divide-y divide-neutral-200">
          {notifications.map(
            ({ id, icon: Icon, tone, title, body, date, action }) => (
              <li key={id} className="flex gap-4 py-4 first:pt-0 last:pb-0">
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tone}`}
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium text-neutral-900">{title}</p>
                    <time dateTime={date} className="text-xs text-neutral-500">
                      {formatDate(date)}
                    </time>
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-500">{body}</p>
                  {action && (
                    <Link
                      href={action.href}
                      className="mt-2 inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
                    >
                      {action.label}
                    </Link>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      </Panel>
    </>
  );
}
