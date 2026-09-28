'use client';

import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { Landmark, ShieldCheck } from 'lucide-react';
import {
  createStripeLink,
  type Seller,
} from '../../../shared/utils/seller-api';
import {
  ServerError,
  submitButtonClassName,
  textLinkClassName,
} from '../../../shared/widgets/auth-form';

export function ConnectBankStep({
  seller,
  onRedirect = (url) => window.location.assign(url),
}: {
  seller: Seller;
  /** Sends the browser to Stripe; replaceable in tests. */
  onRedirect?: (url: string) => void;
}) {
  const connectMutation = useMutation({
    mutationFn: createStripeLink,
    onSuccess: ({ url }) => onRedirect(url),
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-brand-start/10 text-brand-start">
          <Landmark size={22} />
        </span>
        <div>
          <h2 className="font-poppins text-xl font-semibold text-neutral-900">
            Connect your bank to get paid
          </h2>
          <p className="mt-1 text-sm text-neutral-600">
            {seller.shop?.name ?? 'Your shop'} is ready. Connect a bank account
            through Stripe so we can pay out your sales.
          </p>
        </div>
      </div>

      <p className="flex items-center gap-2 rounded-md bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
        <ShieldCheck size={18} className="shrink-0 text-emerald-600" />
        Your bank details go straight to Stripe. MlimaLink never sees or stores
        them.
      </p>

      {seller.stripeId && (
        <p className="text-sm text-neutral-600">
          You&apos;ve already started with Stripe. Continue to finish any
          remaining details.
        </p>
      )}

      <ServerError
        message={connectMutation.isError ? connectMutation.error.message : null}
      />

      <button
        type="button"
        onClick={() => connectMutation.mutate()}
        disabled={connectMutation.isPending || connectMutation.isSuccess}
        className={submitButtonClassName}
      >
        {connectMutation.isPending || connectMutation.isSuccess
          ? 'Opening Stripe…'
          : seller.stripeId
            ? 'Continue with Stripe'
            : 'Connect with Stripe'}
      </button>

      <p className="text-center text-sm">
        <Link href="/" className={textLinkClassName}>
          Skip for now and go to my dashboard
        </Link>
      </p>
    </div>
  );
}
