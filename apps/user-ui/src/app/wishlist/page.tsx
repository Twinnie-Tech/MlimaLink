'use client';

import { useShopStore } from '../shared/store/shop-store';
import { WishlistGrid } from '../shared/widgets/wishlist-grid';

export default function WishlistPage() {
  const { ready, wishlist } = useShopStore();

  if (!ready) return null;

  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
            My Wishlist
          </h1>
          <p className="mt-1 text-neutral-500">
            {wishlist.length} {wishlist.length === 1 ? 'item' : 'items'} saved
          </p>
        </div>
      </div>

      <WishlistGrid />
    </div>
  );
}
