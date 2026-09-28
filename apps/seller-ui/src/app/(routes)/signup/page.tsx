'use client';

import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { SELLER_QUERY_KEY, useSeller } from '../../shared/hooks/use-seller';
import type { Seller } from '../../shared/utils/seller-api';
import { AuthShell, textLinkClassName } from '../../shared/widgets/auth-form';
import { ConnectBankStep } from './steps/connect-bank-step';
import { CreateAccountStep } from './steps/create-account-step';
import { SetupShopStep } from './steps/setup-shop-step';
import { SignupSteps } from './steps/signup-steps';

export default function SellerSignupPage() {
  const { seller, isLoading } = useSeller();
  const queryClient = useQueryClient();

  // Progress lives on the account itself, so a refresh or a return from Stripe resumes here.
  const step = !seller ? 1 : !seller.shop ? 2 : 3;

  const updateSeller = async (next: Seller) => {
    await queryClient.cancelQueries({ queryKey: SELLER_QUERY_KEY });
    queryClient.setQueryData(SELLER_QUERY_KEY, next);
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-24 text-neutral-500">
        <Loader2 className="animate-spin" aria-label="Loading" />
      </div>
    );
  }

  return (
    <AuthShell
      title="Start selling on MlimaLink"
      wide
      subtitle={
        step === 1 ? (
          <>
            Already have a seller account?{' '}
            <Link href="/login" className={textLinkClassName}>
              Login
            </Link>
          </>
        ) : undefined
      }
    >
      <SignupSteps current={step} />

      {!seller ? (
        <CreateAccountStep onVerified={updateSeller} />
      ) : !seller.shop ? (
        <SetupShopStep
          onCreated={(shop) => updateSeller({ ...seller, shop })}
        />
      ) : (
        <ConnectBankStep seller={seller} />
      )}
    </AuthShell>
  );
}
