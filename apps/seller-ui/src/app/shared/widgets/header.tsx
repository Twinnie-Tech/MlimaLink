'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Store } from 'lucide-react';
import {
  SELLER_QUERY_KEY,
  firstName,
  initials,
  useSeller,
} from '../hooks/use-seller';
import { logoutSeller } from '../utils/seller-api';

export function Header() {
  const { seller, isLoading } = useSeller();
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: logoutSeller,
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: SELLER_QUERY_KEY });
      queryClient.setQueryData(SELLER_QUERY_KEY, null);
      router.push('/login');
    },
  });

  return (
    <header className="w-full border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-[90%] max-w-300 items-center justify-between gap-6 py-5">
        <Link href="/" className="flex items-center gap-2">
          <Store className="text-brand-start" size={28} aria-hidden="true" />
          <span className="font-poppins text-2xl font-semibold text-neutral-900">
            MlimaLink{' '}
            <span className="font-normal text-neutral-500">Seller Centre</span>
          </span>
        </Link>

        {isLoading ? null : seller ? (
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-start text-sm font-semibold text-white">
                {initials(seller.name)}
              </span>
              <span className="hidden text-sm sm:block">
                <span className="block text-neutral-500">Hello,</span>
                <span className="block font-semibold text-neutral-900">
                  {firstName(seller.name)}
                </span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className="flex items-center gap-1.5 rounded-md px-3 py-2 text-sm text-neutral-600 transition hover:bg-neutral-100 hover:text-rose-600 disabled:opacity-60"
            >
              <LogOut size={16} />
              {logoutMutation.isPending ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        ) : (
          <nav className="flex items-center gap-3 text-sm">
            <Link
              href="/login"
              className="rounded-md px-3 py-2 font-medium text-neutral-700 transition hover:text-brand-start"
            >
              Login
            </Link>
            <Link
              href="/signup"
              className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white transition hover:bg-neutral-800"
            >
              Start selling
            </Link>
          </nav>
        )}
      </div>
    </header>
  );
}

export default Header;
