import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import ejs from 'ejs';
import type { FakeRedis } from '../testing/fake-redis';
import { handleForgotPassword, handleResetPassword } from './auth.helper';
import { redisClient } from './redis.client';
import { endAllRefreshSessions } from './refresh-sessions';
import { sendEmail } from './send-email';

vi.mock('./send-email', () => ({ sendEmail: vi.fn() }));
vi.mock('./refresh-sessions', () => ({ endAllRefreshSessions: vi.fn() }));
vi.mock('./redis.client', async () => {
  const { createFakeRedis } = await vi.importActual<
    typeof import('../testing/fake-redis')
  >('../testing/fake-redis');
  return {
    ensureRedisConnected: async () => undefined,
    redisClient: createFakeRedis(),
  };
});

const redis = redisClient as unknown as FakeRedis;
const hash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

const seller = {
  id: 's1',
  name: 'Amina Otieno',
  email: 'amina@example.com',
  password: bcrypt.hashSync('OldSecret123!', 4),
  shop: { name: 'Mlima Fresh' },
};

function mockRes() {
  const res = {
    status: vi.fn(() => res),
    json: vi.fn(() => res),
  };
  return res as unknown as Response & typeof res;
}

function mockPrisma(found: typeof seller | null = seller) {
  return {
    sellers: {
      findUnique: vi.fn(async () => found),
      update: vi.fn(async () => found),
    },
    users: {
      findUnique: vi.fn(async () => null),
      update: vi.fn(),
    },
  } as unknown as PrismaClient & {
    sellers: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    users: {
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
}

async function forgot(prisma: PrismaClient, email = seller.email) {
  const res = mockRes();
  const next = vi.fn() as NextFunction;
  await handleForgotPassword(
    { body: { email } } as Request,
    res,
    next,
    'seller',
    prisma,
  );
  return { res, next };
}

/** The token from the reset link in the last email sent. */
function tokenFromEmail(): string {
  const data = vi.mocked(sendEmail).mock.calls.at(-1)?.[3] as {
    resetLink: string;
  };
  return new URL(data.resetLink).searchParams.get('token') ?? '';
}

async function reset(prisma: PrismaClient, token: string) {
  const res = mockRes();
  const next = vi.fn() as NextFunction;
  await handleResetPassword(
    {
      body: {
        token,
        password: 'NewSecret123!',
        confirmPassword: 'NewSecret123!',
      },
    } as Request,
    res,
    next,
    prisma,
    'seller',
  );
  return { res, next };
}

describe('seller forgot password', () => {
  beforeEach(() => {
    redis.reset();
    vi.mocked(sendEmail).mockReset();
    vi.mocked(sendEmail).mockResolvedValue(undefined);
    vi.mocked(endAllRefreshSessions).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emails a seller-branded reset link naming the shop', async () => {
    const prisma = mockPrisma();

    const { res, next } = await forgot(prisma);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(prisma.sellers.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: seller.email } }),
    );
    expect(prisma.users.findUnique).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledWith(
      seller.email,
      'Reset your MlimaLink seller account password',
      'seller_forgot_password',
      {
        name: 'Amina Otieno',
        email: seller.email,
        shopName: 'Mlima Fresh',
        resetLink: expect.stringMatching(
          /\/api\/auth\/reset-password\/seller\?token=[a-f0-9]{64}$/,
        ),
        expiresInMinutes: 15,
      },
    );
  });

  it('stores the token under seller-only keys for 15 minutes', async () => {
    await forgot(mockPrisma());
    const tokenHash = hash(tokenFromEmail());

    expect(redis.strings.get(`seller_password_reset:${tokenHash}`)).toBe('s1');
    expect(redis.strings.get('seller_password_reset_owner:s1')).toBe(tokenHash);
    expect(redis.ttls.get(`seller_password_reset:${tokenHash}`)).toBe(900);
    expect(redis.strings.has(`password_reset:${tokenHash}`)).toBe(false);
  });

  it('gives the same answer for an unknown email without sending anything', async () => {
    const { res } = await forgot(mockPrisma(null), 'nobody@example.com');

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message:
        'If an account exists for this email, a password reset link has been sent.',
    });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('says when the seller has not set up a shop yet', async () => {
    await forgot(mockPrisma({ ...seller, shop: null as never }));

    expect(sendEmail).toHaveBeenCalledWith(
      seller.email,
      expect.any(String),
      'seller_forgot_password',
      expect.objectContaining({ shopName: null }),
    );
  });

  it('only keeps the newest link working', async () => {
    const prisma = mockPrisma();
    await forgot(prisma);
    const firstToken = tokenFromEmail();
    redis.strings.delete(`otp_cooldown:${seller.email}`);

    await forgot(prisma);

    expect(redis.strings.has(`seller_password_reset:${hash(firstToken)}`)).toBe(
      false,
    );
    expect(
      redis.strings.has(`seller_password_reset:${hash(tokenFromEmail())}`),
    ).toBe(true);
  });

  it('rate limits repeat requests', async () => {
    const prisma = mockPrisma();
    await forgot(prisma);

    const { next } = await forgot(prisma);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Please wait 1 minute before requesting a new OTP!',
      }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
});

