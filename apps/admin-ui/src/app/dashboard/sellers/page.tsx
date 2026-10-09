'use client';

import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Store } from 'lucide-react';
import { PLATFORM_FEE_PERCENT } from '@org/models/checkout';
import {
  ADMIN_KEYS,
  listSellers,
  shopUrl,
  type ListParams,
} from '../../shared/utils/admin-api';
import { PersonCell } from '../../shared/dashboard/avatar';
import {
  FilterSelect,
  Pagination,
  SearchBox,
  Toolbar,
} from '../../shared/dashboard/list-controls';
import { SuspendButton } from '../../shared/dashboard/suspend-button';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorNotice,
  Loading,
  PageHeader,
  Panel,
  cellClassName,
  formatDate,
  formatMoney,
} from '../../shared/dashboard/ui';

type StatusFilter = 'all' | 'active' | 'suspended';

const SUSPENDED_FILTER: Record<StatusFilter, boolean | undefined> = {
  all: undefined,
  active: false,
  suspended: true,
};

export default function SellersPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [page, setPage] = useState(1);
  const params: ListParams = {
    search,
    page,
    suspended: SUSPENDED_FILTER[status],
  };
  const { data, isPending, error } = useQuery({
    queryKey: ADMIN_KEYS.sellers(params),
    queryFn: () => listSellers(params),
    placeholderData: keepPreviousData,
  });

  const onSearch = useCallback((value: string) => {
    setSearch(value);
    setPage(1);
  }, []);

  return (
    <>
      <PageHeader
        title="Sellers"
        description={`Sellers and their shops, with what they've earned on delivered orders after the ${PLATFORM_FEE_PERCENT}% MlimaLink fee. Suspended sellers can't sign in or manage their shop.`}
      />
      <Panel>
        <Toolbar>
          <SearchBox
            label="Search sellers"
            placeholder="Search by name, email or shop"
            onSearch={onSearch}
          />
          <FilterSelect
            label="Account status"
            value={status}
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              { value: 'all', label: 'All accounts' },
              { value: 'active', label: 'Active' },
              { value: 'suspended', label: 'Suspended' },
            ]}
          />
        </Toolbar>

        {isPending ? (
          <Loading label="Loading sellers" />
        ) : error ? (
          <ErrorNotice message={error.message} />
        ) : data.items.length === 0 ? (
          <EmptyState
            icon={Store}
            title="No sellers found"
            description={
              search
                ? 'No seller matches that search.'
                : 'Sellers will appear here once they sign up.'
            }
          />
        ) : (
          <>
            <DataTable
              label="Sellers"
              columns={[
                'Seller',
                'Shop',
                'Orders',
                'Earned',
                `Fees (${PLATFORM_FEE_PERCENT}%)`,
                'Status',
                '',
              ]}
              minWidth={820}
            >
              {data.items.map((seller) => (
                <tr key={seller.id}>
                  <td className={cellClassName}>
                    <PersonCell
                      name={seller.name}
                      email={seller.email}
                      src={seller.avatarUrl}
                      detail={`${seller.phone} · ${seller.country} · joined ${formatDate(seller.createdAt)}`}
                    />
                  </td>
                  <td className={cellClassName}>
                    {seller.shop ? (
                      <>
                        <a
                          href={shopUrl(seller.shop.id)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block text-violet-600 hover:underline dark:text-violet-400"
                        >
                          {seller.shop.name}
                        </a>
                        <span className="text-xs text-neutral-500">
                          {seller.payoutsConnected
                            ? 'Payouts connected'
                            : 'No payout account'}
                        </span>
                      </>
                    ) : (
                      <span className="text-neutral-500">No shop yet</span>
                    )}
                  </td>
                  <td className={cellClassName}>{seller.orders}</td>
                  <td className={cellClassName}>
                    {formatMoney(seller.earnings)}
                  </td>
                  <td className={cellClassName}>
                    {formatMoney(seller.platformFees)}
                  </td>
                  <td className={cellClassName}>
                    <Badge
                      tone={
                        seller.suspended
                          ? 'bg-rose-500/10 text-rose-700'
                          : 'bg-emerald-500/10 text-emerald-700'
                      }
                    >
                      {seller.suspended ? 'Suspended' : 'Active'}
                    </Badge>
                  </td>
                  <td className={`${cellClassName} text-right`}>
                    <SuspendButton
                      kind="sellers"
                      id={seller.id}
                      name={seller.name}
                      suspended={seller.suspended}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
            <Pagination
              page={data.page}
              totalPages={data.totalPages}
              total={data.total}
              noun="seller"
              onPage={setPage}
            />
          </>
        )}
      </Panel>
    </>
  );
}
