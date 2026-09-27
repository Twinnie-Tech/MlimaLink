import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import ejs from 'ejs';
import { formatEmailDate, handleResetPassword } from './auth.helper';
import { endAllRefreshSessions } from './refresh-sessions';
import { sendEmail } from './send-email';

vi.mock('./send-email', () => ({ sendEmail: vi.fn() }));
vi.mock('./refresh-sessions', () => ({ endAllRefreshSessions: vi.fn() }));
vi.mock('./redis.client', () => ({
  ensureRedisConnected: vi.fn(),
  redisClient: {
    get: vi.fn(async (key: string) =>
      key ===
      `password_reset:${createHash('sha256').update('good-token').digest('hex')}`
        ? 'u1'
        : null,
    ),
    del: vi.fn(),
  },
}));

const user = {
  id: 'u1',
  name: 'Jane Doe',
  email: 'jane@example.com',
  password: null,
};

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res as unknown as Response & typeof res;
}

function mockPrisma() {
  return {
    users: {
      findUnique: vi.fn(async () => user),
      update: vi.fn(async () => user),
    },
  } as unknown as PrismaClient & {
    users: { update: ReturnType<typeof vi.fn> };
  };
}

const resetBody = {
  token: 'good-token',
  password: 'NewSecret123!',
  confirmPassword: 'NewSecret123!',
};

describe('password changed notification', () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockReset();
    vi.mocked(endAllRefreshSessions).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails the user after the password is reset', async () => {
    vi.mocked(sendEmail).mockResolvedValue(undefined);
    const res = mockRes();
    const next = vi.fn() as NextFunction;
    const prisma = mockPrisma();

    await handleResetPassword(
      { body: resetBody } as Request,
      res,
      next,
      prisma,
    );

    expect(next).not.toHaveBeenCalled();
    expect(prisma.users.update).toHaveBeenCalled();
    expect(endAllRefreshSessions).toHaveBeenCalledWith('u1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(sendEmail).toHaveBeenCalledWith(
      'jane@example.com',
      'Your MlimaLink password was changed',
      'password_changed',
      expect.objectContaining({
        name: 'Jane Doe',
        email: 'jane@example.com',
        loginUrl: 'http://localhost:4200/login',
        forgotPasswordUrl: 'http://localhost:4200/forgot-password',
        changedAt: expect.stringContaining('Africa/Nairobi'),
      }),
    );
  });

  it('still completes the reset when the email fails to send', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('SMTP down'));
    const res = mockRes();
    const next = vi.fn() as NextFunction;

    await handleResetPassword(
      { body: resetBody } as Request,
      res,
      next,
      mockPrisma(),
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(console.error).toHaveBeenCalledWith(
      '[auth] Failed to send password-changed email:',
      'SMTP down',
    );
  });

  it('does not email anyone when the reset link is invalid', async () => {
    const next = vi.fn() as NextFunction;

    await handleResetPassword(
      { body: { ...resetBody, token: 'bad-token' } } as Request,
      mockRes(),
      next,
      mockPrisma(),
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid or expired reset link!' }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('formats the change time in East Africa Time by default', () => {
    const formatted = formatEmailDate(new Date('2026-09-27T11:54:00Z'));

    expect(formatted).toContain('27 September 2026');
    expect(formatted).toMatch(/14:54 \(Africa\/Nairobi\)$/);
  });

  it('renders the email template', () => {
    const template = readFileSync(
      join(
        __dirname,
        '..',
        'assets',
        'email-templates',
        'password_changed.ejs',
      ),
      'utf8',
    );
    const html = ejs.render(template, {
      name: 'Jane <Doe>',
      email: 'jane@example.com',
      changedAt: 'Sunday 27 September 2026 at 14:54 (Africa/Nairobi)',
      loginUrl: 'http://localhost:4200/login',
      forgotPasswordUrl: 'http://localhost:4200/forgot-password',
    });

    expect(html).toContain('Jane &lt;Doe&gt;');
    expect(html).toContain('14:54 (Africa/Nairobi)');
    expect(html).toContain('href="http://localhost:4200/login"');
    expect(html).toContain('href="http://localhost:4200/forgot-password"');
  });
});
