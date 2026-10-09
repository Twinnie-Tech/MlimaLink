'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { getLoggedInSeller, type Seller } from '../utils/seller-api';

export const SELLER_QUERY_KEY = ['seller'] as const;

/**
 * Records who is signed in after a login or logout. Orders, products and stats are cached
 * under keys that don't name the seller, so everything cached for the previous one is dropped.
 */
export async function switchSeller(
  queryClient: QueryClient,
  seller: Seller | null,
) {
  await queryClient.cancelQueries();
  queryClient.removeQueries();
  queryClient.setQueryData(SELLER_QUERY_KEY, seller);
}

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
