'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { initials, switchAdmin } from '../hooks/use-admin';
import { logoutAdmin } from '../utils/admin-api';
import { ThemeToggle } from '../widgets/theme-toggle';
import { useDashboardAdmin } from './admin-context';
import { DASHBOARD_HOME, NAV_SECTIONS, type NavItem } from './nav';

function isActive(pathname: string, href: string) {
  return href === DASHBOARD_HOME.href
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
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
    </Link>
  );
}

export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const admin = useDashboardAdmin();
  const pathname = usePathname() ?? '';
  const router = useRouter();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: logoutAdmin,
    onSuccess: async () => {
      await switchAdmin(queryClient, null);
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
        <span
          aria-hidden="true"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-start to-brand-end font-poppins font-semibold text-white"
        >
          {initials(admin.name)}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-poppins text-lg font-semibold text-neutral-900">
            MlimaLink Admin
          </span>
          <span className="block truncate text-xs text-neutral-500">
            {admin.name}
          </span>
        </span>
      </Link>

      <nav
        aria-label="Admin dashboard"
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
                />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-4 border-t border-neutral-200 pt-4">
        <p className="mb-1.5 px-3 text-xs font-medium text-neutral-500">
          Extras
        </p>
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
