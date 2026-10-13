import { readAccessToken, verifyAccessToken } from '@org/utils/auth';
import { prisma } from './prisma';

export interface SignedInAdmin {
  id: string;
  /** When their access token stops working, in milliseconds since the epoch. */
  expiresAt: number;
}

/**
 * The admin signed in on this request, from their cookie or an `Authorization: Bearer`
 * header; null when the token is missing, invalid or the admin no longer exists.
 */
export async function findSignedInAdmin(headers: {
  cookie?: string;
  authorization?: string;
}): Promise<SignedInAdmin | null> {
  const verified = verifyAccessToken(
    readAccessToken(headers, 'admin'),
    'admin',
  );
  if (!verified) return null;
  const admin = await prisma.admins.findUnique({
    where: { id: verified.id },
    select: { id: true },
  });
  return admin ? { id: admin.id, expiresAt: verified.expiresAt } : null;
}
