'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { rememberReturnTo } from '../utils/return-to';
import { useUser } from './use-user';

/**
 * The signed-in user for pages that need one. Anyone signed out is sent to /login and
 * brought back to this exact page (search params included) afterwards.
 */
export function useRequiredAuth() {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (isLoading || user) return;
    const query = searchParams.toString();
    rememberReturnTo(query ? `${pathname}?${query}` : pathname);
    router.replace('/login');
  }, [isLoading, user, pathname, searchParams, router]);

  return { user, isLoading };
}
