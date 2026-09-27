import type { Metadata } from 'next';
import { BadgeDollarSign } from 'lucide-react';
import { EmptyState } from '../shared/widgets/empty-state';

export const metadata: Metadata = {
  title: 'Become a seller | MlimaLink Shop',
};

export default function BecomeSellerPage() {
  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <h1 className="mb-8 font-poppins text-3xl font-semibold text-neutral-900">
        Become a seller
      </h1>
      <EmptyState
        icon={BadgeDollarSign}
        title="Seller sign-up is coming soon"
        description="We're getting ready to welcome sellers. Check back soon to open your own shop."
      />
    </div>
  );
}
