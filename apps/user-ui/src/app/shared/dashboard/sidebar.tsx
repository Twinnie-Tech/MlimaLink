'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { USER_QUERY_KEY, initials } from '../hooks/use-user';
import { useShopStore } from '../store/shop-store';
import { logoutUser } from '../utils/auth-api';
import { ThemeToggle } from '../widgets/theme-toggle';
import { DASHBOARD_HOME, NAV_SECTIONS, type NavItem } from './nav';
import { useDashboardUser } from './user-context';

function isActive(pathname: string, href: string) {
  return href === DASHBOARD_HOME.href
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  count,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  count?: number;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition ${
        active
          ? 'bg-brand-start/10 font-medium text-brand-start ring-1 ring-brand-start/20'
          : 'text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900'
      }`}
    >
      <Icon
        size={18}
        className={active ? 'text-brand-start' : 'text-neutral-400'}
        aria-hidden="true"
      />
      <span className="flex-1">{item.label}</span>
      {count ? (
        <span
          aria-label={`${count} ${count === 1 ? 'item' : 'items'}`}
          className={`min-w-6 rounded-full px-2 py-0.5 text-center text-xs font-semibold ${
            active ? 'bg-brand-start text-white' : 'bg-neutral-100 text-neutral-600'
          }`}
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const user = useDashboardUser();
  const { wishlist, cartCount } = useShopStore();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: logoutUser,
    onSuccess: async () => {
      await queryClient.cancelQueries({ queryKey: USER_QUERY_KEY });
      queryClient.setQueryData(USER_QUERY_KEY, null);
      router.push('/login');
    },
  });

  const counts = { wishlist: wishlist.length, cart: cartCount };

  return (
    <div className="flex h-full flex-col">
      <Link
        href="/"
        onClick={onNavigate}
        className="mb-4 px-2 font-poppins text-2xl font-semibold text-neutral-900"
      >
        MlimaLink
      </Link>
      <Link
        href={DASHBOARD_HOME.href}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-lg border border-neutral-200 px-2 py-2 transition hover:bg-neutral-50"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-start to-brand-end font-poppins font-semibold text-white">
          {initials(user.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-poppins text-base font-semibold text-neutral-900">
            {user.name}
          </span>
          <span className="block truncate text-xs text-neutral-500">{user.email}</span>
        </span>
      </Link>

      <nav
        aria-label="My account"
        className="scrollbar-thin mt-5 min-h-0 flex-1 overflow-y-auto pr-1"
      >
        <NavLink
          item={DASHBOARD_HOME}
          active={isActive(pathname, DASHBOARD_HOME.href)}
          onNavigate={onNavigate}
        />
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mt-5">
            <p className="mb-1.5 px-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  count={item.badge && counts[item.badge]}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-neutral-200 pt-4">
        <div className="mb-1 flex items-center justify-between px-3 py-1.5">
          <span className="text-sm text-neutral-600">Dark mode</span>
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-rose-600 transition hover:bg-rose-50 disabled:opacity-60"
        >
          <LogOut size={18} aria-hidden="true" />
          {logoutMutation.isPending ? 'Logging out…' : 'Log out'}
        </button>
        {logoutMutation.isError && (
          <p role="alert" className="mt-2 px-3 text-xs text-rose-600">
            {logoutMutation.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
