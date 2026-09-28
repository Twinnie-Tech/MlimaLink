'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  CircleCheck,
  CircleAlert,
  Landmark,
  Loader2,
  Package,
  Store,
} from 'lucide-react';
import { findCountry } from '../configs/countries';
import { firstName, useSeller } from './shared/hooks/use-seller';
import type { Seller, Shop } from './shared/utils/seller-api';

const primaryButtonClassName =
  'inline-block rounded-md bg-neutral-900 px-5 py-2.5 font-poppins font-medium text-white transition hover:bg-neutral-800';
const secondaryButtonClassName =
  'inline-block rounded-md border border-neutral-300 bg-white px-5 py-2.5 font-poppins font-medium text-neutral-800 transition hover:border-neutral-400';

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
      <h2 className="font-poppins text-xl font-semibold text-neutral-900">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Details({ items }: { items: { label: string; value: string }[] }) {
  return (
    <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="text-sm text-neutral-500">{item.label}</dt>
          <dd className="mt-0.5 font-medium break-words text-neutral-900">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Welcome() {
  return (
    <div className="mx-auto w-[90%] max-w-300 py-20 text-center">
      <Store
        size={48}
        className="mx-auto text-brand-start"
        aria-hidden="true"
      />
      <h1 className="mt-4 font-poppins text-4xl font-semibold text-neutral-900">
        Sell to shoppers across MlimaLink
      </h1>
      <p className="mx-auto mt-3 max-w-xl text-neutral-600">
        Open your shop in three steps: create your account, set up your shop and
        connect your bank to get paid.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Link href="/signup" className={primaryButtonClassName}>
          Start selling
        </Link>
        <Link href="/login" className={secondaryButtonClassName}>
          Login
        </Link>
      </div>
    </div>
  );
}

function ShopCard({ shop }: { shop: Shop }) {
  return (
    <Card title={shop.name}>
      {shop.bio && <p className="mb-4 text-neutral-600">{shop.bio}</p>}
      <Details
        items={[
          { label: 'Category', value: shop.category },
          { label: 'Address', value: shop.address },
          { label: 'Opening hours', value: shop.opening_hours ?? '—' },
          { label: 'Website', value: shop.website ?? '—' },
        ]}
      />
    </Card>
  );
}

function PayoutsCard({ seller }: { seller: Seller }) {
  return (
    <Card title="Payouts">
      {seller.stripeId ? (
        <p className="flex items-center gap-2 text-emerald-700">
          <CircleCheck size={20} /> Bank account connected through Stripe
        </p>
      ) : (
        <div className="space-y-4">
          <p className="flex items-center gap-2 text-amber-700">
            <CircleAlert size={20} /> Connect a bank account to receive payouts
          </p>
          <Link href="/signup" className={primaryButtonClassName}>
            <span className="flex items-center gap-2">
              <Landmark size={18} /> Connect bank
            </span>
          </Link>
        </div>
      )}
    </Card>
  );
}

export default function SellerDashboardPage() {
  const { seller, isLoading } = useSeller();

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-neutral-500">
        <Loader2 className="animate-spin" aria-label="Loading" />
      </div>
    );
  }

  if (!seller) return <Welcome />;

  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
        Welcome back, {firstName(seller.name)}
      </h1>
      <p className="mt-1 text-neutral-500">Manage your shop on MlimaLink.</p>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {seller.shop ? (
            <ShopCard shop={seller.shop} />
          ) : (
            <Card title="Finish setting up your shop">
              <p className="mb-4 text-neutral-600">
                Add your shop details so shoppers can find you.
              </p>
              <Link href="/signup" className={primaryButtonClassName}>
                Set up shop
              </Link>
            </Card>
          )}

          <Card title="Products">
            <p className="flex items-center gap-2 text-neutral-600">
              <Package size={20} className="text-neutral-400" />
              Adding products is coming next. They&apos;ll show up in the
              MlimaLink store for shoppers.
            </p>
          </Card>
        </div>

        <div className="space-y-6">
          <PayoutsCard seller={seller} />
          <Card title="Account">
            <Details
              items={[
                { label: 'Name', value: seller.name },
                { label: 'Email', value: seller.email },
                { label: 'Phone', value: seller.phone_number },
                {
                  label: 'Country',
                  value: findCountry(seller.country)?.name ?? seller.country,
                },
              ]}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
