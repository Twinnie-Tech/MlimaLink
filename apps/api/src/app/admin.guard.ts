import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '@org/errors';
import { PrismaService } from './prisma.service';

/** Set by auth-service; these must match its admin cookie, audience and issuer. */
export const ADMIN_ACCESS_TOKEN_COOKIE = 'adminAccessToken';
const ADMIN_AUDIENCE = 'admin';
const TOKEN_ISSUER = 'mlimalink-auth';

export type SignedInAdmin = { id: string; name: string; email: string };
export type AdminRequest = Request & { admin: SignedInAdmin };

/** Returns the admin id from an admin access token, or throws a 401. */
export function verifyAdminAccessToken(token: string | undefined): string {
  const secret = process.env.ADMIN_ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('ADMIN_ACCESS_TOKEN_SECRET must be set in .env');
  }
  if (!token) {
    throw unauthorized('Please log in as an admin to continue.');
  }
  try {
    const payload = jwt.verify(token, secret, {
      audience: ADMIN_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      payload.role !== 'admin'
    ) {
      throw new Error('Malformed token');
    }
    return payload.userId;
  } catch {
    // admin-ui refreshes the session when it sees this 401.
    throw unauthorized('Unauthorized! Token expired or invalid.');
  }
}

function readToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[ADMIN_ACCESS_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/** Lets through signed-in admins and attaches them as `req.admin`. */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const adminId = verifyAdminAccessToken(readToken(req));

    const admin = await this.prisma.admins.findUnique({
      where: { id: adminId },
      select: { id: true, name: true, email: true },
    });
    if (!admin) {
      throw unauthorized('Please log in as an admin to continue.');
    }

    req.admin = admin;
    return true;
  }
}
