'use client';

import { Mail, MessagesSquare, Search } from 'lucide-react';
import { PageHeader, inputClassName } from '../../shared/dashboard/ui';

export default function InboxPage() {
  return (
    <>
      <PageHeader
        title="Inbox"
        description="Messages from shoppers about your products and orders."
      />

      <div className="grid min-h-[480px] overflow-hidden rounded-xl border border-neutral-200 bg-white md:grid-cols-[300px_1fr]">
        <aside className="border-b border-neutral-200 p-4 md:border-r md:border-b-0">
          <label className="relative block">
            <span className="sr-only">Search conversations</span>
            <Search
              size={16}
              className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-500"
            />
            <input
              type="search"
              placeholder="Search conversations"
              className={`${inputClassName} pl-9`}
            />
          </label>
          <div className="flex flex-col items-center px-4 py-12 text-center">
            <Mail size={28} className="text-neutral-400" />
            <p className="mt-3 text-sm text-neutral-500">
              No conversations yet
            </p>
          </div>
        </aside>

        <section className="flex flex-col items-center justify-center p-8 text-center">
          <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400">
            <MessagesSquare size={26} />
          </span>
          <h2 className="font-poppins text-lg font-semibold text-neutral-900">
            Your inbox is empty
          </h2>
          <p className="mt-1.5 max-w-sm text-sm text-neutral-500">
            When a shopper asks about a product or an order, the conversation
            will open here.
          </p>
        </section>
      </div>
    </>
  );
}
