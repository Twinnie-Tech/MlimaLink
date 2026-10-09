'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { Admin } from '@org/models';
import { getLoggedInAdmin } from '../utils/admin-api';

export const ADMIN_QUERY_KEY = ['admin-session'] as const;

/** Records who is signed in after a login or logout, dropping everything cached for the previous admin. */
export async function switchAdmin(
  queryClient: QueryClient,
  admin: Admin | null,
) {
  await queryClient.cancelQueries();
  queryClient.removeQueries();
  queryClient.setQueryData(ADMIN_QUERY_KEY, admin);
}

/** The signed-in admin (or null), shared by every component through the query cache. */
export function useAdmin() {
  const { data, isPending } = useQuery({
    queryKey: ADMIN_QUERY_KEY,
    queryFn: getLoggedInAdmin,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return { admin: data ?? null, isLoading: isPending };
}

export function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0];
  return (letters ?? '?').toUpperCase();
}
