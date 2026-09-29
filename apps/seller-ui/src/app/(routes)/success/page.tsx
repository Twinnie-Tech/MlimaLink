'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { CircleCheck } from 'lucide-react';
import { SELLER_QUERY_KEY } from '../../shared/hooks/use-seller';

/** Stripe sends sellers here after bank onboarding. */
export default function StripeSuccessPage() {
  const queryClient = useQueryClient();

  useEffect(() => {
    queryClient.invalidateQueries({ queryKey: SELLER_QUERY_KEY });
  }, [queryClient]);

  return (
    <div className="px-4 py-16">
      <div className="mx-auto max-w-md rounded-lg bg-white p-8 text-center shadow-md">
        <CircleCheck
          size={56}
          className="mx-auto text-emerald-600"
          aria-hidden="true"
        />
        <h1 className="mt-4 font-poppins text-2xl font-semibold text-neutral-900">
          Bank details submitted
        </h1>
        <p className="mt-2 text-neutral-600">
          Stripe is checking your details. Payouts start as soon as they confirm
          your account, usually within a few minutes.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-block rounded-md bg-neutral-900 px-6 py-3 font-poppins font-medium text-white transition hover:bg-neutral-800 dark:text-neutral-100"
        >
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}
