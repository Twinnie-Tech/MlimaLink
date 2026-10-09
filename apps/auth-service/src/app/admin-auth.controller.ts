import {
  Body,
  Controller,
  Get,
  HttpCode,
  Next,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBody, ApiCookieAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { NextFunction, Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { validationError } from '@org/errors';
import { clearAuthCookies, getTokenSecrets } from '../utils/auth-tokens';
import { safeAdminSelect } from '../utils/admin.helper';
import {
  endSessionFromRequest,
  issueAuthCookies,
  rotateAuthSession,
} from '../utils/refresh-sessions';
import { LoginUserDto } from './dto/login-user.dto';
import { IsAdminGuard, type AdminRequest } from './is-admin.guard';
import { PrismaService } from './prisma.service';

/** There is no admin sign-up; accounts are created with `npm run admin:create`. */
@ApiTags('admin auth')
@Controller('auth')
export class AdminAuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('login/admin')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Login admin with email and password' })
  @ApiBody({ type: LoginUserDto })
  async loginAdmin(
    @Body() body: LoginUserDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      // Admin sessions end when the browser closes unless they ask to be remembered.
      const { email, password, rememberMe = false } = body;

      if (!email || !password) {
        throw validationError('Email and password are required!');
      }

      getTokenSecrets('admin');

      const found = await this.prisma.admins.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: { ...safeAdminSelect, password: true },
      });

      if (!found || !(await bcrypt.compare(password, found.password))) {
        throw validationError('Invalid email or password!');
      }

      const admin = await this.prisma.admins.update({
        where: { id: found.id },
        data: { lastLoginAt: new Date() },
        select: safeAdminSelect,
      });

      await issueAuthCookies(
        res,
        { userId: admin.id, role: 'admin', rememberMe },
        'admin',
      );

      return res.status(200).json({
        success: true,
        message: 'Admin logged in successfully',
        admin,
      });
    } catch (error) {
      return next(error);
    }
  }

  @Get('logged-in-admin')
  @UseGuards(IsAdminGuard)
  @ApiOperation({ summary: 'Get the admin for the current token' })
  @ApiCookieAuth('adminAccessToken')
  getLoggedInAdmin(@Req() req: AdminRequest) {
    return { success: true, admin: req.admin };
  }

  @Post('refresh-token/admin')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Issue new admin tokens from the admin refresh token cookie',
  })
  @ApiCookieAuth('adminRefreshToken')
  async refreshAdminToken(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      await rotateAuthSession(req, res, 'admin', async (id) => {
        const admin = await this.prisma.admins.findUnique({
          where: { id },
          select: { id: true },
        });
        return admin ? 'admin' : null;
      });

      return res
        .status(200)
        .json({ success: true, message: 'Token refreshed' });
    } catch (error) {
      return next(error);
    }
  }

  @Post('logout/admin')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log the admin out and clear the admin cookies' })
  async logoutAdmin(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await endSessionFromRequest(req, 'admin');
    clearAuthCookies(res, 'admin');
    return { success: true, message: 'Logged out successfully' };
  }
}