describe('seller reset password', () => {
  beforeEach(() => {
    redis.reset();
    vi.mocked(sendEmail).mockReset();
    vi.mocked(sendEmail).mockResolvedValue(undefined);
    vi.mocked(endAllRefreshSessions).mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('updates the seller password, signs the shop out everywhere and notifies the seller', async () => {
    const prisma = mockPrisma();
    await forgot(prisma);
    const token = tokenFromEmail();

    const { res, next } = await reset(prisma, token);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(prisma.sellers.update).toHaveBeenCalledWith({
      where: { id: 's1' },
      data: { password: expect.stringMatching(/^\$2[aby]\$/) },
    });
    expect(prisma.users.update).not.toHaveBeenCalled();
    expect(endAllRefreshSessions).toHaveBeenCalledWith('s1');
    expect(redis.strings.has(`seller_password_reset:${hash(token)}`)).toBe(
      false,
    );
    expect(redis.strings.has('seller_password_reset_owner:s1')).toBe(false);
    expect(sendEmail).toHaveBeenLastCalledWith(
      seller.email,
      'Your MlimaLink seller account password was changed',
      'seller_password_changed',
      expect.objectContaining({
        name: 'Amina Otieno',
        email: seller.email,
        shopName: 'Mlima Fresh',
        loginUrl: 'http://localhost:4300/login',
        forgotPasswordUrl: 'http://localhost:4300/forgot-password',
        changedAt: expect.stringContaining('Africa/Nairobi'),
      }),
    );
  });

  it('rejects a buyer reset token', async () => {
    await redis.set(`password_reset:${hash('buyer-token')}`, 's1');

    const { next } = await reset(mockPrisma(), 'buyer-token');

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid or expired reset link!' }),
    );
  });

  it('does not accept a seller token on the buyer reset', async () => {
    await redis.set(`seller_password_reset:${hash('seller-token')}`, 's1');
    const prisma = mockPrisma();
    const next = vi.fn() as NextFunction;

    await handleResetPassword(
      {
        body: {
          token: 'seller-token',
          password: 'NewSecret123!',
          confirmPassword: 'NewSecret123!',
        },
      } as Request,
      mockRes(),
      next,
      prisma,
    );

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid or expired reset link!' }),
    );
    expect(prisma.users.update).not.toHaveBeenCalled();
    expect(prisma.sellers.update).not.toHaveBeenCalled();
  });

  it('still completes the reset when the notice fails to send', async () => {
    const prisma = mockPrisma();
    await forgot(prisma);
    vi.mocked(sendEmail).mockRejectedValue(new Error('SMTP down'));

    const { res } = await reset(prisma, tokenFromEmail());
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.status).toHaveBeenCalledWith(200);
    expect(console.error).toHaveBeenCalledWith(
      '[auth] Failed to send password-changed email:',
      'SMTP down',
    );
  });
});

describe('seller reset templates', () => {
  const assets = join(__dirname, '..', 'assets');
  const render = (file: string, data: Record<string, unknown>) =>
    ejs.render(readFileSync(join(assets, file), 'utf8'), data);

  it('renders the reset link email for a seller account and shop', () => {
    const html = render('email-templates/seller_forgot_password.ejs', {
      name: 'Amina <Otieno>',
      email: 'amina@example.com',
      shopName: 'Mlima Fresh',
      resetLink:
        'http://localhost:3334/api/auth/reset-password/seller?token=abc',
      expiresInMinutes: 15,
    });

    expect(html).toContain('MlimaLink Seller Centre');
    expect(html).toContain('Seller business account');
    expect(html).toContain('Mlima Fresh');
    expect(html).toContain('Amina &lt;Otieno&gt;');
    expect(html).toContain(
      'href="http://localhost:3334/api/auth/reset-password/seller?token=abc"',
    );
    expect(html).toContain('15 minutes');
  });

  it('renders the reset link email before the shop exists', () => {
    const html = render('email-templates/seller_forgot_password.ejs', {
      name: 'Amina',
      email: 'amina@example.com',
      shopName: null,
      resetLink: 'http://localhost/x',
      expiresInMinutes: 15,
    });

    expect(html).toContain('Shop not set up yet');
  });

  it('renders the password changed notice with seller links', () => {
    const html = render('email-templates/seller_password_changed.ejs', {
      name: 'Amina',
      email: 'amina@example.com',
      shopName: 'Mlima Fresh',
      changedAt: 'Monday 28 September 2026 at 10:00 (Africa/Nairobi)',
      loginUrl: 'http://localhost:4300/login',
      forgotPasswordUrl: 'http://localhost:4300/forgot-password',
    });

    expect(html).toContain('Your seller account password was changed');
    expect(html).toContain('Mlima Fresh');
    expect(html).toContain('href="http://localhost:4300/login"');
    expect(html).toContain('href="http://localhost:4300/forgot-password"');
  });

  it('themes the reset page and posts to the seller endpoint', () => {
    const html = render('pages/reset-password.ejs', {
      token: 'abc',
      tokenValid: true,
      seller: true,
      eyebrow: 'MlimaLink Seller Centre · Password reset',
      resetUrl: '/api/auth/reset-password/seller',
      loginUrl: 'http://localhost:4300/login',
      forgotPasswordUrl: 'http://localhost:4300/forgot-password',
    });

    expect(html).toContain('<body class="seller">');
    expect(html).toContain('MlimaLink Seller Centre · Password reset');
    expect(html).toContain('data-reset-url="/api/auth/reset-password/seller"');
    expect(html).toContain('data-login-url="http://localhost:4300/login"');
    expect(html).toContain('seller business');
  });

  it('keeps the buyer reset page unchanged', () => {
    const html = render('pages/reset-password.ejs', {
      token: 'abc',
      tokenValid: true,
      seller: false,
      eyebrow: 'MlimaLink · Password reset',
      resetUrl: '/api/auth/reset-password',
      loginUrl: 'http://localhost:4200/login',
      forgotPasswordUrl: 'http://localhost:4200/forgot-password',
    });

    expect(html).toContain('<body class="">');
    expect(html).toContain('data-reset-url="/api/auth/reset-password"');
    expect(html).not.toContain('seller business');
  });
});
