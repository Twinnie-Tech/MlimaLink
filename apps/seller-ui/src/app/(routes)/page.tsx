'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Loader2, Store } from 'lucide-react';
import { useSeller } from '../shared/hooks/use-seller';

const primaryButtonClassName =
  'inline-block rounded-md bg-neutral-900 px-5 py-2.5 font-poppins font-medium text-white transition hover:bg-neutral-800 dark:text-neutral-100';
const secondaryButtonClassName =
  'inline-block rounded-md border border-neutral-300 bg-white px-5 py-2.5 font-poppins font-medium text-neutral-800 transition hover:border-neutral-400';

/** Landing page for visitors; signed-in sellers go straight to their dashboard. */
export default function SellerLandingPage() {
  const { seller, isLoading } = useSeller();
  const router = useRouter();

  useEffect(() => {
    if (seller) router.replace(seller.shop ? '/dashboard' : '/signup');
  }, [seller, router]);

  if (isLoading || seller) {
    return (
      <div className="flex justify-center py-24 text-neutral-500">
        <Loader2 className="animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <div className="mx-auto w-[90%] max-w-300 py-20 text-center">
      <Store size={48} className="mx-auto text-brand-start" aria-hidden="true" />
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
