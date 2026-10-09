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
import {
  ApiBody,
  ApiCookieAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
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
import { clearAuthCookies, getTokenSecrets } from '../utils/auth-tokens';
import {
  endSessionFromRequest,
  issueAuthCookies,
  rotateAuthSession,
} from '../utils/refresh-sessions';
import { assertNotSuspended } from '../utils/suspension';
import {
  IsAuthenticatedGuard,
  type AuthenticatedRequest,
} from './is-authenticated.guard';
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
      const { email, password, rememberMe = true } = body;

      if (!email || !password) {
        throw validationError('Email and password are required!');
      }

      getTokenSecrets('user');

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
      assertNotSuspended(user);

      await issueAuthCookies(
        res,
        { userId: user.id, role: user.role, rememberMe },
        'user',
      );

      return res.status(200).json({
        success: true,
        message: 'User logged in successfully',
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          createdAt: user.createdAt,
        },
      });
    } catch (error) {
      return next(error);
    }
  }

  @Get('logged-in-user')
  @UseGuards(IsAuthenticatedGuard)
  @ApiOperation({ summary: 'Get the user for the current access token' })
  @ApiCookieAuth('accessToken')
  getLoggedInUser(@Req() req: AuthenticatedRequest) {
    return { success: true, user: req.user };
  }

  @Post('refresh-token')
  @HttpCode(200)
  @ApiOperation({
    summary:
      'Issue new access and refresh tokens from the refresh token cookie',
  })
  @ApiCookieAuth('refreshToken')
  async refreshToken(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      await rotateAuthSession(req, res, 'user', async (id) => {
        const user = await this.prisma.users.findUnique({
          where: { id },
          select: { role: true, suspended: true },
        });
        return user && !user.suspended ? user.role : null;
      });

      return res
        .status(200)
        .json({ success: true, message: 'Token refreshed' });
    } catch (error) {
      return next(error);
    }
  }

  @Post('logout')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Log out by ending the session and clearing the auth cookies',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await endSessionFromRequest(req, 'user');
    clearAuthCookies(res);
    return { success: true, message: 'Logged out successfully' };
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
}
