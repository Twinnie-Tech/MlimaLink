'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  Bike,
  CircleDollarSign,
  HandCoins,
  Package,
  Percent,
  ShoppingBag,
  Store,
  Users,
} from 'lucide-react';
import type { AdminOverview } from '@org/models';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import { orderStatusLabel } from '@org/models/delivery';
import { ADMIN_KEYS, getOverview } from '../shared/utils/admin-api';
import {
  BarChart,
  CHART_COLORS,
  DonutChart,
  HorizontalBars,
  LineChart,
} from '../shared/dashboard/charts';
import { GLOBE_COLORS, WorldGlobe } from '../shared/dashboard/world-globe';
import {
  Badge,
  DataTable,
  ErrorNotice,
  Loading,
  PageHeader,
  Panel,
  STATUS_TONE,
  StatCard,
  cellClassName,
  formatDate,
  formatMoney,
  formatNumber,
} from '../shared/dashboard/ui';

const SELLER_PERCENT = 100 - PLATFORM_FEE_PERCENT;
const TOP_COUNTRIES = 8;

const compactMoney = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);

function MoneySplit({ totals }: { totals: AdminOverview['totals'] }) {
  return (
    <Panel
      title="Where the money goes"
      description={`On every order MlimaLink keeps ${PLATFORM_FEE_PERCENT}% of the goods (after discounts) and the seller receives ${SELLER_PERCENT}%. Delivery fees go to riders.`}
    >
      <div
        aria-hidden="true"
        className="flex h-4 overflow-hidden rounded-full bg-neutral-100"
      >
        <span
          className="bg-blue-500"
          style={{ width: `${PLATFORM_FEE_PERCENT}%` }}
        />
        <span className="flex-1 bg-emerald-500" />
      </div>
      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <dt className="flex items-center gap-2 text-sm text-neutral-500">
            <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
            MlimaLink fees ({PLATFORM_FEE_PERCENT}%)
          </dt>
          <dd className="mt-1 font-poppins text-xl font-semibold text-neutral-900">
            {formatMoney(totals.platformFees)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-sm text-neutral-500">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Sellers&apos; share ({SELLER_PERCENT}%)
          </dt>
          <dd className="mt-1 font-poppins text-xl font-semibold text-neutral-900">
            {formatMoney(totals.sellerEarnings)}
          </dd>
        </div>
        <div>
          <dt className="flex items-center gap-2 text-sm text-neutral-500">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Delivery fees (riders)
          </dt>
          <dd className="mt-1 font-poppins text-xl font-semibold text-neutral-900">
            {formatMoney(totals.deliveryFees)}
          </dd>
        </div>
      </dl>
    </Panel>
  );
}

export default function AdminDashboardPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ADMIN_KEYS.overview,
    queryFn: getOverview,
  });

  if (isPending) return <Loading label="Loading the dashboard" />;
  if (error) return <ErrorNotice message={error.message} />;

  const { totals, monthly } = data;
  const months = monthly.map((m) => m.label);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="How MlimaLink is doing across shops, shoppers and riders. Money figures leave out cancelled orders."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CircleDollarSign}
          label="Goods sold"
          value={formatMoney(totals.sales)}
          hint="After discounts, before fees"
        />
        <StatCard
          icon={Percent}
          label={`MlimaLink fees (${PLATFORM_FEE_PERCENT}%)`}
          value={formatMoney(totals.platformFees)}
          hint="Your platform revenue"
          tone="violet"
        />
        <StatCard
          icon={HandCoins}
          label={`Sellers' share (${SELLER_PERCENT}%)`}
          value={formatMoney(totals.sellerEarnings)}
          hint="Owed to shops"
          tone="emerald"
        />
        <StatCard
          icon={ShoppingBag}
          label="Orders"
          value={formatNumber(totals.orders)}
          hint="All time, every status"
          tone="amber"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Shoppers"
          value={formatNumber(totals.users)}
        />
        <StatCard
          icon={Store}
          label="Sellers"
          value={formatNumber(totals.sellers)}
          hint={`${formatNumber(totals.shops)} with a shop`}
          tone="emerald"
        />
        <StatCard
          icon={Package}
          label="Products"
          value={formatNumber(totals.products)}
          tone="violet"
        />
        <StatCard
          icon={Bike}
          label="Riders"
          value={formatNumber(totals.riders)}
          tone="amber"
        />
      </div>

      <MoneySplit totals={totals} />

      <div className="grid gap-6 xl:grid-cols-2">
        <Panel
          title="Sales and fees"
          description="Goods sold and MlimaLink's fees over the last 6 months"
        >
          <BarChart
            label="Goods sold and MlimaLink fees per month"
            labels={months}
            format={compactMoney}
            series={[
              {
                name: 'Goods sold',
                color: CHART_COLORS[0],
                values: monthly.map((m) => m.sales),
              },
              {
                name: `MlimaLink fees (${PLATFORM_FEE_PERCENT}%)`,
                color: CHART_COLORS[1],
                values: monthly.map((m) => m.platformFees),
              },
            ]}
          />
        </Panel>
        <Panel
          title="Orders and sign-ups"
          description="New orders, shoppers and sellers over the last 6 months"
        >
          <LineChart
            label="Orders, new shoppers and new sellers per month"
            labels={months}
            series={[
              {
                name: 'Orders',
                color: CHART_COLORS[3],
                values: monthly.map((m) => m.orders),
              },
              {
                name: 'New shoppers',
                color: CHART_COLORS[0],
                values: monthly.map((m) => m.newUsers),
              },
              {
                name: 'New sellers',
                color: CHART_COLORS[2],
                values: monthly.map((m) => m.newSellers),
              },
            ]}
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Accounts" description="Shoppers, sellers and riders">
          <DonutChart
            label="Accounts by type"
            slices={data.accounts}
            centerLabel="Accounts"
          />
        </Panel>
        <Panel
          title="Devices"
          description="Shoppers by the device they last used"
        >
          <DonutChart
            label="Shoppers by device"
            slices={data.devices}
            centerLabel="Shoppers"
          />
        </Panel>
        <Panel
          title="Order status"
          description="Every order by where it is now"
        >
          <DonutChart
            label="Orders by status"
            slices={data.orderStatus}
            centerLabel="Orders"
          />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel
          title="Recent orders"
          className="lg:col-span-2"
          action={
            <Link
              href="/dashboard/orders"
              className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400"
            >
              View all
            </Link>
          }
        >
          {data.recentOrders.length === 0 ? (
            <p className="text-sm text-neutral-500">No orders yet.</p>
          ) : (
            <DataTable
              label="Recent orders"
              columns={[
                'Order',
                'Shop',
                'Total',
                `Fee (${PLATFORM_FEE_PERCENT}%)`,
                'Status',
              ]}
              minWidth={560}
            >
              {data.recentOrders.map((order) => (
                <tr key={order.id}>
                  <td className={cellClassName}>
                    <span className="block font-medium text-neutral-900">
                      {order.number}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {order.buyerName} · {formatDate(order.createdAt)}
                    </span>
                  </td>
                  <td className={cellClassName}>{order.shopName}</td>
                  <td className={cellClassName}>{formatMoney(order.total)}</td>
                  <td className={cellClassName}>
                    {formatMoney(order.platformFee)}
                  </td>
                  <td className={cellClassName}>
                    <Badge tone={STATUS_TONE[order.status]}>
                      {orderStatusLabel(order.status)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </Panel>

        <Panel title="Top shops" description="By goods sold">
          {data.topShops.length === 0 ? (
            <p className="text-sm text-neutral-500">No sales yet.</p>
          ) : (
            <ol className="space-y-3">
              {data.topShops.map((shop, i) => (
                <li key={shop.shopId} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-xs font-semibold text-blue-700">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-neutral-900">
                      {shop.shopName}
                    </span>
                    <span className="text-xs text-neutral-500">
                      {shop.orders} order{shop.orders === 1 ? '' : 's'} · fees{' '}
                      {formatMoney(shop.platformFees)}
                    </span>
                  </span>
                  <span className="text-sm font-medium text-neutral-900">
                    {formatMoney(shop.sales)}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>

      <Panel
        title="Where shoppers and sellers are"
        description="Every shopper and seller. Shoppers count by their profile country, where their orders were delivered, or where they last browsed from, and in Kenya when none is known. Sellers count by the country they signed up in."
      >
        <div className="grid items-center gap-6 lg:grid-cols-5">
          <div
            className="relative overflow-hidden rounded-2xl bg-[#050507] p-4 lg:col-span-3"
            style={{
              backgroundImage:
                'radial-gradient(ellipse at 85% 100%, rgb(255 255 255 / 0.12), transparent 55%)',
            }}
          >
            <WorldGlobe countries={data.countries} />
            <p
              aria-hidden="true"
              className="pointer-events-none absolute right-5 top-4 font-poppins text-sm font-medium italic text-orange-400"
            >
              ↶ drag me
            </p>
            <ul
              aria-hidden="true"
              className="pointer-events-none absolute bottom-4 left-5 flex gap-4 text-xs text-white/80"
            >
              <li className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: GLOBE_COLORS.shoppers }}
                />
                Shoppers
              </li>
              <li className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: GLOBE_COLORS.sellers }}
                />
                Sellers
              </li>
            </ul>
          </div>

          <div className="lg:col-span-2">
            {data.countries.length === 0 ? (
              <p className="text-sm text-neutral-500">
                No countries recorded yet.
              </p>
            ) : (
              <>
                <p className="mb-4 text-sm text-neutral-500">
                  {data.countries.length}{' '}
                  {data.countries.length === 1 ? 'country' : 'countries'}
                  {data.countries.length > TOP_COUNTRIES
                    ? ` · top ${TOP_COUNTRIES} shown`
                    : ''}
                </p>
                <HorizontalBars
                  rows={data.countries.slice(0, TOP_COUNTRIES).map((c) => ({
                    label: countryName(c.country),
                    values: [c.users, c.sellers],
                  }))}
                  series={[
                    { name: 'Shoppers', color: GLOBE_COLORS.shoppers },
                    { name: 'Sellers', color: GLOBE_COLORS.sellers },
                  ]}
                />
              </>
            )}
          </div>
        </div>
      </Panel>
    </div>
  );
}

const regionNames =
  typeof Intl.DisplayNames === 'function'
    ? new Intl.DisplayNames(['en'], { type: 'region' })
    : null;

function countryName(code: string) {
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}
