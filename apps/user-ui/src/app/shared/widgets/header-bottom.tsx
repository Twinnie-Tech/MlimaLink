'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { navItems } from '../../../configs/constants';
import { DepartmentsDropdown } from './departments-dropdown';

function isActive(pathname: string, href: string) {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function HeaderBottom() {
  const pathname = usePathname();

  return (
    <div className="w-full border-t border-neutral-200 bg-white">
      <div className="mx-auto flex w-[90%] max-w-300 flex-col items-stretch md:flex-row md:items-center">
        <DepartmentsDropdown />

        {/* Navigation Links */}
        <nav
          aria-label="Main"
          className="flex flex-1 flex-wrap items-center justify-center gap-x-8 gap-y-2 py-3 md:py-0"
        >
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap font-poppins text-lg font-medium transition hover:text-brand-start ${
                  active ? 'text-brand-start' : 'text-neutral-800'
                }`}
              >
                {item.title}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

export default HeaderBottom;
