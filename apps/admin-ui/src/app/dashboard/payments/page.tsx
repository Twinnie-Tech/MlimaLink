'use client';

import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Bike, Clock, HandCoins, Percent, Wallet } from 'lucide-react';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import {
  ADMIN_KEYS,
  getPayments,
  type ListParams,
} from '../../shared/utils/admin-api';
import {
  Pagination,
  SearchBox,
  Toolbar,
} from '../../shared/dashboard/list-controls';
import { OrdersTable } from '../../shared/dashboard/orders-table';
import {
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  Panel,
  StatCard,
  formatMoney,
} from '../../shared/dashboard/ui';

const SELLER_PERCENT = 100 - PLATFORM_FEE_PERCENT;

export default function PaymentsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const params: ListParams = { search, page };
  const { data, isPending, error } = useQuery({
    queryKey: ADMIN_KEYS.payments(params),
    queryFn: () => getPayments(params),
    placeholderData: keepPreviousData,
  });

  const onSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  return (
    <>
      <PageHeader
        title="Payments"
        description={`MlimaLink keeps ${PLATFORM_FEE_PERCENT}% of each order's goods after discounts; the seller receives ${SELLER_PERCENT}%. Delivery fees go to the rider. Money is settled once an order is delivered.`}
      />

      {isPending ? (
        <Loading label="Loading payments" />
      ) : error ? (
        <ErrorNotice message={error.message} />
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <StatCard
              icon={Percent}
              label={`MlimaLink fees earned (${PLATFORM_FEE_PERCENT}%)`}
              value={formatMoney(data.summary.platformFees)}
              hint="From delivered orders"
              tone="violet"
            />
            <StatCard
              icon={HandCoins}
              label={`Sellers' earnings (${SELLER_PERCENT}%)`}
              value={formatMoney(data.summary.sellerEarnings)}
              hint="From delivered orders"
              tone="emerald"
            />
            <StatCard
              icon={Bike}
              label="Delivery fees to riders"
              value={formatMoney(data.summary.deliveryFees)}
              hint="From delivered orders"
              tone="amber"
            />
            <StatCard
              icon={Clock}
              label="Pending MlimaLink fees"
              value={formatMoney(data.summary.pendingPlatformFees)}
              hint="Orders placed, confirmed or on the way"
            />
            <StatCard
              icon={Wallet}
              label="Pending seller earnings"
              value={formatMoney(data.summary.pendingSellerEarnings)}
              hint="Orders placed, confirmed or on the way"
            />
          </div>

          <Panel
            title="Order payments"
            description="Every order that wasn't cancelled, with how its money is split."
          >
            <Toolbar>
              <SearchBox
                label="Search payments"
                placeholder="Order number, shop or buyer"
                onSearch={onSearch}
              />
            </Toolbar>
            {data.items.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title="No payments found"
                description={
                  search
                    ? 'No order matches that search.'
                    : 'Payments will appear here once shoppers check out.'
                }
              />
            ) : (
              <>
                <OrdersTable label="Order payments" orders={data.items} />
                <Pagination
                  page={data.page}
                  totalPages={data.totalPages}
                  total={data.total}
                  noun="order"
                  onPage={setPage}
                />
              </>
            )}
          </Panel>
        </div>
      )}
    </>
  );
}
