'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search } from 'lucide-react';

export const SEARCH_DEBOUNCE_MS = 300;

const inputClassName =
  'h-13.75 w-full border-[2.5px] border-brand-start px-4 pr-17 font-poppins font-medium outline-none';
const buttonClassName =
  'absolute right-0 top-0 flex h-13.75 w-15 items-center justify-center bg-brand-start';

function productsUrl(term: string) {
  return term ? `/products?search=${encodeURIComponent(term)}` : '/products';
}

/** Live product search: typing filters /products as you go, like the old in-page search. */
export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onProductsPage = pathname === '/products';
  const urlTerm = onProductsPage ? (searchParams.get('search') ?? '') : '';

  const [query, setQuery] = useState(urlTerm);
  // The term the URL was last set to, so typing and navigation don't fight each other.
  const syncedTermRef = useRef(urlTerm);

  useEffect(() => {
    if (urlTerm !== syncedTermRef.current) {
      syncedTermRef.current = urlTerm;
      setQuery(urlTerm);
    }
  }, [urlTerm]);

  const goToResults = useCallback(
    (term: string) => {
      syncedTermRef.current = term;
      if (onProductsPage) {
        router.replace(productsUrl(term), { scroll: false });
      } else {
        router.push(productsUrl(term));
      }
    },
    [onProductsPage, router],
  );

  useEffect(() => {
    const term = query.trim();
    if (term === syncedTermRef.current) return;
    if (!onProductsPage && !term) return;

    const timer = setTimeout(() => goToResults(term), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, onProductsPage, goToResults]);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    goToResults(query.trim());
  };

  return (
    <form role="search" onSubmit={handleSubmit} className="relative w-full">
      <input
        type="text"
        placeholder="Search for products..."
        aria-label="Search for products"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className={inputClassName}
      />
      <button type="submit" aria-label="Search" className={buttonClassName}>
        <Search color="#fff" />
      </button>
    </form>
  );
}

/** Same look as SearchBox, rendered while search params are unavailable during prerender. */
export function SearchBoxFallback() {
  return (
    <div className="relative w-full">
      <input
        type="text"
        placeholder="Search for products..."
        aria-label="Search for products"
        readOnly
        className={inputClassName}
      />
      <span aria-hidden="true" className={buttonClassName}>
        <Search color="#fff" />
      </span>
    </div>
  );
}

export default SearchBox;
