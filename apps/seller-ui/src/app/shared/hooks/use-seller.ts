'use client';

import { useQuery } from '@tanstack/react-query';
import { getLoggedInSeller } from '../utils/seller-api';

export const SELLER_QUERY_KEY = ['seller'] as const;

/** The signed-in seller (or null), shared by every component through the query cache. */
export function useSeller() {
  const { data, isPending } = useQuery({
    queryKey: SELLER_QUERY_KEY,
    queryFn: getLoggedInSeller,
    staleTime: 5 * 60_000,
    retry: false,
  });

  return { seller: data ?? null, isLoading: isPending };
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
