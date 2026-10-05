'use client';

import { useEffect, useRef } from 'react';
import { trackUserActivity } from '../utils/events-api';
import { useUser } from './use-user';

/** Reports one view per page opened by a signed-in shopper. */
function useTrackPageView(
  action: 'shop_visit' | 'product_view',
  id: string | undefined,
) {
  const { user } = useUser();
  const key = user && id ? `${user.id}:${id}` : null;
  // Development mode runs effects twice; this keeps it to one report per page.
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (!key || !id || reported.current === key) return;
    reported.current = key;
    trackUserActivity(
      action === 'shop_visit'
        ? { action, shopId: id }
        : { action, productId: id },
    );
  }, [action, id, key]);
}

export function useTrackShopVisit(shopId: string | undefined) {
  useTrackPageView('shop_visit', shopId);
}

/** Product views feed the shopper's recommendations. */
export function useTrackProductView(productId: string | undefined) {
  useTrackPageView('product_view', productId);
}
