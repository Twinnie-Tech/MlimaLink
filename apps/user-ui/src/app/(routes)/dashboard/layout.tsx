'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Menu, X } from 'lucide-react';
import { useUser } from '../../shared/hooks/use-user';
import { DashboardUserProvider } from '../../shared/dashboard/user-context';
import { Sidebar } from '../../shared/dashboard/sidebar';
import { ThemeToggle } from '../../shared/widgets/theme-toggle';

/** Account area: a fixed sidebar plus the page, for signed-in shoppers. */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.replace('/login');
  }, [isLoading, user, router]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-neutral-500">
        <Loader2 className="animate-spin" aria-label="Loading your dashboard" />
      </div>
    );
  }

  return (
    <DashboardUserProvider value={user}>
      <div className="min-h-screen">
        <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-neutral-200 bg-white px-4 py-5 lg:block">
          <Sidebar />
        </aside>

        <div className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-neutral-200 bg-white px-4 py-3 lg:hidden">
          <Link
            href="/"
            className="font-poppins text-xl font-semibold text-neutral-900"
          >
            MlimaLink
          </Link>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="Open account menu"
              aria-expanded={menuOpen}
              className="rounded-lg p-2 text-neutral-600 hover:bg-neutral-100"
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
              aria-label="Close account menu"
              onClick={() => setMenuOpen(false)}
              className="absolute inset-0 bg-black/50"
            />
            <aside className="relative h-full w-72 max-w-[85%] bg-white px-4 py-5 shadow-xl">
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close account menu"
                className="absolute top-4 right-3 rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"
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
    </DashboardUserProvider>
  );
}
