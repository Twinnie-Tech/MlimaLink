import type { NextFunction, Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { AppError } from '@org/errors';
import type { FakeRedis } from '../testing/fake-redis';
import { signRefreshToken, verifyToken } from '../utils/auth-tokens';
import { redisClient } from '../utils/redis.client';
import {
  createRefreshSession,
  isRefreshSessionActive,
} from '../utils/refresh-sessions';
import type { SafeSeller } from '../utils/seller.helper';
import { sendEmail } from '../utils/send-email';
import { getStripe } from '../utils/stripe';
import type { CreateShopDto } from './dto/create-shop.dto';
import type { LoginUserDto } from './dto/login-user.dto';
import type {
  RegisterSellerDto,
  VerifySellerDto,
} from './dto/register-seller.dto';
import type { PrismaService } from './prisma.service';
import type { SellerRequest } from './is-seller.guard';
import { SellerAuthController } from './seller-auth.controller';

vi.mock('../utils/send-email', () => ({ sendEmail: vi.fn() }));
vi.mock('../utils/stripe', () => ({ getStripe: vi.fn() }));
vi.mock('../utils/redis.client', async () => {
  const { createFakeRedis } = await vi.importActual<
    typeof import('../testing/fake-redis')
  >('../testing/fake-redis');
  return {
    ensureRedisConnected: async () => undefined,
    redisClient: createFakeRedis(),
  };
});

const redis = redisClient as unknown as FakeRedis;

const sellerDetails = {
  name: 'Amina Otieno',
  email: 'amina@example.com',
  password: 'Secret123!',
  phone_number: '+254712345678',
  country: 'KE',
};

const savedSeller: SafeSeller = {
  id: 's1',
  name: sellerDetails.name,
  email: sellerDetails.email,
  phone_number: sellerDetails.phone_number,
  country: sellerDetails.country,
  stripeId: null,
  createdAt: new Date(),
  shop: null,
};

const shop = {
  id: 'shop1',
  name: 'Mlima Fresh',
  bio: null,
  category: 'Fruits & Vegetables',
  address: 'Moi Avenue, Nairobi',
  opening_hours: null,
  website: null,
  ratings: 0,
  sellerId: 's1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn<(body: Record<string, unknown>) => void>(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
  return res;
}

function cookieNames(res: ReturnType<typeof mockRes>) {
  return res.cookie.mock.calls.map(([name]) => name);
}

function cookieValue(res: ReturnType<typeof mockRes>, name: string): string {
  const call = res.cookie.mock.calls.find(
    ([cookieName]) => cookieName === name,
  );
  if (!call) throw new Error(`Cookie ${name} was not set`);
  return call[1] as string;
}

function errorFrom(next: ReturnType<typeof vi.fn>): AppError {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0];
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

function sellerRequest(seller: Partial<SafeSeller> = {}) {
  return { seller: { ...savedSeller, ...seller } } as SellerRequest;
}

describe('SellerAuthController', () => {
  const sellers = {
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
  };
  const shops = { create: vi.fn() };
  const controller = new SellerAuthController({
    sellers,
    shops,
  } as unknown as PrismaService);

  beforeEach(() => {
    redis.reset();
    vi.clearAllMocks();
    sellers.findUnique.mockResolvedValue(null);
    sellers.create.mockResolvedValue(savedSeller);
    vi.mocked(sendEmail).mockResolvedValue(undefined);
    vi.mocked(getStripe).mockReturnValue(null);
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('register/seller', () => {
    it('emails an OTP to a new seller', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.registerSeller(
        sellerDetails as RegisterSellerDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendEmail).toHaveBeenCalledWith(
        sellerDetails.email,
        'Verify your email',
        'user_registration',
        expect.objectContaining({ name: sellerDetails.name }),
      );
      expect(redis.strings.get(`otp:${sellerDetails.email}`)).toMatch(
        /^\d{4}$/,
      );
    });

    it.each([
      ['a phone number without a country code', { phone_number: '0712345678' }],
      ['an unknown country', { country: 'Kenya' }],
      ['a missing phone number', { phone_number: '' }],
    ])('rejects %s', async (_case, override) => {
      const next = vi.fn();

      await controller.registerSeller(
        { ...sellerDetails, ...override } as RegisterSellerDto,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(400);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('rejects an email that already has a seller account', async () => {
      sellers.findUnique.mockResolvedValue(savedSeller);
      const next = vi.fn();

      await controller.registerSeller(
        sellerDetails as RegisterSellerDto,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).message).toBe(
        'Seller already exists with this email!',
      );
    });
  });

  describe('verify/seller', () => {
    it('creates the seller and signs them in with seller cookies', async () => {
      await redis.set(`otp:${sellerDetails.email}`, '1234');
      const res = mockRes();
      const next = vi.fn();

      await controller.verifySeller(
        { ...sellerDetails, otp: '1234' } as VerifySellerDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);

      const { data } = sellers.create.mock.calls[0][0];
      expect(data).toMatchObject({
        name: sellerDetails.name,
        phone_number: '+254712345678',
        country: 'KE',
      });
      expect(await bcrypt.compare('Secret123!', data.password)).toBe(true);

      expect(cookieNames(res).sort()).toEqual([
        'sellerAccessToken',
        'sellerRefreshToken',
      ]);
      const refresh = verifyToken(
        cookieValue(res, 'sellerRefreshToken'),
        'refresh',
      );
      expect(refresh).toMatchObject({ userId: 's1', role: 'seller' });
      expect(await isRefreshSessionActive('s1', refresh.jti as string)).toBe(
        true,
      );
    });

    it('does not create the seller when the OTP is wrong', async () => {
      await redis.set(`otp:${sellerDetails.email}`, '1234');
      const next = vi.fn();

      await controller.verifySeller(
        { ...sellerDetails, otp: '9999' } as VerifySellerDto,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).message).toMatch(/^Invalid OTP!/);
      expect(sellers.create).not.toHaveBeenCalled();
    });
  });

  describe('login/seller', () => {
    beforeEach(async () => {
      sellers.findUnique.mockResolvedValue({
        ...savedSeller,
        password: await bcrypt.hash('Secret123!', 4),
      });
    });

    it('signs the seller in without exposing the password', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.loginSeller(
        { email: sellerDetails.email, password: 'Secret123!' } as LoginUserDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];
      expect(body.seller).toMatchObject({ id: 's1' });
      expect(body.seller).not.toHaveProperty('password');
      expect(cookieNames(res)).toContain('sellerAccessToken');
      expect(cookieNames(res)).not.toContain('accessToken');
    });

    it('rejects a wrong password', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.loginSeller(
        { email: sellerDetails.email, password: 'Wrong123!' } as LoginUserDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).message).toBe('Invalid email or password!');
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  describe('refresh-token/seller', () => {
    it('rotates the seller refresh cookie', async () => {
      sellers.findUnique.mockResolvedValue({ id: 's1' });
      const sessionId = await createRefreshSession('s1');
      const res = mockRes();
      const next = vi.fn();

      await controller.refreshSellerToken(
        {
          cookies: {
            sellerRefreshToken: signRefreshToken(
              { userId: 's1', role: 'seller' },
              sessionId,
            ),
          },
          headers: {},
        } as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(cookieNames(res).sort()).toEqual([
        'sellerAccessToken',
        'sellerRefreshToken',
      ]);
    });

    it("ignores a shopper's refresh cookie", async () => {
      const sessionId = await createRefreshSession('u1');
      const next = vi.fn();

      await controller.refreshSellerToken(
        {
          cookies: {
            refreshToken: signRefreshToken(
              { userId: 'u1', role: 'user' },
              sessionId,
            ),
          },
          headers: {},
        } as unknown as Request,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(401);
    });
  });

  describe('create-shop', () => {
    const shopBody = {
      name: '  Mlima Fresh ',
      category: 'Fruits & Vegetables',
      address: 'Moi Avenue, Nairobi',
      bio: '',
      website: 'https://mlimafresh.co.ke',
    } as CreateShopDto;

    it("creates the seller's shop with trimmed details", async () => {
      shops.create.mockResolvedValue(shop);
      const res = mockRes();
      const next = vi.fn();

      await controller.createShop(
        sellerRequest(),
        shopBody,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(shops.create).toHaveBeenCalledWith({
        data: {
          name: 'Mlima Fresh',
          category: 'Fruits & Vegetables',
          address: 'Moi Avenue, Nairobi',
          bio: undefined,
          opening_hours: undefined,
          website: 'https://mlimafresh.co.ke',
          sellerId: 's1',
        },
      });
    });

    it('rejects a second shop', async () => {
      const next = vi.fn();

      await controller.createShop(
        sellerRequest({ shop }),
        shopBody,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).message).toBe('You already have a shop!');
      expect(shops.create).not.toHaveBeenCalled();
    });

    it('rejects a website that is not a link', async () => {
      const next = vi.fn();

      await controller.createShop(
        sellerRequest(),
        { ...shopBody, website: 'mlimafresh' },
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(400);
    });
  });

  describe('create-stripe-link', () => {
    function fakeStripe() {
      return {
        accounts: { create: vi.fn().mockResolvedValue({ id: 'acct_123' }) },
        accountLinks: {
          create: vi
            .fn()
            .mockResolvedValue({ url: 'https://connect.stripe.com/setup/x' }),
        },
      };
    }

    it('needs a shop first', async () => {
      const next = vi.fn();

      await controller.createStripeLink(
        sellerRequest(),
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).message).toBe(
        'Set up your shop before connecting a bank account!',
      );
    });

    it('answers 503 when Stripe is not configured', async () => {
      const next = vi.fn();

      await controller.createStripeLink(
        sellerRequest({ shop }),
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(503);
    });

    it('creates a Stripe account once and returns its onboarding link', async () => {
      const stripe = fakeStripe();
      vi.mocked(getStripe).mockReturnValue(
        stripe as unknown as ReturnType<typeof getStripe>,
      );
      const res = mockRes();
      const next = vi.fn();

      await controller.createStripeLink(
        sellerRequest({ shop }),
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(sellers.update).toHaveBeenCalledWith({
        where: { id: 's1' },
        data: { stripeId: 'acct_123' },
      });
      expect(stripe.accountLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          account: 'acct_123',
          return_url: 'http://localhost:4300/success',
          type: 'account_onboarding',
        }),
      );
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        url: 'https://connect.stripe.com/setup/x',
      });
    });

    it('reuses an existing Stripe account', async () => {
      const stripe = fakeStripe();
      vi.mocked(getStripe).mockReturnValue(
        stripe as unknown as ReturnType<typeof getStripe>,
      );

      await controller.createStripeLink(
        sellerRequest({ shop, stripeId: 'acct_existing' }),
        mockRes() as unknown as Response,
        vi.fn() as NextFunction,
      );

      expect(stripe.accounts.create).not.toHaveBeenCalled();
      expect(stripe.accountLinks.create).toHaveBeenCalledWith(
        expect.objectContaining({ account: 'acct_existing' }),
      );
    });
  });
});
