'use client';

import { useState } from 'react';
import {
  CircleAlert,
  CircleCheck,
  Clock,
  Landmark,
  Receipt,
  Wallet,
} from 'lucide-react';
import { createStripeLink } from '../../shared/utils/seller-api';
import { useDashboardSeller } from '../../shared/dashboard/seller-context';
import {
  EmptyState,
  PageHeader,
  Panel,
  StatCard,
  formatMoney,
  primaryButtonClassName,
} from '../../shared/dashboard/ui';

export default function PaymentsPage() {
  const seller = useDashboardSeller();
  const bankConnected = Boolean(seller.stripeId);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        description="Your earnings, upcoming payouts and the bank account they're sent to."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          icon={Wallet}
          label="Available balance"
          value={formatMoney(0)}
          tone="emerald"
        />
        <StatCard
          icon={Clock}
          label="Pending payouts"
          value={formatMoney(0)}
          tone="amber"
        />
        <StatCard
          icon={Landmark}
          label="Paid out to date"
          value={formatMoney(0)}
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

        <Panel title="Transactions" className="lg:col-span-2">
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Sales, refunds and payouts will be listed here once your first order is paid."
          />
        </Panel>
      </div>
    </>
  );
}
