import {
  readAccessToken,
  verifyAccessToken,
  verifySocketTicket,
  type AccountType,
} from '@org/utils/auth';
import { prisma } from '../prisma';

/** Someone signed in to chat: a shopper, a seller or an admin. */
export interface Participant {
  role: AccountType;
  id: string;
  name: string;
  /** When their access token stops working, in milliseconds since the epoch. */
  expiresAt: number;
}

/** The account's name, or null when it doesn't exist or is suspended. */
export async function findActiveAccount(
  role: AccountType,
  id: string,
): Promise<{ name: string } | null> {
  if (role === 'admin') {
    return prisma.admins.findUnique({ where: { id }, select: { name: true } });
  }
  const select = { name: true, suspended: true } as const;
  const account =
    role === 'user'
      ? await prisma.users.findUnique({ where: { id }, select })
      : await prisma.sellers.findUnique({ where: { id }, select });
  return account && !account.suspended ? { name: account.name } : null;
}

/**
 * The participant signed in as `role` on this request, or null. The token must be valid
 * for that account type, and the account must still exist and not be suspended.
 * WebSocket upgrades from another site pass a socket `ticket` instead of a token.
 */
export async function authenticate(
  role: AccountType,
  headers: { cookie?: string; authorization?: string },
  ticket?: string,
): Promise<Participant | null> {
  const verified =
    ticket !== undefined
      ? verifySocketTicket(ticket, role)
      : verifyAccessToken(readAccessToken(headers, role), role);
  if (!verified) return null;
  const account = await findActiveAccount(role, verified.id);
  return account
    ? {
        role,
        id: verified.id,
        name: account.name,
        expiresAt: verified.expiresAt,
      }
    : null;
}
