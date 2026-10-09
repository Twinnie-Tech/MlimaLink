import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { unauthorized } from '@org/errors';
import {
  ADMIN_ACCESS_TOKEN_COOKIE,
  readToken,
  verifyToken,
} from '../utils/auth-tokens';
import { safeAdminSelect, type SafeAdmin } from '../utils/admin.helper';
import { PrismaService } from './prisma.service';

export type AdminRequest = Request & { admin: SafeAdmin };

/** Lets the request through only with a valid admin access token, and attaches the admin as `req.admin`. */
@Injectable()
export class IsAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AdminRequest>();
    const payload = verifyToken(
      readToken(req, ADMIN_ACCESS_TOKEN_COOKIE),
      'access',
      'admin',
    );

    const admin = await this.prisma.admins.findUnique({
      where: { id: payload.userId },
      select: safeAdminSelect,
    });

    if (!admin) {
      throw unauthorized('Account not found!');
    }

    req.admin = admin;
    return true;
  }
}
