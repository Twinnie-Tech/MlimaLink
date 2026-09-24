import { Body, Controller, Get, Next, Post, Req, Res } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import {
  checkOtpRegistration,
  handleForgotPassword,
  handleResetPassword,
  hashPassword,
  renderResetPasswordPage,
  sendAccountCreatedEmail,
  sendOtp,
  trackOtp,
  validateRegistrationData,
  verifyOtp,
} from '../utils/auth.helper';
import { authCookieOptions, setCookie } from '../utils/setCookie';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterUserDto } from './dto/register-user.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { VerifyUserDto } from './dto/verify-user.dto';
import { PrismaService } from './prisma.service';
import { validationError } from '@org/errors';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register/user')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({ type: RegisterUserDto })
  async userRegistration(
    @Body() body: RegisterUserDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      validateRegistrationData(body, 'user');

      const { name, email } = body;

      const existingUser = await this.prisma.users.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw validationError('User already exists with this email!');
      }

      await checkOtpRegistration(email, next);
      await trackOtp(email, next);
      await sendOtp(name, email, 'user_registration');

      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully. Please check your email.',
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('verify/user')
  @ApiOperation({ summary: 'Verify user registration OTP and create account' })
  @ApiBody({ type: VerifyUserDto })
  async verifyUser(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      const { name, email, password, otp } = req.body as VerifyUserDto;

      if (!name || !email || !password || !otp) {
        throw validationError('Email, OTP, password, and name are required!');
      }

      validateRegistrationData({ name, email, password }, 'user');

      const existingUser = await this.prisma.users.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw validationError('User already exists with this email!');
      }

      await verifyOtp(email, otp, next);

      const hashedPassword = await hashPassword(password);

      const user = await this.prisma.users.create({
        data: {
          name,
          email,
          password: hashedPassword,
          role: 'user',
        },
      });

      const { password: _password, ...safeUser } = user;

      try {
        await sendAccountCreatedEmail({
          name: user.name,
          email: user.email,
          role: user.role,
        });
      } catch (emailError) {
        console.error(
          '[auth] Failed to send account-created email:',
          emailError instanceof Error ? emailError.message : emailError,
        );
      }

      return res.status(201).json({
        success: true,
        message: 'User verified and registered successfully',
        user: safeUser,
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('login/user')
  @ApiOperation({ summary: 'Login user with email and password' })
  @ApiBody({ type: LoginUserDto })
  async loginUser(
    @Body() body: LoginUserDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      const { email, password } = body;

      if (!email || !password) {
        throw validationError('Email and password are required!');
      }

      const accessSecret = process.env.ACCESS_TOKEN_SECRET;
      const refreshSecret = process.env.REFRESH_TOKEN_SECRET;

      if (!accessSecret || !refreshSecret) {
        throw new Error(
          'ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must be set in .env',
        );
      }

      const user = await this.prisma.users.findUnique({
        where: { email },
      });

      if (!user || !user.password) {
        throw validationError('Invalid email or password!');
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw validationError('Invalid email or password!');
      }

      const accessToken = jwt.sign(
        { userId: user.id, role: user.role },
        accessSecret,
        { expiresIn: '15m' },
      );
      const refreshToken = jwt.sign(
        { userId: user.id, role: user.role },
        refreshSecret,
        { expiresIn: '7d' },
      );

      setCookie(res, 'refreshToken', refreshToken, authCookieOptions);
      setCookie(res, 'accessToken', accessToken, authCookieOptions);

      return res.status(200).json({
        success: true,
        message: 'User logged in successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('forgot-password/user')
  @ApiOperation({ summary: 'Email a password reset link to a user' })
  @ApiBody({ type: ForgotPasswordDto })
  async userForgotPassword(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await handleForgotPassword(req, res, next, 'user', this.prisma);
  }

  @Get('reset-password')
  @ApiOperation({ summary: 'Reset password page opened from the email link' })
  @ApiQuery({ name: 'token', required: true })
  async resetPasswordPage(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await renderResetPasswordPage(req, res, next);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Set a new password using the reset token' })
  @ApiBody({ type: ResetPasswordDto })
  async resetPassword(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await handleResetPassword(req, res, next, this.prisma);
  }

  @Post('register/seller')
  @ApiOperation({ summary: 'Register a new seller' })
  async sellerRegistration(
    @Body() body: Record<string, string>,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      validateRegistrationData(body, 'seller');

      const { name, email, password, phone_number, country, otp } = body;

      const existingUser = await this.prisma.users.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw validationError('Seller already exists with this email!');
      }

      if (!otp) {
        throw validationError('OTP is required!');
      }

      await verifyOtp(email, otp, next);

      const hashedPassword = await hashPassword(password);

      const seller = await this.prisma.users.create({
        data: {
          name,
          email,
          password: hashedPassword,
          phone_number,
          country,
          role: 'seller',
        },
      });

      const { password: _password, ...safeSeller } = seller;

      return res.status(201).json({
        success: true,
        message: 'Seller registered successfully',
        user: safeSeller,
      });
    } catch (error) {
      return next(error);
    }
  }
}
