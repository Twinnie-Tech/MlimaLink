'use client';

import { createContext, useContext } from 'react';
import type { Seller, Shop } from '../utils/seller-api';

/** A seller who has finished shop setup: the only kind the dashboard renders for. */
export type DashboardSeller = Seller & { shop: Shop };

const DashboardSellerContext = createContext<DashboardSeller | null>(null);

export const DashboardSellerProvider = DashboardSellerContext.Provider;

export function useDashboardSeller(): DashboardSeller {
  const seller = useContext(DashboardSellerContext);
  if (!seller) {
    throw new Error(
      'useDashboardSeller must be used inside the dashboard layout',
    );
  }
  return seller;
}
