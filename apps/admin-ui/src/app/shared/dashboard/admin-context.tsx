'use client';

import { createContext, useContext } from 'react';
import type { Admin } from '@org/models';

const DashboardAdminContext = createContext<Admin | null>(null);

export const DashboardAdminProvider = DashboardAdminContext.Provider;

export function useDashboardAdmin(): Admin {
  const admin = useContext(DashboardAdminContext);
  if (!admin) {
    throw new Error(
      'useDashboardAdmin must be used inside the dashboard layout',
    );
  }
  return admin;
}
