'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

export function Header() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const term = query.trim();
    router.push(
      term ? `/products?search=${encodeURIComponent(term)}` : '/products',
    );
  };

  return (
    <header className="w-full border-b border-neutral-200 bg-white">
      <div className="mx-auto flex w-[90%] max-w-300 items-center justify-between gap-6 py-5">
        <div>
          <Link href="/">
            <span className="font-poppins text-3xl font-semibold text-neutral-900">
              MlimaLink
            </span>
          </Link>
        </div>

        <form role="search" onSubmit={handleSubmit} className="relative w-1/2">
          <input
            type="text"
            placeholder="Search for products..."
            aria-label="Search for products"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-13.75 w-full border-[2.5px] border-brand-start px-4 pr-17 font-poppins font-medium outline-none"
          />
          <button
            type="submit"
            aria-label="Search"
            className="absolute right-0 top-0 flex h-13.75 w-15 items-center justify-center bg-brand-start"
          >
            <Search color="#fff" />
          </button>
        </form>
      </div>
    </header>
  );
}

export default Header;
