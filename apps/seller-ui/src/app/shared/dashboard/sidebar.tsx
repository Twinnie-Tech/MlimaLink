'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut, Store } from 'lucide-react';
import { useUnseenTotal } from '@org/chat-ui';
import { formatUnseen } from '@org/models/chat';
import { switchSeller } from '../hooks/use-seller';
import { logoutSeller, refreshSellerSession } from '../utils/seller-api';
import { ThemeToggle } from '../widgets/theme-toggle';
import { DASHBOARD_HOME, NAV_SECTIONS, type NavItem } from './nav';
import { useDashboardSeller } from './seller-context';
import { useUnreadNotifications } from './use-notifications';

function isActive(pathname: string, href: string) {
  return href === DASHBOARD_HOME.href
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
  count = 0,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
  count?: number;
}) {
  const Icon = item.icon;
  const badge = formatUnseen(count);
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] transition ${
        active
          ? 'bg-blue-500/15 text-neutral-900 ring-1 ring-blue-500/30'
          : 'text-neutral-700 hover:bg-neutral-100 dark:hover:bg-white/5 hover:text-neutral-900'
      }`}
    >
      <Icon
        size={18}
        className={
          active ? 'text-blue-600 dark:text-blue-400' : 'text-neutral-500'
        }
        aria-hidden="true"
      />
      {item.label}
      {badge && (
        <span
          aria-label={`${badge} unread`}
          className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-blue-600 px-1.5 text-[11px] font-semibold text-white"
        >
          {badge}
        </span>
      )}
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const seller = useDashboardSeller();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const unseen = useUnseenTotal({
    account: 'seller',
    refreshSession: refreshSellerSession,
  });
  const unreadNotifications = useUnreadNotifications();

  const logoutMutation = useMutation({
    mutationFn: logoutSeller,
    onSuccess: async () => {
      await switchSeller(queryClient, null);
      router.push('/login');
    },
  });

  return (
    <div className="flex h-full flex-col">
      <Link
        href={DASHBOARD_HOME.href}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-lg px-2 py-2 transition hover:bg-neutral-100 dark:hover:bg-white/5"
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-blue-600 dark:text-blue-400">
          <Store size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="block truncate font-poppins text-lg font-semibold text-neutral-900">
            {seller.shop.name}
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {seller.shop.address}
          </span>
        </span>
      </Link>

      <nav
        aria-label="Seller dashboard"
        className="scrollbar-thin mt-5 min-h-0 flex-1 overflow-y-auto pr-1"
      >
        <NavLink
          item={DASHBOARD_HOME}
          active={isActive(pathname, DASHBOARD_HOME.href)}
          onNavigate={onNavigate}
        />
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mt-5">
            <p className="mb-1.5 px-3 text-xs font-medium text-neutral-500">
              {section.title}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => (
                <NavLink
                  key={item.href}
                  item={item}
                  active={isActive(pathname, item.href)}
                  onNavigate={onNavigate}
                  count={
                    item.unseenBadge
                      ? unseen
                      : item.notificationsBadge
                        ? unreadNotifications
                        : 0
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-neutral-200 pt-4">
        <div className="mb-1 flex items-center justify-between px-3 py-1.5">
          <span className="text-sm text-neutral-500">Dark mode</span>
          <ThemeToggle />
        </div>
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] text-neutral-700 transition hover:bg-rose-500/10 hover:text-rose-700 disabled:opacity-60"
        >
          <LogOut size={18} className="text-neutral-500" aria-hidden="true" />
          {logoutMutation.isPending ? 'Logging out…' : 'Logout'}
        </button>
        {logoutMutation.isError && (
          <p
            role="alert"
            className="mt-2 px-3 text-xs text-rose-600 dark:text-rose-400"
          >
            {logoutMutation.error.message}
          </p>
        )}
      </div>
    </div>
  );
}
