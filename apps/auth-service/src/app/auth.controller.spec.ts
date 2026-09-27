import type { NextFunction, Request, Response } from 'express';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { AppError } from '@org/errors';
import type { FakeRedis } from '../testing/fake-redis';
import { signRefreshToken, verifyToken } from '../utils/auth-tokens';
import { redisClient } from '../utils/redis.client';
import {
  ROTATION_GRACE_SECONDS,
  createRefreshSession,
  isRefreshSessionActive,
} from '../utils/refresh-sessions';
import { AuthController } from './auth.controller';
import type { LoginUserDto } from './dto/login-user.dto';
import type { PrismaService } from './prisma.service';

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

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn<(body: Record<string, unknown>) => void>(),
    cookie: vi.fn(),
    clearCookie: vi.fn(),
  };
  return res;
}

function cookieValue(res: ReturnType<typeof mockRes>, name: string): string {
  const call = res.cookie.mock.calls.find(
    ([cookieName]) => cookieName === name,
  );
  if (!call) throw new Error(`Cookie ${name} was not set`);
  return call[1] as string;
}

function requestWithRefreshToken(token?: string) {
  return {
    cookies: token ? { refreshToken: token } : {},
    headers: {},
  } as unknown as Request;
}

function expectUnauthorized(next: ReturnType<typeof vi.fn>) {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0] as AppError;
  expect(error).toBeInstanceOf(AppError);
  expect(error.statusCode).toBe(401);
}

describe('AuthController sessions', () => {
  const findUnique = vi.fn();
  const controller = new AuthController({
    users: { findUnique },
  } as unknown as PrismaService);

  beforeEach(() => {
    redis.reset();
    findUnique.mockReset();
    findUnique.mockResolvedValue({ id: 'u1', role: 'user' });
    vi.stubEnv('ACCESS_TOKEN_SECRET', 'access-secret');
    vi.stubEnv('REFRESH_TOKEN_SECRET', 'refresh-secret');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('logs in with cookies only and starts a session', async () => {
    findUnique.mockResolvedValue({
      id: 'u1',
      name: 'Jane Doe',
      email: 'jane@example.com',
      role: 'user',
      createdAt: new Date(),
      password: await bcrypt.hash('Secret123!', 4),
    });
    const res = mockRes();
    const next = vi.fn();

    await controller.loginUser(
      {
        email: 'jane@example.com',
        password: 'Secret123!',
        rememberMe: true,
      } as LoginUserDto,
      res as unknown as Response,
      next as NextFunction,
    );

    expect(next).not.toHaveBeenCalled();
    const body = res.json.mock.calls[0][0];
    expect(body).not.toHaveProperty('accessToken');
    expect(body).not.toHaveProperty('refreshToken');

    const refresh = verifyToken(cookieValue(res, 'refreshToken'), 'refresh');
    expect(await isRefreshSessionActive('u1', refresh.jti as string)).toBe(
      true,
    );
  });

  it('rotates the refresh token and keeps the old one only briefly', async () => {
    const oldSession = await createRefreshSession('u1');
    const res = mockRes();
    const next = vi.fn();

    await controller.refreshToken(
      requestWithRefreshToken(
        signRefreshToken(
          { userId: 'u1', role: 'user', rememberMe: false },
          oldSession,
        ),
      ),
      res as unknown as Response,
      next as NextFunction,
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);

    const refresh = verifyToken(cookieValue(res, 'refreshToken'), 'refresh');
    expect(refresh.jti).not.toBe(oldSession);
    expect(refresh.rememberMe).toBe(false);
    expect(await isRefreshSessionActive('u1', refresh.jti as string)).toBe(
      true,
    );
    expect(redis.ttls.get(`refresh_session:${oldSession}`)).toBe(
      ROTATION_GRACE_SECONDS,
    );
    expect(verifyToken(cookieValue(res, 'accessToken'), 'access').userId).toBe(
      'u1',
    );
  });

  it('rejects a refresh token whose session was ended', async () => {
    const res = mockRes();
    const next = vi.fn();

    await controller.refreshToken(
      requestWithRefreshToken(
        signRefreshToken({ userId: 'u1', role: 'user' }, 'ended-session'),
      ),
      res as unknown as Response,
      next as NextFunction,
    );

    expectUnauthorized(next);
    expect(res.cookie).not.toHaveBeenCalled();
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });

  it('rejects refresh tokens issued before sessions existed', async () => {
    const legacyToken = jwt.sign(
      { userId: 'u1', role: 'user', rememberMe: true },
      'refresh-secret',
      { expiresIn: '7d' },
    );
    const next = vi.fn();

    await controller.refreshToken(
      requestWithRefreshToken(legacyToken),
      mockRes() as unknown as Response,
      next as NextFunction,
    );

    expectUnauthorized(next);
  });

  it('ends the session on logout so the refresh token stops working', async () => {
    const sessionId = await createRefreshSession('u1');
    const token = signRefreshToken({ userId: 'u1', role: 'user' }, sessionId);
    const res = mockRes();

    await expect(
      controller.logout(
        requestWithRefreshToken(token),
        res as unknown as Response,
      ),
    ).resolves.toMatchObject({ success: true });

    expect(await isRefreshSessionActive('u1', sessionId)).toBe(false);
    expect(res.clearCookie).toHaveBeenCalledTimes(2);

    const next = vi.fn();
    await controller.refreshToken(
      requestWithRefreshToken(token),
      mockRes() as unknown as Response,
      next as NextFunction,
    );
    expectUnauthorized(next);
  });

  it('still clears cookies on logout without a refresh token', async () => {
    const res = mockRes();

    await expect(
      controller.logout(requestWithRefreshToken(), res as unknown as Response),
    ).resolves.toMatchObject({ success: true });
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });
});
