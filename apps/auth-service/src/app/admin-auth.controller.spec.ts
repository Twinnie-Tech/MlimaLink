import type { NextFunction, Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import { AppError } from '@org/errors';
import type { FakeRedis } from '../testing/fake-redis';
import type { SafeAdmin } from '../utils/admin.helper';
import { signRefreshToken, verifyToken } from '../utils/auth-tokens';
import { redisClient } from '../utils/redis.client';
import {
  createRefreshSession,
  isRefreshSessionActive,
} from '../utils/refresh-sessions';
import { AdminAuthController } from './admin-auth.controller';
import type { LoginUserDto } from './dto/login-user.dto';
import type { AdminRequest } from './is-admin.guard';
import type { PrismaService } from './prisma.service';

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

const savedAdmin: SafeAdmin = {
  id: 'a1',
  name: 'Wanjiku Admin',
  email: 'admin@mlimalink.com',
  lastLoginAt: null,
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

function cookieCall(res: ReturnType<typeof mockRes>, name: string) {
  const call = res.cookie.mock.calls.find(
    ([cookieName]) => cookieName === name,
  );
  if (!call) throw new Error(`Cookie ${name} was not set`);
  return call;
}

function errorFrom(next: ReturnType<typeof vi.fn>): AppError {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0];
  expect(error).toBeInstanceOf(AppError);
  return error as AppError;
}

function refreshRequest(cookies: Record<string, string>) {
  return { cookies, headers: {} } as unknown as Request;
}

describe('AdminAuthController', () => {
  const admins = { findUnique: vi.fn(), update: vi.fn() };
  const controller = new AdminAuthController({
    admins,
  } as unknown as PrismaService);

  beforeEach(() => {
    redis.reset();
    vi.clearAllMocks();
    admins.findUnique.mockResolvedValue(null);
    admins.update.mockImplementation(async ({ data }) => ({
      ...savedAdmin,
      ...data,
    }));
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
    vi.stubEnv('SELLER_ACCESS_TOKEN_SECRET', 'seller-access-secret');
    vi.stubEnv('SELLER_REFRESH_TOKEN_SECRET', 'seller-refresh-secret');
    vi.stubEnv('ADMIN_ACCESS_TOKEN_SECRET', 'admin-access-secret');
    vi.stubEnv('ADMIN_REFRESH_TOKEN_SECRET', 'admin-refresh-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('login/admin', () => {
    beforeEach(async () => {
      admins.findUnique.mockResolvedValue({
        ...savedAdmin,
        password: await bcrypt.hash('Secret123!', 4),
      });
    });

    it('signs the admin in with admin cookies only', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.loginAdmin(
        { email: ' Admin@MlimaLink.com ', password: 'Secret123!' } as LoginUserDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(admins.findUnique.mock.calls[0][0].where).toEqual({
        email: 'admin@mlimalink.com',
      });
      expect(admins.update.mock.calls[0][0].data.lastLoginAt).toBeInstanceOf(
        Date,
      );
      const body = res.json.mock.calls[0][0];
      expect(body.admin).toMatchObject({ id: 'a1' });
      expect(body.admin).not.toHaveProperty('password');
      expect(cookieNames(res).sort()).toEqual([
        'adminAccessToken',
        'adminRefreshToken',
      ]);
      const [, token, options] = cookieCall(res, 'adminAccessToken');
      expect(verifyToken(token, 'access', 'admin')).toMatchObject({
        userId: 'a1',
        role: 'admin',
      });
      // Not remembered by default, so the cookies go when the browser closes.
      expect(options.maxAge).toBeUndefined();
    });

    it('rejects a wrong password without setting cookies', async () => {
      const res = mockRes();
      const next = vi.fn();

      await controller.loginAdmin(
        { email: savedAdmin.email, password: 'Wrong123!' } as LoginUserDto,
        res as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).message).toBe('Invalid email or password!');
      expect(res.cookie).not.toHaveBeenCalled();
      expect(admins.update).not.toHaveBeenCalled();
    });

    it('rejects an unknown email', async () => {
      admins.findUnique.mockResolvedValue(null);
      const next = vi.fn();

      await controller.loginAdmin(
        { email: 'someone@example.com', password: 'Secret123!' } as LoginUserDto,
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(400);
    });
  });

  it('returns the signed-in admin', () => {
    expect(
      controller.getLoggedInAdmin({ admin: savedAdmin } as AdminRequest),
    ).toEqual({ success: true, admin: savedAdmin });
  });

  describe('refresh-token/admin', () => {
    it('rotates the admin refresh cookie', async () => {
      admins.findUnique.mockResolvedValue({ id: 'a1' });
      const sessionId = await createRefreshSession('a1', undefined, 'admin');
      const res = mockRes();
      const next = vi.fn();

      await controller.refreshAdminToken(
        refreshRequest({
          adminRefreshToken: signRefreshToken(
            { userId: 'a1', role: 'admin' },
            sessionId,
            'admin',
          ),
        }),
        res as unknown as Response,
        next as NextFunction,
      );

      expect(next).not.toHaveBeenCalled();
      expect(cookieNames(res).sort()).toEqual([
        'adminAccessToken',
        'adminRefreshToken',
      ]);
    });

    it('ends the session once the admin account is removed', async () => {
      const sessionId = await createRefreshSession('a1', undefined, 'admin');
      const next = vi.fn();

      await controller.refreshAdminToken(
        refreshRequest({
          adminRefreshToken: signRefreshToken(
            { userId: 'a1', role: 'admin' },
            sessionId,
            'admin',
          ),
        }),
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(401);
    });

    it("ignores a seller's refresh cookie", async () => {
      const sessionId = await createRefreshSession('s1', undefined, 'seller');
      const next = vi.fn();

      await controller.refreshAdminToken(
        refreshRequest({
          sellerRefreshToken: signRefreshToken(
            { userId: 's1', role: 'seller' },
            sessionId,
            'seller',
          ),
        }),
        mockRes() as unknown as Response,
        next as NextFunction,
      );

      expect(errorFrom(next).statusCode).toBe(401);
    });
  });

  it('ends the admin session and clears admin cookies on logout', async () => {
    const sessionId = await createRefreshSession('a1', undefined, 'admin');
    const res = mockRes();

    await controller.logoutAdmin(
      refreshRequest({
        adminRefreshToken: signRefreshToken(
          { userId: 'a1', role: 'admin' },
          sessionId,
          'admin',
        ),
      }),
      res as unknown as Response,
    );

    expect(await isRefreshSessionActive('a1', sessionId)).toBe(false);
    expect(res.clearCookie.mock.calls.map(([name]) => name)).toEqual([
      'adminAccessToken',
      'adminRefreshToken',
    ]);
  });
});
