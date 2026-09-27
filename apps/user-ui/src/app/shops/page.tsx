import type { Metadata } from 'next';
import { Store } from 'lucide-react';
import { EmptyState } from '../shared/widgets/empty-state';

export const metadata: Metadata = {
  title: 'Shops | MlimaLink Shop',
};

export default function ShopsPage() {
  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <h1 className="mb-8 font-poppins text-3xl font-semibold text-neutral-900">
        Shops
      </h1>
      <EmptyState
        icon={Store}
        title="Shops are coming soon"
        description="Soon you'll be able to browse stores from sellers across MlimaLink."
      />
    </div>
  );
}
