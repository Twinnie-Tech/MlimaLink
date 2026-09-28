import type { Metadata } from 'next';
import { BadgeDollarSign } from 'lucide-react';

export const metadata: Metadata = {
  title: 'Become a seller | MlimaLink Shop',
};

/** The seller dashboard is a separate app (seller-ui). */
const sellerUiUrl = (
  process.env.NEXT_PUBLIC_SELLER_UI_URL ?? 'http://localhost:4300'
).replace(/\/+$/, '');

export default function BecomeSellerPage() {
  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <h1 className="mb-8 font-poppins text-3xl font-semibold text-neutral-900">
        Become a seller
      </h1>
      <div className="flex flex-col items-center rounded-xl border border-neutral-200 bg-white px-6 py-16 text-center">
        <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
          <BadgeDollarSign size={30} />
        </span>
        <h2 className="font-poppins text-xl font-semibold text-neutral-900">
          Open your shop on MlimaLink
        </h2>
        <p className="mt-2 max-w-md text-neutral-500">
          Create your seller account, set up your shop and connect your bank to
          start selling to shoppers across MlimaLink.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <a
            href={`${sellerUiUrl}/signup`}
            className="rounded-md bg-brand-start px-6 py-3 font-poppins font-medium text-white transition hover:bg-brand-end"
          >
            Start selling
          </a>
          <a
            href={`${sellerUiUrl}/login`}
            className="rounded-md border border-neutral-300 px-6 py-3 font-poppins font-medium text-neutral-800 transition hover:border-neutral-400"
          >
            Seller login
          </a>
        </div>
      </div>
    </div>
  );
}
