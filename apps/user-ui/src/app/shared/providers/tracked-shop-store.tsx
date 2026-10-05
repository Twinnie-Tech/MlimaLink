'use client';

import { useCallback } from 'react';
import { useUser } from '../hooks/use-user';
import { ShopStoreProvider } from '../store/shop-store';
import { trackUserActivity, type ProductActivity } from '../utils/events-api';

/** The shop store, reporting wishlist and cart changes for signed-in shoppers. */
export function TrackedShopStoreProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useUser();
  const signedIn = Boolean(user);
  const onActivity = useCallback(
    (activity: ProductActivity) => {
      if (signedIn) trackUserActivity(activity);
    },
    [signedIn],
  );

  return (
    <ShopStoreProvider onActivity={onActivity}>{children}</ShopStoreProvider>
  );
}
