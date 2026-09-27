'use client';

import { useQuery } from '@tanstack/react-query';
import { getLoggedInUser } from '../utils/auth-api';

export const USER_QUERY_KEY = ['user'] as const;

/** The signed-in user (or null), shared by every component through the query cache. */
export function useUser() {
  const { data, isPending } = useQuery({
    queryKey: USER_QUERY_KEY,
    queryFn: getLoggedInUser,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return { user: data ?? null, isLoading: isPending };
}

export function firstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function initials(fullName: string) {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const letters =
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0]?.[0];
  return (letters ?? '?').toUpperCase();
}
