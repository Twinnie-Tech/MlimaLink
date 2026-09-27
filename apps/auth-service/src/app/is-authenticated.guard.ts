import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { unauthorized } from '@org/errors';
import {
  ACCESS_TOKEN_COOKIE,
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

/** Lets the request through only with a valid access token, and attaches the user as `req.user`. */
@Injectable()
export class IsAuthenticatedGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const payload = verifyToken(readToken(req, ACCESS_TOKEN_COOKIE), 'access');

    const user = await this.prisma.users.findUnique({
      where: { id: payload.userId },
      select: safeUserSelect,
    });

    if (!user) {
      throw unauthorized('Account not found!');
    }

    req.user = user;
    return true;
  }
}
