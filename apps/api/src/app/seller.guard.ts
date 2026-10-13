import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import jwt from 'jsonwebtoken';
import { forbidden, unauthorized } from '@org/errors';
import { PrismaService } from './prisma.service';
import { SUSPENDED_MESSAGE } from './user.guard';

/** Set by auth-service; these must match its seller cookie, audience and issuer. */
export const SELLER_ACCESS_TOKEN_COOKIE = 'sellerAccessToken';
const SELLER_AUDIENCE = 'seller';
const TOKEN_ISSUER = 'mlimalink-auth';

export type SellerShop = { id: string; name: string };
export type SellerRequest = Request & { shop: SellerShop; sellerId: string };

/** Returns the seller id from a seller access token, or throws a 401. */
export function verifySellerAccessToken(token: string | undefined): string {
  const secret = process.env.SELLER_ACCESS_TOKEN_SECRET;
  if (!secret) {
    throw new Error('SELLER_ACCESS_TOKEN_SECRET must be set in .env');
  }
  if (!token) {
    throw unauthorized('Unauthorized! Please log in.');
  }
  try {
    const payload = jwt.verify(token, secret, {
      audience: SELLER_AUDIENCE,
      issuer: TOKEN_ISSUER,
    });
    if (
      typeof payload === 'string' ||
      typeof payload.userId !== 'string' ||
      payload.role !== 'seller'
    ) {
      throw new Error('Malformed token');
    }
    return payload.userId;
  } catch {
    // auth-service's seller UI refreshes the session when it sees this 401.
    throw unauthorized('Unauthorized! Token expired or invalid.');
  }
}

function readToken(req: Request): string | undefined {
  const fromCookie = req.cookies?.[SELLER_ACCESS_TOKEN_COOKIE];
  if (typeof fromCookie === 'string' && fromCookie) return fromCookie;
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

/** Lets through signed-in sellers who have a shop, and attaches the shop as `req.shop` and the seller's id as `req.sellerId`. */
@Injectable()
export class SellerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SellerRequest>();
    const sellerId = verifySellerAccessToken(readToken(req));

    const found = await this.prisma.shops.findUnique({
      where: { sellerId },
      select: { id: true, name: true, seller: { select: { suspended: true } } },
    });
    if (!found) {
      throw forbidden('Set up your shop before adding products.');
    }
    const { seller, ...shop } = found;
    if (seller?.suspended) {
      throw unauthorized(SUSPENDED_MESSAGE);
    }

    req.shop = shop;
    req.sellerId = sellerId;
    return true;
  }
}
