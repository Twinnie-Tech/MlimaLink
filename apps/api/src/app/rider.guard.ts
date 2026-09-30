import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { unauthorized } from '@org/errors';
import { PrismaService } from './prisma.service';

/** Set by auth-service; these must match its rider cookie, audience and issuer. */
export const RIDER_ACCESS_TOKEN_COOKIE = 'riderAccessToken';
const RIDER_AUDIENCE = 'rider';
const TOKEN_ISSUER = 'mlimalink-auth';

export const signedInRiderSelect = {
  id: true,
  name: true,
  email: true,
  phone_number: true,
  vehicle: true,
  zones: true,
  available: true,
} as const;

export type SignedInRider = {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  vehicle: string | null;
  zones: string[];
  available: boolean;
};
export type RiderRequest = Request & { rider: SignedInRider };

/** Returns the rider id from a rider access token, or throws a 401. */
export function verifyRiderAccessToken(token: string | undefined): string {
  const secret = process.env.RIDER_ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('RIDER_ACCESS_TOKEN_SECRET must be set in .env');
  }
  if (!token) {
    throw unauthorized('Please log in as a rider to continue.');
  }
  try {
    const payload = jwt.verify(token, secret, {
      audience: RIDER_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      payload.role !== 'rider'
    ) {
      throw new Error('Malformed token');
    }
    return payload.userId;
  } catch {
    // The rider portal refreshes the session when it sees this 401.
    throw unauthorized('Unauthorized! Token expired or invalid.');
  }
}

function readToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[RIDER_ACCESS_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/** Lets through signed-in riders and attaches them as `req.rider`. */
@Injectable()
export class RiderGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RiderRequest>();
    const riderId = verifyRiderAccessToken(readToken(req));

    const rider = await this.prisma.riders.findUnique({
      where: { id: riderId },
      select: signedInRiderSelect,
    });
    if (!rider) {
      throw unauthorized('Please log in as a rider to continue.');
    }

    req.rider = rider;
    return true;
  }
}
