import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { Bike, MapPin, ShieldCheck, Store } from 'lucide-react';
import { ShopDirectory } from '../shared/widgets/shop-directory';

export const metadata: Metadata = {
  title: 'Shops | MlimaLink Shop',
  description:
    'Browse local shops, farms and service providers across Mt Kenya, and have orders delivered by local riders.',
};

const highlights = [
  { icon: MapPin, text: 'Local sellers across Mt Kenya' },
  { icon: Bike, text: 'Delivered by riders in your town' },
  { icon: ShieldCheck, text: 'Confirm delivery with your private code' },
];

export default function ShopsPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-start to-brand-end text-white">
        <div
          aria-hidden
          className="absolute -top-24 -right-16 h-72 w-72 rounded-full bg-white/15 blur-3xl motion-safe:animate-blob"
        />
        <div
          aria-hidden
          className="absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-white/10 blur-3xl motion-safe:animate-blob"
        />
        <div className="relative mx-auto w-[90%] max-w-300 py-12 sm:py-16">
          <p className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide uppercase backdrop-blur">
            <Store size={14} aria-hidden /> Shop local
          </p>
          <h1 className="mt-4 font-poppins text-4xl font-bold tracking-tight sm:text-5xl">
            Shops
          </h1>
          <p className="mt-3 max-w-2xl text-base text-white/85 sm:text-lg">
            Browse shops, farms and service providers near you. Order from any
            of them and a local rider brings it to your door.
          </p>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-white/90">
            {highlights.map(({ icon: Icon, text }) => (
              <li key={text} className="inline-flex items-center gap-2">
                <Icon size={16} aria-hidden />
                {text}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className="mx-auto w-[90%] max-w-300 py-10">
        <Suspense fallback={null}>
          <ShopDirectory />
        </Suspense>

        <section className="mt-14 flex flex-col items-start justify-between gap-6 rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm md:flex-row md:items-center">
          <div>
            <h2 className="font-poppins text-xl font-semibold text-neutral-900">
              Run a shop, farm or service?
            </h2>
            <p className="mt-1 max-w-xl text-neutral-600">
              Open your shop on MlimaLink, list your products and let local
              riders handle delivery.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/become-seller"
              className="rounded-full bg-gradient-to-r from-brand-start to-brand-end px-6 py-3 text-sm font-medium text-white shadow-md transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              Open your shop
            </Link>
            <Link
              href="/rider"
              className="rounded-full border border-neutral-300 px-6 py-3 text-sm font-medium text-neutral-800 transition hover:border-brand-start hover:text-brand-start"
            >
              Deliver with us
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
