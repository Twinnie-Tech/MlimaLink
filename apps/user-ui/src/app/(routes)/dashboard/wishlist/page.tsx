'use client';

import { useShopStore } from '../../../shared/store/shop-store';
import { WishlistGrid } from '../../../shared/widgets/wishlist-grid';
import { PageHeader } from '../../../shared/dashboard/ui';

export default function DashboardWishlistPage() {
  const { ready, wishlist } = useShopStore();

  return (
    <>
      <PageHeader
        title="Wishlist"
        description={`${wishlist.length} ${wishlist.length === 1 ? 'item' : 'items'} saved`}
      />
      {ready && <WishlistGrid gridClassName="sm:grid-cols-2 xl:grid-cols-3" />}
    </>
  );
}
