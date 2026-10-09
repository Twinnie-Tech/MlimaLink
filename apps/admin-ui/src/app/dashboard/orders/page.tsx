'use client';

import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ListOrdered } from 'lucide-react';
import type { OrderStatus } from '@org/models';
import {
  ADMIN_KEYS,
  listOrders,
  type ListParams,
} from '../../shared/utils/admin-api';
import {
  FilterSelect,
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
} from '../../shared/dashboard/ui';

type StatusFilter = OrderStatus | 'all';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'placed', label: 'Placed' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'out_for_delivery', label: 'Out for delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function OrdersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const params: ListParams = {
    search,
    page,
    ...(status !== 'all' && { status }),
  };
  const { data, isPending, error } = useQuery({
    queryKey: ADMIN_KEYS.orders(params),
    queryFn: () => listOrders(params),
    placeholderData: keepPreviousData,
  });

  const onSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  return (
    <>
      <PageHeader
        title="Orders"
        description="Every order across MlimaLink, newest first."
      />
      <Panel>
        <Toolbar>
          <SearchBox
            label="Search orders"
            placeholder="Order number, shop or buyer"
            onSearch={onSearch}
          />
          <FilterSelect
            label="Order status"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
          />
        </Toolbar>

        {isPending ? (
          <Loading label="Loading orders" />
        ) : error ? (
          <ErrorNotice message={error.message} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={ListOrdered}
            title="No orders found"
            description={
              search || status !== 'all'
                ? 'No order matches these filters.'
                : 'Orders will appear here once shoppers check out.'
            }
          />
        ) : (
          <>
            <OrdersTable label="Orders" orders={data.items} />
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
    </>
  );
}
