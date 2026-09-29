'use client';

import Link from 'next/link';
import { PackageSearch, Search, SquarePlus } from 'lucide-react';
import { shopCategories } from '../../../configs/shop-categories';
import {
  EmptyState,
  PageHeader,
  Panel,
  inputClassName,
  primaryButtonClassName,
} from '../../shared/dashboard/ui';

export default function AllProductsPage() {
  return (
    <>
      <PageHeader
        title="All Products"
        description="Manage prices, stock and visibility for everything you sell."
        actions={
          <Link href="/dashboard/create-product" className={primaryButtonClassName}>
            <SquarePlus size={16} /> Create product
          </Link>
        }
      />

      <Panel>
        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_200px_160px]">
          <label className="relative">
            <span className="sr-only">Search products</span>
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              placeholder="Search products"
              className={`${inputClassName} pl-9`}
            />
          </label>
          <label>
            <span className="sr-only">Filter by category</span>
            <select className={inputClassName} defaultValue="">
              <option value="">
                All categories
              </option>
              {shopCategories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by stock</span>
            <select className={inputClassName} defaultValue="all">
              <option value="all">
                Any stock
              </option>
              <option value="in">
                In stock
              </option>
              <option value="low">
                Low stock
              </option>
              <option value="out">
                Out of stock
              </option>
            </select>
          </label>
        </div>

        <EmptyState
          icon={PackageSearch}
          title="No products yet"
          description="Products you create will be listed here, with their price, stock and sales at a glance."
          action={{ label: 'Create your first product', href: '/dashboard/create-product' }}
        />
      </Panel>
    </>
  );
}
