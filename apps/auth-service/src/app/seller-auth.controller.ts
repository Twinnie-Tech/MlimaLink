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
import { appError, validationError } from '@org/errors';
import {
  checkOtpRegistration,
  handleForgotPassword,
  handleResetPassword,
  hashPassword,
  renderResetPasswordPage,
  sellerUiUrl,
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
  safeSellerSelect,
  sendShopCreatedEmail,
  validateSellerRegistration,
  validateShopData,
} from '../utils/seller.helper';
import { getStripe } from '../utils/stripe';
import { CreateShopDto } from './dto/create-shop.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { RegisterSellerDto, VerifySellerDto } from './dto/register-seller.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { IsSellerGuard, type SellerRequest } from './is-seller.guard';
import { PrismaService } from './prisma.service';

@ApiTags('seller auth')
@Controller('auth')
export class SellerAuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('register/seller')
  @ApiOperation({ summary: 'Start seller sign-up by emailing an OTP' })
  @ApiBody({ type: RegisterSellerDto })
  async registerSeller(
    @Body() body: RegisterSellerDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      validateSellerRegistration(body);

      const { name, email } = body;

      if (await this.prisma.sellers.findUnique({ where: { email } })) {
        throw validationError('Seller already exists with this email!');
      }

      await checkOtpRegistration(email, next);
      await trackOtp(email, next);
      await sendOtp(
        name,
        email,
        'seller_registration',
        'Verify your MlimaLink seller account',
      );

      return res.status(200).json({
        success: true,
        message: 'OTP sent successfully. Please check your email.',
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('verify/seller')
  @ApiOperation({
    summary: 'Verify the seller OTP, create the account and sign the seller in',
  })
  @ApiBody({ type: VerifySellerDto })
  async verifySeller(
    @Body() body: VerifySellerDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      const { name, email, password, phone_number, country, otp } = body;

      if (!otp) {
        throw validationError('OTP is required!');
      }

      validateSellerRegistration(body);
      getTokenSecrets('seller');

      if (await this.prisma.sellers.findUnique({ where: { email } })) {
        throw validationError('Seller already exists with this email!');
      }

      await verifyOtp(email, otp, next);

      const seller = await this.prisma.sellers.create({
        data: {
          name,
          email,
          phone_number,
          country,
          password: await hashPassword(password),
        },
        select: safeSellerSelect,
      });

      // No welcome email here: the seller hears from us once their shop exists
      // (create-shop), when there is something to sell from.

      // Signed in straight away so the next sign-up steps can act as this seller.
      await issueAuthCookies(
        res,
        { userId: seller.id, role: 'seller', rememberMe: true },
        'seller',
      );

      return res.status(201).json({
        success: true,
        message: 'Seller verified and registered successfully',
        seller,
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('login/seller')
  @ApiOperation({ summary: 'Login seller with email and password' })
  @ApiBody({ type: LoginUserDto })
  async loginSeller(
    @Body() body: LoginUserDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      const { email, password, rememberMe = true } = body;

      if (!email || !password) {
        throw validationError('Email and password are required!');
      }

      getTokenSecrets('seller');

      const found = await this.prisma.sellers.findUnique({
        where: { email },
        select: { ...safeSellerSelect, password: true },
      });

      if (!found || !(await bcrypt.compare(password, found.password))) {
        throw validationError('Invalid email or password!');
      }

      const { password: _password, ...seller } = found;

      await issueAuthCookies(
        res,
        { userId: seller.id, role: 'seller', rememberMe },
        'seller',
      );

      return res.status(200).json({
        success: true,
        message: 'Seller logged in successfully',
        seller,
      });
    } catch (error) {
      return next(error);
    }
  }

  @Get('logged-in-seller')
  @UseGuards(IsSellerGuard)
  @ApiOperation({ summary: 'Get the seller (and shop) for the current token' })
  @ApiCookieAuth('sellerAccessToken')
  getLoggedInSeller(@Req() req: SellerRequest) {
    return { success: true, seller: req.seller };
  }

  @Post('refresh-token/seller')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Issue new seller tokens from the seller refresh token cookie',
  })
  @ApiCookieAuth('sellerRefreshToken')
  async refreshSellerToken(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      await rotateAuthSession(req, res, 'seller', async (id) => {
        const seller = await this.prisma.sellers.findUnique({
          where: { id },
          select: { id: true },
        });
        return seller ? 'seller' : null;
      });

      return res
        .status(200)
        .json({ success: true, message: 'Token refreshed' });
    } catch (error) {
      return next(error);
    }
  }

  @Post('logout/seller')
  @HttpCode(200)
  @ApiOperation({ summary: 'Log the seller out and clear the seller cookies' })
  async logoutSeller(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await endSessionFromRequest(req, 'seller');
    clearAuthCookies(res, 'seller');
    return { success: true, message: 'Logged out successfully' };
  }

  @Post('forgot-password/seller')
  @ApiOperation({ summary: 'Email a password reset link to a seller' })
  @ApiBody({ type: ForgotPasswordDto })
  async sellerForgotPassword(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await handleForgotPassword(req, res, next, 'seller', this.prisma);
  }

  @Get('reset-password/seller')
  @ApiOperation({
    summary: 'Seller reset password page opened from the email link',
  })
  @ApiQuery({ name: 'token', required: true })
  async sellerResetPasswordPage(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await renderResetPasswordPage(req, res, next, 'seller');
  }

  @Post('reset-password/seller')
  @ApiOperation({ summary: 'Set a new seller password using the reset token' })
  @ApiBody({ type: ResetPasswordDto })
  async sellerResetPassword(
    @Req() req: Request,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    await handleResetPassword(req, res, next, this.prisma, 'seller');
  }

  @Post('create-shop')
  @UseGuards(IsSellerGuard)
  @ApiOperation({ summary: "Create the signed-in seller's shop" })
  @ApiCookieAuth('sellerAccessToken')
  @ApiBody({ type: CreateShopDto })
  async createShop(
    @Req() req: SellerRequest,
    @Body() body: CreateShopDto,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      const data = validateShopData(body);

      if (req.seller.shop) {
        throw validationError('You already have a shop!');
      }

      const shop = await this.prisma.shops.create({
        data: { ...data, sellerId: req.seller.id },
      });

      // Not awaited: a slow mail server shouldn't hold up the next sign-up step.
      void sendShopCreatedEmail(req.seller, shop).catch(
        (emailError: unknown) => {
          console.error(
            '[auth] Failed to send shop-created email:',
            emailError instanceof Error ? emailError.message : emailError,
          );
        },
      );

      return res.status(201).json({
        success: true,
        message: 'Shop created successfully',
        shop,
      });
    } catch (error) {
      return next(error);
    }
  }

  @Post('create-stripe-link')
  @UseGuards(IsSellerGuard)
  @ApiOperation({
    summary: 'Get a Stripe onboarding link to connect a payout bank account',
  })
  @ApiCookieAuth('sellerAccessToken')
  async createStripeLink(
    @Req() req: SellerRequest,
    @Res() res: Response,
    @Next() next: NextFunction,
  ) {
    try {
      const { seller } = req;

      if (!seller.shop) {
        throw validationError(
          'Set up your shop before connecting a bank account!',
        );
      }

      const stripe = getStripe();
      if (!stripe) {
        throw appError(
          'Bank connection is not available yet. Please try again later.',
          503,
        );
      }

      let stripeId = seller.stripeId;
      if (!stripeId) {
        const account = await stripe.accounts.create({
          type: 'express',
          email: seller.email,
          business_profile: { name: seller.shop.name },
          capabilities: {
            card_payments: { requested: true },
            transfers: { requested: true },
          },
        });
        stripeId = account.id;
        await this.prisma.sellers.update({
          where: { id: seller.id },
          data: { stripeId },
        });
      }

      const link = await stripe.accountLinks.create({
        account: stripeId,
        refresh_url: `${sellerUiUrl()}/signup`,
        return_url: `${sellerUiUrl()}/success`,
        type: 'account_onboarding',
      });

      return res.status(200).json({ success: true, url: link.url });
    } catch (error) {
      return next(error);
    }
  }
}
