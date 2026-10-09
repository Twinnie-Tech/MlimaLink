import type { Prisma } from '@prisma/client';

/** Public admin fields returned to clients (never the password hash). */
export const safeAdminSelect = {
  id: true,
  name: true,
  email: true,
  lastLoginAt: true,
  createdAt: true,
} satisfies Prisma.adminsSelect;

export type SafeAdmin = Prisma.adminsGetPayload<{
  select: typeof safeAdminSelect;
}>;
