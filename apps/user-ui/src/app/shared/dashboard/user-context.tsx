'use client';

import { createContext, useContext } from 'react';
import type { AuthUser } from '../utils/auth-api';

const DashboardUserContext = createContext<AuthUser | null>(null);

export const DashboardUserProvider = DashboardUserContext.Provider;

/** The signed-in user; only available inside the dashboard layout. */
export function useDashboardUser() {
  const user = useContext(DashboardUserContext);
  if (!user) {
    throw new Error('useDashboardUser must be used inside the dashboard layout');
  }
  return user;
}
