'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Menu, ShieldCheck, X } from 'lucide-react';
import { ChatProvider } from '@org/chat-ui';
import { useAdmin } from '../shared/hooks/use-admin';
import { refreshAdminSession } from '../shared/utils/admin-api';
import { DashboardAdminProvider } from '../shared/dashboard/admin-context';
import { Sidebar } from '../shared/dashboard/sidebar';
import { ThemeToggle } from '../shared/widgets/theme-toggle';

/** Admin dashboard: sidebar navigation plus the page, for signed-in admins only. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { admin, isLoading } = useAdmin();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !admin) router.replace('/login');
  }, [isLoading, admin, router]);

  if (!admin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-100 text-neutral-500">
        <Loader2 className="animate-spin" aria-label="Loading the dashboard" />
      </div>
    );
  }

  return (
    <DashboardAdminProvider value={admin}>
      <ChatProvider
        account="admin"
        viewerId={admin.id}
        refreshSession={refreshAdminSession}
        inboxPath="/dashboard/inbox"
      >
        <div className="min-h-screen bg-neutral-100 text-neutral-800">
          <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-neutral-200 bg-[#fff] px-4 py-5 lg:block dark:bg-[#0b0b0f]">
            <Sidebar />
          </aside>

          <div className="sticky top-0 z-20 flex items-center justify-between border-b border-neutral-200 bg-[#fff]/95 px-4 py-3 backdrop-blur lg:hidden dark:bg-[#0b0b0f]/95">
            <span className="flex min-w-0 items-center gap-2">
              <ShieldCheck
                size={20}
                className="shrink-0 text-blue-600 dark:text-blue-400"
                aria-hidden="true"
              />
              <span className="truncate font-poppins font-semibold text-neutral-900">
                MlimaLink Admin
              </span>
            </span>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <button
                type="button"
                onClick={() => setMenuOpen(true)}
                aria-label="Open menu"
                aria-expanded={menuOpen}
                className="rounded-lg p-2 text-neutral-700 hover:bg-neutral-100 dark:hover:bg-white/5"
              >
                <Menu size={22} />
              </button>
            </div>
          </div>

          {menuOpen && (
            <div
              className="fixed inset-0 z-40 lg:hidden"
              role="dialog"
              aria-modal="true"
            >
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="absolute inset-0 bg-black/60"
              />
              <aside className="relative h-full w-72 max-w-[85%] border-r border-neutral-200 bg-[#fff] px-4 py-5 dark:bg-[#0b0b0f]">
                <button
                  type="button"
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close menu"
                  className="absolute top-4 right-3 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-white/5"
                >
                  <X size={20} />
                </button>
                <Sidebar onNavigate={() => setMenuOpen(false)} />
              </aside>
            </div>
          )}

          <main className="px-4 py-8 sm:px-8 lg:ml-64 lg:px-10">
            <div className="mx-auto max-w-6xl">{children}</div>
          </main>
        </div>
      </ChatProvider>
    </DashboardAdminProvider>
  );
}
