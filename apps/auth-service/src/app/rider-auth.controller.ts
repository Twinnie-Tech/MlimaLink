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
import type { NextFunction, Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { validationError } from '@org/errors';
import {
  checkOtpRegistration,
  hashPassword,
  sendOtp,
  trackOtp,
  verifyOtp,
} from '../utils/auth.helper';
import { clearAuthCookies, getTokenSecrets } from '../utils/auth-tokens';
import {
  endSessionFromRequest,
  issueAuthCookies,
  rotateAuthSession,
} from '../utils/refresh-sessions';
import {
  safeRiderSelect,
  validateRiderRegistration,
} from '../utils/rider.helper';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterRiderDto, VerifyRiderDto } from './dto/register-rider.dto';
import { IsRiderGuard, type RiderRequest } from './is-rider.guard';
import { PrismaService } from './prisma.service';

@ApiTags('rider auth')
@Controller('auth')
export class RiderAuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register/rider')
  @ApiOperation({ summary: 'Start rider sign-up by emailing an OTP' })
  @ApiBody({ type: RegisterRiderDto })
  async registerRider(
    @Body() body: RegisterRiderDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      validateRiderRegistration(body);

      const { name, email } = body;

      if (await this.prisma.riders.findUnique({ where: { email } })) {
        throw validationError('Rider already exists with this email!');
      }

      await checkOtpRegistration(email, next);
      await trackOtp(email, next);
      await sendOtp(
        name,
        email,
        'rider_registration',
        'Verify your MlimaLink rider account',
      );

      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully. Please check your email.',
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('verify/rider')
  @ApiOperation({
    summary: 'Verify the rider OTP, create the account and sign the rider in',
  })
  @ApiBody({ type: VerifyRiderDto })
  async verifyRider(
    @Body() body: VerifyRiderDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      const { name, email, password, phone_number, otp } = body;

      if (!otp) {
        throw validationError('OTP is required!');
      }

      validateRiderRegistration(body);
      getTokenSecrets('rider');

      if (await this.prisma.riders.findUnique({ where: { email } })) {
        throw validationError('Rider already exists with this email!');
      }

      await verifyOtp(email, otp, next);

      const rider = await this.prisma.riders.create({
        data: {
          name,
          email,
          phone_number,
          password: await hashPassword(password),
        },
        select: safeRiderSelect,
      });

      // Signed in straight away so the rider can fill in their delivery profile.
      await issueAuthCookies(
        res,
        { userId: rider.id, role: 'rider', rememberMe: true },
        'rider',
      );

      return res.status(201).json({
        success: true,
        message: 'Rider verified and registered successfully',
        rider,
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('login/rider')
  @ApiOperation({ summary: 'Login rider with email and password' })
  @ApiBody({ type: LoginUserDto })
  async loginRider(
    @Body() body: LoginUserDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      const { email, password, rememberMe = true } = body;

      if (!email || !password) {
        throw validationError('Email and password are required!');
      }

      getTokenSecrets('rider');

      const found = await this.prisma.riders.findUnique({
        where: { email },
        select: { ...safeRiderSelect, password: true },
      });

      if (!found || !(await bcrypt.compare(password, found.password))) {
        throw validationError('Invalid email or password!');
      }

      const { password: _password, ...rider } = found;

      await issueAuthCookies(
        res,
        { userId: rider.id, role: 'rider', rememberMe },
        'rider',
      );

      return res.status(200).json({
        success: true,
        message: 'Rider logged in successfully',
        rider,
      });
    } catch (error) {
      return next(error);
    }
  }

  @Get('logged-in-rider')
  @UseGuards(IsRiderGuard)
  @ApiOperation({ summary: 'Get the rider for the current token' })
  @ApiCookieAuth('riderAccessToken')
  getLoggedInRider(@Req() req: RiderRequest) {
    return { success: true, rider: req.rider };
  }

  @Post('refresh-token/rider')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Issue new rider tokens from the rider refresh token cookie',
  })
  @ApiCookieAuth('riderRefreshToken')
  async refreshRiderToken(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      await rotateAuthSession(req, res, 'rider', async (id) => {
        const rider = await this.prisma.riders.findUnique({
          where: { id },
          select: { id: true },
        });
        return rider ? 'rider' : null;
      });

      return res
        .status(200)
        .json({ success: true, message: 'Token refreshed' });
    } catch (error) {
      return next(error);
    }
  }

  @Post('logout/rider')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log the rider out and clear the rider cookies' })
  async logoutRider(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await endSessionFromRequest(req, 'rider');
    clearAuthCookies(res, 'rider');
    return { success: true, message: 'Logged out successfully' };
  }
}
