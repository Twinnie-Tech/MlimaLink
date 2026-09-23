import { Controller, Next, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { NextFunction, Request, Response } from 'express';
import {
  checkOtpRegistration,
  hashPassword,
  sendOtp,
  trackOtp,
  validateRegistrationData,
  verifyOtp,
} from '../utils/auth.helper';
import { PrismaService } from './prisma.service';
import { validationError } from '@org/errors';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register/user')
  @ApiOperation({ summary: 'Register a new user' })
  async userRegistration(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      validateRegistrationData(req.body, 'user');

      const { name, email } = req.body as {
        name: string;
        email: string;
        password: string;
        otp: string;
      };

      const existingUser = await this.prisma.users.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw validationError('User already exists with this email!');
      }

      await checkOtpRegistration(email, next);
      await trackOtp(email, next);
      await sendOtp(name, email, 'user_registration');

      res.status(200).json({
        success: true,
        message: 'OTP sent successfully. Please check your email.',
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('register/seller')
  @ApiOperation({ summary: 'Register a new seller' })
  async sellerRegistration(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      validateRegistrationData(req.body, 'seller');

      const { name, email, password, phone_number, country, otp } =
        req.body as {
          name: string;
          email: string;
          password: string;
          phone_number: string;
          country: string;
          otp: string;
        };

      const existingUser = await this.prisma.users.findUnique({
        where: { email },
      });

      if (existingUser) {
        throw validationError('Seller already exists with this email!');
      }

      if (!otp || !(await verifyOtp(email, otp))) {
        throw validationError('Invalid OTP!');
      }

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
