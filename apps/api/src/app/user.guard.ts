import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '@org/errors';
import { PrismaService } from './prisma.service';

/** Set by auth-service; these must match its shopper cookie, audience and issuer. */
export const ACCESS_TOKEN_COOKIE = 'accessToken';
const USER_AUDIENCE = 'user';
const TOKEN_ISSUER = 'mlimalink-auth';

export const SUSPENDED_MESSAGE =
  'This account has been suspended. Please contact MlimaLink support.';

export type SignedInUser = { id: string; name: string; email: string };
export type UserRequest = Request & { user: SignedInUser };

/** Returns the user id from a shopper access token, or throws a 401. */
export function verifyUserAccessToken(token: string | undefined): string {
  const secret = process.env.ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ACCESS_TOKEN_SECRET must be set in .env');
  }
  if (!token) {
    throw unauthorized('Please log in to continue.');
  }
  try {
    const payload = jwt.verify(token, secret, {
      audience: USER_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      payload.role !== 'user'
    ) {
      throw new Error('Malformed token');
    }
    return payload.userId;
  } catch {
    // user-ui refreshes the session when it sees this 401.
    throw unauthorized('Unauthorized! Token expired or invalid.');
  }
}

function readToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/** The signed-in shopper's id on public routes, or undefined for guests and expired sessions. */
export function optionalUserId(req: Request): string | undefined {
  try {
    return verifyUserAccessToken(readToken(req));
  } catch {
    return undefined;
  }
}

/** Lets through signed-in shoppers and attaches them as `req.user`. */
@Injectable()
export class UserGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<UserRequest>();
    const userId = verifyUserAccessToken(readToken(req));

    const found = await this.prisma.users.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, suspended: true },
    });
    if (!found) {
      throw unauthorized('Please log in to continue.');
    }
    const { suspended, ...user } = found;
    if (suspended) {
      throw unauthorized(SUSPENDED_MESSAGE);
    }

    req.user = user;
    return true;
  }
}
