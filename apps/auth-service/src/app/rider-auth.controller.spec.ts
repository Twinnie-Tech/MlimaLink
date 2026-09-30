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
import type { SafeRider } from '../utils/rider.helper';
import { sendEmail } from '../utils/send-email';
import type { LoginUserDto } from './dto/login-user.dto';
import type {
  RegisterRiderDto,
  VerifyRiderDto,
} from './dto/register-rider.dto';
import type { RiderRequest } from './is-rider.guard';
import type { PrismaService } from './prisma.service';
import { RiderAuthController } from './rider-auth.controller';

vi.mock('../utils/send-email', () => ({ sendEmail: vi.fn() }));
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

const riderDetails = {
  name: 'Brian Kiprono',
  email: 'brian@example.com',
  password: 'Secret123!',
  phone_number: '+254722000111',
};

const savedRider: SafeRider = {
  id: 'r1',
  name: riderDetails.name,
  email: riderDetails.email,
  phone_number: riderDetails.phone_number,
  vehicle: null,
  zones: [],
  available: false,
  createdAt: new Date(),
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

describe('RiderAuthController', () => {
  const riders = { findUnique: vi.fn(), create: vi.fn() };
  const controller = new RiderAuthController({
    riders,
  } as unknown as PrismaService);

  beforeEach(() => {
    redis.reset();
    vi.clearAllMocks();
    riders.findUnique.mockResolvedValue(null);
    riders.create.mockResolvedValue(savedRider);
    vi.mocked(sendEmail).mockResolvedValue(undefined);
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
    vi.stubEnv('SELLER_ACCESS_TOKEN_SECRET', 'seller-access-secret');
    vi.stubEnv('SELLER_REFRESH_TOKEN_SECRET', 'seller-refresh-secret');
    vi.stubEnv('RIDER_ACCESS_TOKEN_SECRET', 'rider-access-secret');
    vi.stubEnv('RIDER_REFRESH_TOKEN_SECRET', 'rider-refresh-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('register/rider', () => {
    it('emails an OTP with the rider template', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.registerRider(
        riderDetails as RegisterRiderDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(sendEmail).toHaveBeenCalledWith(
        riderDetails.email,
        'Verify your MlimaLink rider account',
        'rider_registration',
        expect.objectContaining({ name: riderDetails.name }),
      );
      expect(redis.strings.get(`otp:${riderDetails.email}`)).toMatch(/^\d{4}$/);
    });

    it.each([
      ['a phone number without a country code', { phone_number: '0712345678' }],
      ['a missing phone number', { phone_number: '' }],
      ['a weak password', { password: 'password' }],
    ])('rejects %s', async (_case, override) => {
      const next = vi.fn();

      await controller.registerRider(
        { ...riderDetails, ...override } as RegisterRiderDto,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(400);
      expect(sendEmail).not.toHaveBeenCalled();
    });

    it('rejects an email that already has a rider account', async () => {
      riders.findUnique.mockResolvedValue(savedRider);
      const next = vi.fn();

      await controller.registerRider(
        riderDetails as RegisterRiderDto,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).message).toBe(
        'Rider already exists with this email!',
      );
    });
  });

  describe('verify/rider', () => {
    it('creates the rider and signs them in with rider cookies', async () => {
      await redis.set(`otp:${riderDetails.email}`, '1234');
      const res = mockRes();
      const next = vi.fn();

      await controller.verifyRider(
        { ...riderDetails, otp: '1234' } as VerifyRiderDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      const data = riders.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        name: riderDetails.name,
        email: riderDetails.email,
        phone_number: riderDetails.phone_number,
      });
      expect(await bcrypt.compare('Secret123!', data.password)).toBe(true);
      expect(cookieNames(res).sort()).toEqual([
        'riderAccessToken',
        'riderRefreshToken',
      ]);
      expect(
        verifyToken(cookieValue(res, 'riderAccessToken'), 'access', 'rider'),
      ).toMatchObject({ userId: 'r1', role: 'rider' });
    });

    it('rejects a wrong OTP without creating the rider', async () => {
      await redis.set(`otp:${riderDetails.email}`, '1234');
      const next = vi.fn();

      await controller.verifyRider(
        { ...riderDetails, otp: '9999' } as VerifyRiderDto,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(400);
      expect(riders.create).not.toHaveBeenCalled();
    });
  });

  describe('login/rider', () => {
    beforeEach(async () => {
      riders.findUnique.mockResolvedValue({
        ...savedRider,
        password: await bcrypt.hash('Secret123!', 4),
      });
    });

    it('signs the rider in without exposing the password', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.loginRider(
        { email: riderDetails.email, password: 'Secret123!' } as LoginUserDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      const body = res.json.mock.calls[0][0];
      expect(body.rider).toMatchObject({ id: 'r1' });
      expect(body.rider).not.toHaveProperty('password');
      expect(cookieNames(res)).toContain('riderAccessToken');
      expect(cookieNames(res)).not.toContain('accessToken');
      expect(cookieNames(res)).not.toContain('sellerAccessToken');
    });

    it('rejects a wrong password', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.loginRider(
        { email: riderDetails.email, password: 'Wrong123!' } as LoginUserDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).message).toBe('Invalid email or password!');
      expect(res.cookie).not.toHaveBeenCalled();
    });
  });

  it('returns the signed-in rider', () => {
    expect(
      controller.getLoggedInRider({ rider: savedRider } as RiderRequest),
    ).toEqual({ success: true, rider: savedRider });
  });

  describe('refresh-token/rider', () => {
    it('rotates the rider refresh cookie', async () => {
      riders.findUnique.mockResolvedValue({ id: 'r1' });
      const sessionId = await createRefreshSession('r1', undefined, 'rider');
      const res = mockRes();
      const next = vi.fn();

      await controller.refreshRiderToken(
        {
          cookies: {
            riderRefreshToken: signRefreshToken(
              { userId: 'r1', role: 'rider' },
              sessionId,
              'rider',
            ),
          },
          headers: {},
        } as unknown as Request,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(cookieNames(res).sort()).toEqual([
        'riderAccessToken',
        'riderRefreshToken',
      ]);
    });

    it("ignores a seller's refresh cookie", async () => {
      const sessionId = await createRefreshSession('s1', undefined, 'seller');
      const next = vi.fn();

      await controller.refreshRiderToken(
        {
          cookies: {
            sellerRefreshToken: signRefreshToken(
              { userId: 's1', role: 'seller' },
              sessionId,
              'seller',
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

  it('ends the rider session and clears rider cookies on logout', async () => {
    const sessionId = await createRefreshSession('r1', undefined, 'rider');
    const res = mockRes();

    await controller.logoutRider(
      {
        cookies: {
          riderRefreshToken: signRefreshToken(
            { userId: 'r1', role: 'rider' },
            sessionId,
            'rider',
          ),
        },
        headers: {},
      } as unknown as Request,
      res as unknown as Response,
    );

    expect(await isRefreshSessionActive('r1', sessionId)).toBe(false);
    expect(res.clearCookie.mock.calls.map(([name]) => name)).toEqual([
      'riderAccessToken',
      'riderRefreshToken',
    ]);
  });
});
