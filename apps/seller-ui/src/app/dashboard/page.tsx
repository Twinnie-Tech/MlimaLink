'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  CalendarPlus,
  Circle,
  CircleAlert,
  CircleCheck,
  ListOrdered,
  Package,
  Settings,
  SquarePlus,
  Star,
  TicketPercent,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { orderStatusLabel } from '@org/models/delivery';
import { formatOpeningHours } from '@org/models/opening-hours';
import { STATUS_TONE } from '../shared/dashboard/order-card';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import { SHOP_ORDERS_KEY, listShopOrders } from '../shared/utils/orders-api';
import { firstName } from '../shared/hooks/use-seller';
import { useDashboardSeller } from '../shared/dashboard/seller-context';
import {
  DetailList,
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  formatDate,
  formatMoney,
  primaryButtonClassName,
} from '../shared/dashboard/ui';

type ChecklistItem = {
  label: string;
  done: boolean;
  href?: string;
  cta?: string;
};

function Checklist({ items }: { items: ChecklistItem[] }) {
  const done = items.filter((item) => item.done).length;
  const percent = Math.round((done / items.length) * 100);

  return (
    <Panel
      title="Get your shop selling"
      description={`${done} of ${items.length} steps complete`}
    >
      <div
        className="mb-5 h-2 overflow-hidden rounded-full bg-neutral-200"
        role="progressbar"
        aria-label="Shop setup progress"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-brand-start to-brand-end"
          style={{ width: `${percent}%` }}
        />
      </div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-center justify-between gap-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3"
          >
            <span className="flex items-center gap-3 text-sm">
              {item.done ? (
                <CircleCheck
                  size={20}
                  className="text-emerald-600 dark:text-emerald-400"
                />
              ) : (
                <Circle size={20} className="text-neutral-400" />
              )}
              <span
                className={
                  item.done
                    ? 'text-neutral-500 line-through'
                    : 'text-neutral-900'
                }
              >
                {item.label}
              </span>
            </span>
            {!item.done && item.href && (
              <Link
                href={item.href}
                className="flex shrink-0 items-center gap-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
              >
                {item.cta} <ArrowRight size={14} />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

const quickActions: { label: string; href: string; icon: LucideIcon }[] = [
  {
    label: 'Create product',
    href: '/dashboard/create-product',
    icon: SquarePlus,
  },
  {
    label: 'Create event',
    href: '/dashboard/create-event',
    icon: CalendarPlus,
  },
  {
    label: 'Discount code',
    href: '/dashboard/discount-codes',
    icon: TicketPercent,
  },
  { label: 'Shop settings', href: '/dashboard/settings', icon: Settings },
];

export default function SellerDashboardPage() {
  const seller = useDashboardSeller();
  const { shop } = seller;
  const bankConnected = Boolean(seller.stripeId);
  const orders =
    useQuery({
      queryKey: SHOP_ORDERS_KEY,
      queryFn: listShopOrders,
      retry: false,
    }).data ?? [];
  const toConfirm = orders.filter((order) => order.status === 'placed').length;
  const delivered = orders.filter((order) => order.status === 'delivered');
  const earnings = delivered.reduce(
    (sum, order) => sum + order.sellerEarnings,
    0,
  );
  const fees = delivered.reduce((sum, order) => sum + order.platformFee, 0);

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName(seller.name)}`}
        description={`Here's how ${shop.name} is doing today.`}
        actions={
          <Link
            href="/dashboard/create-product"
            className={primaryButtonClassName}
          >
            <SquarePlus size={16} /> Create product
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingUp}
          label="Your earnings"
          value={formatMoney(earnings)}
          hint={
            delivered.length > 0
              ? `From delivered orders, after the ${formatMoney(fees)} MlimaLink fee (${PLATFORM_FEE_PERCENT}%)`
              : 'No sales yet'
          }
          tone="emerald"
        />
        <StatCard
          icon={ListOrdered}
          label="Orders"
          value={String(orders.length)}
          hint={
            toConfirm > 0
              ? `${toConfirm} waiting for you to confirm`
              : 'Orders appear here as they come in'
          }
        />
        <StatCard
          icon={Package}
          label="Products"
          value="0"
          hint="Post your first product"
          tone="violet"
        />
        <StatCard
          icon={Star}
          label="Shop rating"
          value={shop.ratings.toFixed(1)}
          hint={shop.ratings > 0 ? 'Average from reviews' : 'No reviews yet'}
          tone="amber"
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Checklist
            items={[
              { label: 'Create your seller account', done: true },
              { label: `Set up ${shop.name}`, done: true },
              {
                label: 'Connect your bank to get paid',
                done: bankConnected,
                href: '/dashboard/payments',
                cta: 'Connect',
              },
              {
                label: 'Post your first product',
                done: false,
                href: '/dashboard/create-product',
                cta: 'Add product',
              },
              {
                label: 'Run your first event or discount',
                done: false,
                href: '/dashboard/create-event',
                cta: 'Create event',
              },
            ]}
          />

          <Panel
            title="Recent orders"
            action={
              <Link
                href="/dashboard/orders"
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
              >
                View all
              </Link>
            }
          >
            {orders.length === 0 ? (
              <EmptyState
                icon={ListOrdered}
                title="No orders yet"
                description="When shoppers buy from your shop, their orders will show up here."
              />
            ) : (
              <ul
                className="divide-y divide-neutral-200"
                aria-label="Recent orders"
              >
                {orders.slice(0, 5).map((order) => (
                  <li
                    key={order.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Link
                      href="/dashboard/orders"
                      className="min-w-0 hover:text-blue-600"
                    >
                      <span className="block font-medium text-neutral-900">
                        {order.number} · {order.buyerName}
                      </span>
                      <span className="block text-xs text-neutral-500">
                        {formatDate(order.createdAt)} ·{' '}
                        {formatMoney(order.total)}
                      </span>
                    </Link>
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[order.status]}`}
                    >
                      {orderStatusLabel(order.status)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Quick actions">
            <div className="grid grid-cols-2 gap-3">
              {quickActions.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm font-medium text-neutral-800 transition hover:border-blue-500/40 hover:bg-blue-500/5"
                >
                  <Icon
                    size={20}
                    className="text-blue-600 dark:text-blue-400"
                  />
                  {label}
                </Link>
              ))}
            </div>
          </Panel>

          <Panel title="Payouts">
            {bankConnected ? (
              <p className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CircleCheck size={18} /> Bank account connected through Stripe
              </p>
            ) : (
              <div className="space-y-4">
                <p className="flex items-center gap-2 text-sm text-amber-700">
                  <CircleAlert size={18} /> Connect a bank account to receive
                  payouts
                </p>
                <Link
                  href="/dashboard/payments"
                  className={primaryButtonClassName}
                >
                  Connect bank
                </Link>
              </div>
            )}
          </Panel>

          <Panel
            title="Shop profile"
            action={
              <Link
                href="/dashboard/settings"
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700"
              >
                Settings
              </Link>
            }
          >
            <h3 className="font-poppins text-lg font-semibold text-neutral-900">
              {shop.name}
            </h3>
            {shop.bio && (
              <p className="mt-1 text-sm text-neutral-500">{shop.bio}</p>
            )}
            <div className="mt-4">
              <DetailList
                columns={1}
                items={[
                  { label: 'Category', value: shop.category },
                  { label: 'Open since', value: formatDate(shop.createdAt) },
                  { label: 'Address', value: shop.address },
                  {
                    label: 'Opening hours',
                    value:
                      formatOpeningHours(shop.opening_hours).join('\n') || '—',
                  },
                ]}
              />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}
