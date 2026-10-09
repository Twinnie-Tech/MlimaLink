'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  Landmark,
  Loader2,
  Percent,
  Receipt,
  Wallet,
} from 'lucide-react';
import type { Order } from '@org/models';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import { orderStatusLabel } from '@org/models/delivery';
import { createStripeLink } from '../../shared/utils/seller-api';
import { SHOP_ORDERS_KEY, listShopOrders } from '../../shared/utils/orders-api';
import { useDashboardSeller } from '../../shared/dashboard/seller-context';
import { STATUS_TONE } from '../../shared/dashboard/order-card';
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  formatDate,
  formatMoney,
  primaryButtonClassName,
} from '../../shared/dashboard/ui';

const total = (orders: Order[], pick: (order: Order) => number) =>
  orders.reduce((sum, order) => sum + pick(order), 0);

export default function PaymentsPage() {
  const seller = useDashboardSeller();
  const bankConnected = Boolean(seller.stripeId);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ordersQuery = useQuery({
    queryKey: SHOP_ORDERS_KEY,
    queryFn: listShopOrders,
    retry: false,
  });
  const orders = (ordersQuery.data ?? []).filter(
    (order) => order.status !== 'cancelled',
  );
  const delivered = orders.filter((order) => order.status === 'delivered');
  const inProgress = orders.filter((order) => order.status !== 'delivered');

  const connectBank = async () => {
    setConnecting(true);
    setError(null);
    try {
      const { url } = await createStripeLink();
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not start Stripe onboarding.',
      );
      setConnecting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Payments"
        description={`Your earnings and the bank account they're sent to. MlimaLink keeps ${PLATFORM_FEE_PERCENT}% of each order's goods (after discounts); you keep the rest. Delivery fees go to the rider.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Earned"
          value={formatMoney(total(delivered, (order) => order.sellerEarnings))}
          hint="From delivered orders"
          tone="emerald"
        />
        <StatCard
          icon={Clock}
          label="Pending"
          value={formatMoney(
            total(inProgress, (order) => order.sellerEarnings),
          )}
          hint="Orders not delivered yet"
          tone="amber"
        />
        <StatCard
          icon={Percent}
          label={`MlimaLink fees (${PLATFORM_FEE_PERCENT}%)`}
          value={formatMoney(total(delivered, (order) => order.platformFee))}
          hint="On delivered orders"
          tone="violet"
        />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Panel title="Payout account" className="lg:col-span-1">
          {bankConnected ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CircleCheck size={18} /> Bank account connected through Stripe
              </p>
              <p className="text-sm text-neutral-500">
                Payouts are sent automatically to the account you set up with
                Stripe.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-700">
                <CircleAlert size={18} /> Connect a bank account to receive
                payouts
              </p>
              <p className="text-sm text-neutral-500">
                We use Stripe to verify your details and send your earnings
                securely.
              </p>
              <button
                type="button"
                onClick={connectBank}
                disabled={connecting}
                className={primaryButtonClassName}
              >
                <Landmark size={16} />
                {connecting ? 'Opening Stripe…' : 'Connect bank account'}
              </button>
              {error && (
                <p
                  role="alert"
                  className="text-sm text-rose-600 dark:text-rose-400"
                >
                  {error}
                </p>
              )}
            </div>
          )}
        </Panel>

        <Panel
          title="Transactions"
          description="What each order earns you after the MlimaLink fee."
          className="lg:col-span-2"
        >
          {ordersQuery.isPending ? (
            <div
              role="status"
              aria-label="Loading transactions"
              className="flex justify-center py-12"
            >
              <Loader2 className="animate-spin text-blue-600" size={26} />
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              description="Each order will be listed here with the MlimaLink fee and what you receive."
            />
          ) : (
            <div className="-mx-2 overflow-x-auto">
              <table
                aria-label="Transactions"
                className="w-full min-w-[520px] text-left text-sm"
              >
                <thead className="text-xs text-neutral-500 uppercase">
                  <tr>
                    <th className="px-2 py-2 font-medium">Order</th>
                    <th className="px-2 py-2 font-medium">Goods</th>
                    <th className="px-2 py-2 font-medium">
                      Fee ({PLATFORM_FEE_PERCENT}%)
                    </th>
                    <th className="px-2 py-2 font-medium">You receive</th>
                    <th className="px-2 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200">
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td className="px-2 py-2.5">
                        <span className="block font-medium text-neutral-900">
                          {order.number}
                        </span>
                        <span className="text-xs text-neutral-500">
                          {formatDate(order.createdAt)}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-neutral-700">
                        {formatMoney(order.subtotal - order.discount)}
                      </td>
                      <td className="px-2 py-2.5 text-neutral-700">
                        −{formatMoney(order.platformFee)}
                      </td>
                      <td className="px-2 py-2.5 font-medium text-emerald-700">
                        {formatMoney(order.sellerEarnings)}
                      </td>
                      <td className="px-2 py-2.5">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE[order.status]}`}
                        >
                          {orderStatusLabel(order.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </>
  );
}
