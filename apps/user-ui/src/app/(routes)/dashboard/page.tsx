'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Heart,
  KeyRound,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  ShoppingCart,
  type LucideIcon,
} from 'lucide-react';
import {
  USER_QUERY_KEY,
  firstName,
  initials,
  useUser,
} from '../../shared/hooks/use-user';
import { useShopStore } from '../../shared/store/shop-store';
import { logoutUser } from '../../shared/utils/auth-api';

function formatMemberSince(createdAt?: string) {
  if (!createdAt) return '—';
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(createdAt));
}

function StatCard({
  icon: Icon,
  label,
  value,
  href,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  href?: string;
  hint?: string;
}) {
  const content = (
    <>
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
        <Icon size={22} />
      </span>
      <span>
        <span className="block text-sm text-neutral-500">{label}</span>
        <span className="block font-poppins text-2xl font-semibold text-neutral-900">
          {value}
        </span>
        {hint && <span className="block text-xs text-neutral-400">{hint}</span>}
      </span>
    </>
  );
  const className =
    'flex items-center gap-4 rounded-lg border border-neutral-200 bg-white p-5 shadow-sm';

  return href ? (
    <Link
      href={href}
      className={`${className} transition hover:border-brand-start/40 hover:shadow-md`}
    >
      {content}
    </Link>
  ) : (
    <div className={className}>{content}</div>
  );
}

const sideLinkClassName =
  'flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-neutral-700 transition hover:bg-neutral-100 hover:text-brand-start';

export default function DashboardPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isLoading } = useUser();
  const { wishlist, cartCount } = useShopStore();

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: USER_QUERY_KEY });
      queryClient.setQueryData(USER_QUERY_KEY, null);
      router.push('/login');
    },
  });

  if (!user) {
    return (
      <div className="flex justify-center py-24 text-neutral-500">
        <Loader2 className="animate-spin" aria-label="Loading your dashboard" />
      </div>
    );
  }

  const details = [
    { label: 'Full name', value: user.name },
    { label: 'Email', value: user.email },
    {
      label: 'Account type',
      value: user.role
        ? user.role[0].toUpperCase() + user.role.slice(1)
        : 'User',
    },
    { label: 'Member since', value: formatMemberSince(user.createdAt) },
  ];

  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
        Welcome back, {firstName(user.name)}
      </h1>
      <p className="mt-1 text-neutral-500">
        Manage your account and keep track of your shopping.
      </p>

      <div className="mt-8 grid gap-6 lg:grid-cols-4">
        <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 border-b border-neutral-200 pb-5">
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-start font-poppins text-lg font-semibold text-white">
              {initials(user.name)}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-poppins font-semibold text-neutral-900">
                {user.name}
              </span>
              <span className="block truncate text-sm text-neutral-500">
                {user.email}
              </span>
            </span>
          </div>

          <nav aria-label="Dashboard" className="mt-4 space-y-1">
            <span
              aria-current="page"
              className={`${sideLinkClassName} bg-brand-start/10 font-medium text-brand-start`}
            >
              <LayoutDashboard size={18} /> Overview
            </span>
            <Link href="/wishlist" className={sideLinkClassName}>
              <Heart size={18} /> My Wishlist
            </Link>
            <Link href="/cart" className={sideLinkClassName}>
              <ShoppingCart size={18} /> My Cart
            </Link>
            <Link href="/forgot-password" className={sideLinkClassName}>
              <KeyRound size={18} /> Reset Password
            </Link>
            <button
              type="button"
              onClick={() => logoutMutation.mutate()}
              disabled={logoutMutation.isPending}
              className={`${sideLinkClassName} text-rose-600 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-60`}
            >
              <LogOut size={18} />
              {logoutMutation.isPending ? 'Logging out…' : 'Log out'}
            </button>
          </nav>
          {logoutMutation.isError && (
            <p role="alert" className="mt-3 text-sm text-rose-600">
              {logoutMutation.error.message}
            </p>
          )}
        </aside>

        <div className="space-y-6 lg:col-span-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard
              icon={Heart}
              label="Wishlist"
              value={wishlist.length}
              href="/wishlist"
            />
            <StatCard
              icon={ShoppingCart}
              label="Cart items"
              value={cartCount}
              href="/cart"
            />
            <StatCard
              icon={Package}
              label="Orders"
              value={0}
              hint="Order history is coming soon"
            />
          </div>

          <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
            <h2 className="font-poppins text-xl font-semibold text-neutral-900">
              Account details
            </h2>
            <dl className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {details.map((item) => (
                <div key={item.label}>
                  <dt className="text-sm text-neutral-500">{item.label}</dt>
                  <dd className="mt-0.5 font-medium break-words text-neutral-900">
                    {item.value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}
