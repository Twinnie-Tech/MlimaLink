'use client';

import Link from 'next/link';
import {
  Heart,
  PartyPopper,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import { firstName } from '../../../shared/hooks/use-user';
import { useShopStore } from '../../../shared/store/shop-store';
import { useDashboardUser } from '../../../shared/dashboard/user-context';
import { PageHeader, Panel, formatDate } from '../../../shared/dashboard/ui';

type Notification = {
  id: string;
  icon: LucideIcon;
  tone: string;
  title: string;
  body: string;
  date?: string;
  action?: { label: string; href: string };
};

export default function NotificationsPage() {
  const user = useDashboardUser();
  const { wishlist, cartCount } = useShopStore();
  const outOfStock = wishlist.filter((product) => !product.inStock);

  const notifications: Notification[] = [
    ...(cartCount > 0
      ? [
          {
            id: 'cart',
            icon: ShoppingCart,
            tone: 'bg-brand-start/10 text-brand-start',
            title: `You have ${cartCount} ${cartCount === 1 ? 'item' : 'items'} in your cart`,
            body: 'Your cart is saved on this device, ready when you are.',
            action: { label: 'View cart', href: '/dashboard/cart' },
          },
        ]
      : []),
    ...(outOfStock.length > 0
      ? [
          {
            id: 'out-of-stock',
            icon: Heart,
            tone: 'bg-rose-50 text-rose-500',
            title: `${outOfStock.length} wishlist ${outOfStock.length === 1 ? 'item is' : 'items are'} out of stock`,
            body: outOfStock.map((product) => product.name).join(', '),
            action: { label: 'View wishlist', href: '/dashboard/wishlist' },
          },
        ]
      : []),
    {
      id: 'welcome',
      icon: PartyPopper,
      tone: 'bg-amber-50 text-amber-600',
      title: `Welcome to MlimaLink, ${firstName(user.name)}`,
      body: 'Your account is ready. Explore products from local shops.',
      date: user.createdAt,
      action: { label: 'Browse products', href: '/products' },
    },
  ];

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Updates about your shopping and account."
      />

      <Panel>
        <ul className="divide-y divide-neutral-100">
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
                    {date && (
                      <time
                        dateTime={date}
                        className="text-xs text-neutral-400"
                      >
                        {formatDate(date)}
                      </time>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-neutral-500">{body}</p>
                  {action && (
                    <Link
                      href={action.href}
                      className="mt-2 inline-block text-sm font-medium text-brand-start hover:text-brand-end"
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
