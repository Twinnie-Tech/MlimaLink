import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { unauthorized } from '@org/errors';
import {
  SELLER_ACCESS_TOKEN_COOKIE,
  readToken,
  verifyToken,
} from '../utils/auth-tokens';
import { safeSellerSelect, type SafeSeller } from '../utils/seller.helper';
import { PrismaService } from './prisma.service';

export type SellerRequest = Request & { seller: SafeSeller };

/** Lets the request through only with a valid seller access token, and attaches the seller as `req.seller`. */
@Injectable()
export class IsSellerGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<SellerRequest>();
    // Only tokens signed for sellers pass; shopper tokens fail the audience and secret checks.
    const payload = verifyToken(
      readToken(req, SELLER_ACCESS_TOKEN_COOKIE),
      'access',
      'seller',
    );

    const seller = await this.prisma.sellers.findUnique({
      where: { id: payload.userId },
      select: safeSellerSelect,
    });

    if (!seller) {
      throw unauthorized('Account not found!');
    }

    req.seller = seller;
    return true;
  }
}
