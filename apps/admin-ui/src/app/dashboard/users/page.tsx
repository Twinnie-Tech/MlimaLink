'use client';

import { useCallback, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import {
  ADMIN_KEYS,
  listUsers,
  type ListParams,
} from '../../shared/utils/admin-api';
import { AdminsList } from '../../shared/dashboard/admins-list';
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

type Role = 'user' | 'admin';
type StatusFilter = 'all' | 'active' | 'suspended';

const SUSPENDED_FILTER: Record<StatusFilter, boolean | undefined> = {
  all: undefined,
  active: false,
  suspended: true,
};

function ShoppersTable({
  search,
  status,
}: {
  search: string;
  status: StatusFilter;
}) {
  const [page, setPage] = useState(1);
  const params: ListParams = {
    search,
    page,
    suspended: SUSPENDED_FILTER[status],
  };
  const { data, isPending, error } = useQuery({
    queryKey: ADMIN_KEYS.users(params),
    queryFn: () => listUsers(params),
    placeholderData: keepPreviousData,
  });

  if (isPending) return <Loading label="Loading users" />;
  if (error) return <ErrorNotice message={error.message} />;
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No users found"
        description={
          search || status !== 'all'
            ? 'No shopper matches those filters.'
            : 'Shoppers will appear here once they sign up.'
        }
      />
    );
  }

  return (
    <>
      <DataTable
        label="Users"
        columns={[
          'Name',
          'Role',
          'Country',
          'Orders',
          'Spent',
          'Joined',
          'Status',
          '',
        ]}
        minWidth={820}
      >
        {data.items.map((user) => (
          <tr key={user.id}>
            <td className={cellClassName}>
              <PersonCell
                name={user.name}
                email={user.email}
                src={user.avatarUrl}
              />
            </td>
            <td className={cellClassName}>
              <Badge tone="bg-blue-500/10 text-blue-700">User</Badge>
            </td>
            <td className={cellClassName}>{user.country ?? '—'}</td>
            <td className={cellClassName}>{user.orders}</td>
            <td className={cellClassName}>{formatMoney(user.spent)}</td>
            <td className={cellClassName}>{formatDate(user.createdAt)}</td>
            <td className={cellClassName}>
              <Badge
                tone={
                  user.suspended
                    ? 'bg-rose-500/10 text-rose-700'
                    : 'bg-emerald-500/10 text-emerald-700'
                }
              >
                {user.suspended ? 'Suspended' : 'Active'}
              </Badge>
            </td>
            <td className={`${cellClassName} text-right`}>
              <SuspendButton
                kind="users"
                id={user.id}
                name={user.name}
                suspended={user.suspended}
              />
            </td>
          </tr>
        ))}
      </DataTable>
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        noun="user"
        onPage={setPage}
      />
    </>
  );
}

export default function UsersPage() {
  const [role, setRole] = useState<Role>('user');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const onSearch = useCallback((value: string) => setSearch(value), []);

  return (
    <>
      <PageHeader
        title="Users"
        description={
          role === 'user'
            ? "Shoppers on MlimaLink. Suspended shoppers can't sign in or place orders until you restore them."
            : 'People who can sign in to this dashboard.'
        }
      />
      <Panel>
        <Toolbar>
          <SearchBox
            label="Search users"
            placeholder="Search by name or email"
            onSearch={onSearch}
          />
          <FilterSelect
            label="Role"
            value={role}
            onChange={setRole}
            options={[
              { value: 'user', label: 'Role: User' },
              { value: 'admin', label: 'Role: Admin' },
            ]}
          />
          {role === 'user' && (
            <FilterSelect
              label="Account status"
              value={status}
              onChange={setStatus}
              options={[
                { value: 'all', label: 'All accounts' },
                { value: 'active', label: 'Active' },
                { value: 'suspended', label: 'Suspended' },
              ]}
            />
          )}
        </Toolbar>

        {/* A new filter remounts the table so it starts again at page 1. */}
        {role === 'user' ? (
          <ShoppersTable
            key={`${search}|${status}`}
            search={search}
            status={status}
          />
        ) : (
          <AdminsList key={search} search={search} />
        )}
      </Panel>
    </>
  );
}
