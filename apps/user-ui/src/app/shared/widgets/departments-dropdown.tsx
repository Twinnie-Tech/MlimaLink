'use client';

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, TextAlignStart } from 'lucide-react';
import { useCategories } from '@org/shop-data';

function departmentHref(category: string) {
  return `/products?category=${encodeURIComponent(category)}`;
}

export function DepartmentsDropdown() {
  const [show, setShow] = useState(false);
  const { categories, loading, error } = useCategories();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!show) return;

    const handlePointerDown = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setShow(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setShow(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [show]);

  const close = () => setShow(false);

  return (
    <div ref={containerRef} className="relative w-full md:w-65">
      {/* All Dropdowns */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setShow((open) => !open)}
        aria-expanded={show}
        aria-controls={menuId}
        className="flex h-12.5 w-full items-center justify-between bg-brand-start px-5 text-white"
      >
        <span className="flex items-center gap-2">
          <TextAlignStart size={20} />
          <span className="font-poppins font-medium">All Departments</span>
        </span>
        <ChevronDown
          size={20}
          className={`transition-transform duration-200 ${show ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Dropdown menu */}
      {show && (
        <div
          id={menuId}
          className="absolute left-0 top-full z-50 w-full border border-t-0 border-neutral-200 bg-white py-2 shadow-lg"
        >
          {loading ? (
            <p className="px-5 py-3 text-sm text-neutral-500">
              Loading departments…
            </p>
          ) : error ? (
            <p className="px-5 py-3 text-sm text-rose-600">
              Couldn&apos;t load departments.
            </p>
          ) : (
            <ul>
              <li>
                <Link
                  href="/products"
                  onClick={close}
                  className="block px-5 py-2.5 font-medium text-neutral-800 transition hover:bg-brand-start/10 hover:text-brand-start"
                >
                  All Products
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category}>
                  <Link
                    href={departmentHref(category)}
                    onClick={close}
                    className="block px-5 py-2.5 text-neutral-700 transition hover:bg-brand-start/10 hover:text-brand-start"
                  >
                    {category}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default DepartmentsDropdown;
