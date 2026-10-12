'use client';

import Link from 'next/link';
import { Heart, MessageCircle, ShoppingCart, UserRound } from 'lucide-react';
import { useUnseenTotal } from '@org/chat-ui';
import { firstName, initials, useUser } from '../hooks/use-user';
import { useShopStore } from '../store/shop-store';
import { refreshUserSession } from '../utils/auth-api';
import { ThemeToggle } from './theme-toggle';

function CountBadge({
  count,
  className,
}: {
  count: number;
  className: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold text-white ${className}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function ProfileLink() {
  const { user, isLoading } = useUser();

  return (
    <Link
      href={user ? '/dashboard' : '/login'}
      aria-label={
        user ? `Your dashboard, signed in as ${user.name}` : 'Sign in'
      }
      aria-busy={isLoading || undefined}
      className="flex items-center gap-2 text-neutral-800 hover:text-brand-start"
    >
      {user ? (
        <span className="flex h-12.5 w-12.5 items-center justify-center rounded-full bg-brand-start font-poppins font-semibold text-white">
          {initials(user.name)}
        </span>
      ) : (
        <span className="flex h-12.5 w-12.5 items-center justify-center rounded-full border-2 border-neutral-200">
          <UserRound />
        </span>
      )}
      <span className="hidden flex-col leading-tight lg:flex">
        <span className="text-sm text-neutral-500">Hello,</span>
        {isLoading ? (
          <span className="mt-1 h-4 w-16 animate-pulse rounded bg-neutral-200" />
        ) : (
          <span className="max-w-32 truncate font-poppins font-semibold">
            {user ? firstName(user.name) : 'Sign In'}
          </span>
        )}
      </span>
    </Link>
  );
}

function InboxLink() {
  const { user } = useUser();
  const unseen = useUnseenTotal({
    account: 'user',
    refreshSession: refreshUserSession,
    enabled: Boolean(user),
  });
  if (!user) return null;

  return (
    <Link
      href="/inbox"
      aria-label={`Messages, ${unseen} unread`}
      className="relative text-neutral-800 hover:text-brand-start"
    >
      <MessageCircle />
      {unseen > 0 && <CountBadge count={unseen} className="bg-brand-start" />}
    </Link>
  );
}

export function HeaderActions() {
  const { wishlist, cartCount } = useShopStore();
  const wishlistCount = wishlist.length;

  return (
    <nav aria-label="Account and shopping" className="flex items-center gap-7">
      <ThemeToggle />

      <ProfileLink />

      <InboxLink />

      <Link
        href="/wishlist"
        aria-label={`Wishlist, ${wishlistCount} ${wishlistCount === 1 ? 'item' : 'items'}`}
        className="relative text-neutral-800 hover:text-rose-600"
      >
        <Heart />
        <CountBadge count={wishlistCount} className="bg-rose-500" />
      </Link>

      <Link
        href="/cart"
        aria-label={`Cart, ${cartCount} ${cartCount === 1 ? 'item' : 'items'}`}
        className="relative text-neutral-800 hover:text-brand-start"
      >
        <ShoppingCart />
        <CountBadge count={cartCount} className="bg-brand-start" />
      </Link>
    </nav>
  );
}

export default HeaderActions;
