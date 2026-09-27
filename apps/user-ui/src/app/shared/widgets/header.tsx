import { Suspense } from 'react';
import Link from 'next/link';
import { HeaderActions } from './header-actions';
import { SearchBox, SearchBoxFallback } from './search-box';

export function Header() {
  return (
    <header className="w-full border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-[90%] max-w-300 flex-wrap items-center justify-between gap-x-8 gap-y-4 py-5">
        <div>
          <Link href="/">
            <span className="font-poppins text-3xl font-semibold text-neutral-900">
              MlimaLink
            </span>
          </Link>
        </div>

        <div className="order-last w-full md:order-none md:w-1/2">
          <Suspense fallback={<SearchBoxFallback />}>
            <SearchBox />
          </Suspense>
        </div>

        <HeaderActions />
      </div>
    </header>
  );
}

export default Header;
