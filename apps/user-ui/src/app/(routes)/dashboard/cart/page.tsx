'use client';

import { useShopStore } from '../../../shared/store/shop-store';
import { CartContents } from '../../../shared/widgets/cart-contents';
import { PageHeader } from '../../../shared/dashboard/ui';

export default function DashboardCartPage() {
  const { ready, cartCount } = useShopStore();

  return (
    <>
      <PageHeader
        title="Cart"
        description={`${cartCount} ${cartCount === 1 ? 'item' : 'items'} in your cart`}
      />
      {ready && <CartContents layoutClassName="xl:grid-cols-[1fr_300px]" />}
    </>
  );
}
