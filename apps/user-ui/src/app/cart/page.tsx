'use client';

import { useShopStore } from '../shared/store/shop-store';
import { CartContents } from '../shared/widgets/cart-contents';

export default function CartPage() {
  const { ready, cartCount } = useShopStore();

  if (!ready) return null;

  return (
    <div className="mx-auto w-[90%] max-w-300 py-10">
      <h1 className="font-poppins text-3xl font-semibold text-neutral-900">
        Shopping Cart
      </h1>
      <p className="mb-8 mt-1 text-neutral-500">
        {cartCount} {cartCount === 1 ? 'item' : 'items'} in your cart
      </p>

      <CartContents />
    </div>
  );
}
