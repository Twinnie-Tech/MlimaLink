import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { forbidden, unauthorized } from '@org/errors';
import {
  ACCESS_TOKEN_COOKIE,
  isRoleAllowed,
  readToken,
  safeUserSelect,
  verifyToken,
} from '../utils/auth-tokens';
import { PrismaService } from './prisma.service';

export type SafeUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: Date;
};

export type AuthenticatedRequest = Request & { user: SafeUser };

/**
 * Lets the request through only with a valid shopper access token, and attaches
 * the user as `req.user`. Seller tokens are refused even if sent here.
 */
@Injectable()
export class IsAuthenticatedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const payload = verifyToken(
      readToken(req, ACCESS_TOKEN_COOKIE),
      'access',
      'user',
    );

    const user = await this.prisma.users.findUnique({
      where: { id: payload.userId },
      select: safeUserSelect,
    });

    if (!user) {
      throw unauthorized('Account not found!');
    }

    // The stored role wins over the token's, so a role change applies immediately.
    if (!isRoleAllowed('user', user.role)) {
      throw forbidden('You do not have access to this resource.');
    }

    req.user = user;
    return true;
  }
}
