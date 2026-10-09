'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { ADMIN_KEYS, listAdmins, type ListParams } from '../utils/admin-api';
import { useDashboardAdmin } from './admin-context';
import { PersonCell } from './avatar';
import { Pagination } from './list-controls';
import {
  Badge,
  DataTable,
  EmptyState,
  ErrorNotice,
  Loading,
  cellClassName,
  formatDate,
} from './ui';

/** Admin accounts matching `search`. Give it `key={search}` so a new search starts at page 1. */
export function AdminsList({ search = '' }: { search?: string }) {
  const me = useDashboardAdmin();
  const [page, setPage] = useState(1);
  const params: ListParams = { search, page };
  const { data, isPending, error } = useQuery({
    queryKey: ADMIN_KEYS.admins(params),
    queryFn: () => listAdmins(params),
    placeholderData: keepPreviousData,
  });

  if (isPending) return <Loading label="Loading admins" />;
  if (error) return <ErrorNotice message={error.message} />;
  if (data.items.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="No admins found"
        description="No admin account matches that search."
      />
    );
  }

  return (
    <>
      <DataTable
        label="Admins"
        columns={['Name', 'Role', 'Last sign-in', 'Added']}
        minWidth={620}
      >
        {data.items.map((admin) => (
          <tr key={admin.id}>
            <td className={cellClassName}>
              <PersonCell name={admin.name} email={admin.email} />
            </td>
            <td className={cellClassName}>
              <span className="flex flex-wrap gap-1.5">
                <Badge tone="bg-violet-500/10 text-violet-700">Admin</Badge>
                {admin.id === me.id && (
                  <Badge tone="bg-blue-500/10 text-blue-700">You</Badge>
                )}
              </span>
            </td>
            <td className={cellClassName}>
              {admin.lastLoginAt ? formatDate(admin.lastLoginAt) : 'Never'}
            </td>
            <td className={cellClassName}>{formatDate(admin.createdAt)}</td>
          </tr>
        ))}
      </DataTable>
      <Pagination
        page={data.page}
        totalPages={data.totalPages}
        total={data.total}
        noun="admin"
        onPage={setPage}
      />
    </>
  );
}
