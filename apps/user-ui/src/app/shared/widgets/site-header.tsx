'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

/** The account dashboard has its own sidebar, so the shop header is left out there. */
export function SiteHeader({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const inDashboard =
    pathname === '/dashboard' || pathname.startsWith('/dashboard/');
  return inDashboard ? null : children;
}
