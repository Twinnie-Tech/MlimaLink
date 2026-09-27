'use client';

import Link from 'next/link';
import { Heart, ShoppingCart, UserRound } from 'lucide-react';
import { useShopStore } from '../store/shop-store';

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

export function HeaderActions() {
  const { wishlist, cartCount } = useShopStore();
  const wishlistCount = wishlist.length;

  return (
    <nav aria-label="Account and shopping" className="flex items-center gap-7">
      <Link
        href="/login"
        aria-label="Sign in"
        className="flex items-center gap-2 text-neutral-800 hover:text-brand-start"
      >
        <span className="flex h-12.5 w-12.5 items-center justify-center rounded-full border-2 border-neutral-200">
          <UserRound />
        </span>
        <span className="hidden flex-col leading-tight lg:flex">
          <span className="text-sm text-neutral-500">Hello,</span>
          <span className="font-poppins font-semibold">Sign In</span>
        </span>
      </Link>

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
