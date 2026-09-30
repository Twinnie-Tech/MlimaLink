import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { unauthorized } from '@org/errors';
import {
  RIDER_ACCESS_TOKEN_COOKIE,
  readToken,
  verifyToken,
} from '../utils/auth-tokens';
import { safeRiderSelect, type SafeRider } from '../utils/rider.helper';
import { PrismaService } from './prisma.service';

export type RiderRequest = Request & { rider: SafeRider };

/** Lets the request through only with a valid rider access token, and attaches the rider as `req.rider`. */
@Injectable()
export class IsRiderGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RiderRequest>();
    const payload = verifyToken(
      readToken(req, RIDER_ACCESS_TOKEN_COOKIE),
      'access',
      'rider',
    );

    const rider = await this.prisma.riders.findUnique({
      where: { id: payload.userId },
      select: safeRiderSelect,
    });

    if (!rider) {
      throw unauthorized('Account not found!');
    }

    req.rider = rider;
    return true;
  }
}
