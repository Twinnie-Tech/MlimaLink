import { createHash, randomBytes, randomInt } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import ejs from 'ejs';
import { validationError } from '@org/errors';
import { ensureRedisConnected, redisClient } from './redis.client';
import { endAllRefreshSessions } from './refresh-sessions';
import { sendEmail } from './send-email';

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** At least 8 chars, with upper, lower, digit, and special character. */
const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const PASSWORD_RULES_MESSAGE =
  'Password must be at least 8 characters and include uppercase, lowercase, a number, and a special character!';
const OTP_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const OTP_COOLDOWN_SECONDS = 60;
const RESET_TOKEN_TTL_SECONDS = 15 * 60;

export type RegistrationUserType = 'user' | 'seller';

export type RegistrationData = {
  name?: string;
  email?: string;
  password?: string;
  phone_number?: string;
  country?: string;
};

export function validateRegistrationData(
  data: RegistrationData,
  userType: RegistrationUserType,
): void {
  const { name, email, password, phone_number, country } = data;

  if (
    !name ||
    !email ||
    !password ||
    (userType === 'seller' && (!phone_number || !country))
  ) {
    throw validationError('Missing required fields!');
  }

  if (!emailRegex.test(email)) {
    throw validationError('Invalid email format!');
  }

  if (!passwordRegex.test(password)) {
    throw validationError(PASSWORD_RULES_MESSAGE);
  }
}

/** Blocks OTP send when lock / spam / cooldown keys are present. */
export async function checkOtpRegistration(
  email: string,
  _next: NextFunction,
): Promise<void> {
  await ensureRedisConnected();

  if (await redisClient.get(`otp_lock:${email}`)) {
    throw validationError(
      'Account locked due to multiple failed attempts! Try again after 30 minutes.',
    );
  }

  if (await redisClient.get(`otp_spam_lock:${email}`)) {
    throw validationError(
      'Too many OTP requests! Please wait 1 hour before requesting again.',
    );
  }

  if (await redisClient.get(`otp_cooldown:${email}`)) {
    throw validationError('Please wait 1 minute before requesting a new OTP!');
  }
}

export async function trackOtp(
  email: string,
  _next: NextFunction,
): Promise<void> {
  await ensureRedisConnected();
  const otpRequest = `otp_request_count:${email}`;
  const otpRequestCount = await redisClient.get(otpRequest);
  if (otpRequestCount && parseInt(otpRequestCount) >= 5) {
    throw validationError(
      'Too many OTP requests! Please wait 1 hour before requesting again.',
    );
  } else {
    await redisClient.set(otpRequest, 1, 'EX', OTP_TTL_SECONDS);
  }
  await redisClient.incr(otpRequest);
}

/** Generate OTP, email it via Gmail template, store in Redis (24h) + cooldown (60s). */
export async function sendOtp(
  name: string,
  email: string,
  template: string,
  subject = 'Verify your email',
): Promise<string> {
  await ensureRedisConnected();

  const otp = randomInt(1000, 9999).toString();

  await sendEmail(email, subject, template, { name, otp });
  await redisClient.set(`otp:${email}`, otp, 'EX', OTP_TTL_SECONDS);
  await redisClient.set(
    `otp_cooldown:${email}`,
    'true',
    'EX',
    OTP_COOLDOWN_SECONDS,
  );

  return otp;
}

/** Welcome email after account is verified and created. */
export async function sendAccountCreatedEmail(user: {
  name: string;
  email: string;
  role?: string | null;
}): Promise<void> {
  await sendEmail(
    user.email,
    'Welcome to MlimaLink — your account is ready',
    'user_account_created',
    {
      name: user.name,
      email: user.email,
      role: user.role ?? 'user',
    },
  );
}

/** Human-readable timestamp for emails, in the app's timezone (default East Africa Time). */
export function formatEmailDate(date: Date): string {
  const timeZone = process.env.APP_TIMEZONE ?? 'Africa/Nairobi';
  const formatted = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone,
  }).format(date);
  return `${formatted} (${timeZone})`;
}

/** Security notice after a password change. */
export async function sendPasswordChangedEmail(
  user: { name: string; email: string },
  changedAt: Date = new Date(),
): Promise<void> {
  await sendEmail(
    user.email,
    'Your MlimaLink password was changed',
    'password_changed',
    {
      name: user.name,
      email: user.email,
      changedAt: formatEmailDate(changedAt),
      loginUrl: `${userUiUrl()}/login`,
      forgotPasswordUrl: `${userUiUrl()}/forgot-password`,
    },
  );
}

/** Security notice after a seller changes their password, naming their shop. */
export async function sendSellerPasswordChangedEmail(
  seller: { name: string; email: string; shopName: string | null },
  changedAt: Date = new Date(),
): Promise<void> {
  await sendEmail(
    seller.email,
    'Your MlimaLink seller account password was changed',
    'seller_password_changed',
    {
      name: seller.name,
      email: seller.email,
      shopName: seller.shopName,
      changedAt: formatEmailDate(changedAt),
      loginUrl: `${sellerUiUrl()}/login`,
      forgotPasswordUrl: `${sellerUiUrl()}/forgot-password`,
    },
  );
}

/** Compare submitted OTP against the value stored in Redis. */
export async function verifyOtp(
  email: string,
  otp: string,
  _next: NextFunction,
): Promise<void> {
  await ensureRedisConnected();

  const storedOtp = await redisClient.get(`otp:${email}`);
  if (!storedOtp) {
    throw validationError('Invalid or expired OTP!');
  }

  const failedAttemptsKey = `otp_failed_attempts:${email}`;
  const failedAttemptsRaw = await redisClient.get(failedAttemptsKey);
  const failedAttempts = failedAttemptsRaw
    ? parseInt(failedAttemptsRaw, 10)
    : 0;

  if (failedAttempts >= 5) {
    await redisClient.set(`otp_lock:${email}`, 'locked', 'EX', 1800);
    throw validationError(
      'Account locked due to multiple failed attempts! Try again after 30 minutes.',
    );
  }

  if (storedOtp !== otp) {
    const attempts = await redisClient.incr(failedAttemptsKey);
    if (attempts === 1) {
      await redisClient.expire(failedAttemptsKey, OTP_TTL_SECONDS);
    }

    if (attempts >= 5) {
      await redisClient.set(`otp_lock:${email}`, 'locked', 'EX', 1800);
      throw validationError(
        'Account locked due to multiple failed attempts! Try again after 30 minutes.',
      );
    }

    throw validationError(`Invalid OTP! ${5 - attempts} attempts remaining.`);
  }

  await redisClient.del(`otp:${email}`, failedAttemptsKey);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

function hashResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Base URL of the customer storefront (user-ui). */
export function userUiUrl(): string {
  return (process.env.USER_UI_URL ?? 'http://localhost:4200').replace(
    /\/+$/,
    '',
  );
}

/** Base URL of the seller dashboard (seller-ui). */
export function sellerUiUrl(): string {
  return (process.env.SELLER_UI_URL ?? 'http://localhost:4300').replace(
    /\/+$/,
    '',
  );
}

/** Where a reset link opens; sellers get their own page under `/seller`. */
function resetPageUrl(account: RegistrationUserType): string {
  const base =
    process.env.RESET_PASSWORD_URL ??
    `http://localhost:${process.env.AUTH_PORT ?? 3334}/api/auth/reset-password`;
  return account === 'seller' ? `${base.replace(/\/+$/, '')}/seller` : base;
}

function buildResetLink(account: RegistrationUserType, token: string): string {
  return `${resetPageUrl(account)}?token=${encodeURIComponent(token)}`;
}

type ResettableAccount = {
  id: string;
  name: string;
  email: string;
  password: string | null;
  /** Sellers only: the shop the account runs, once it exists. */
  shopName: string | null;
};

/**
 * Buyers and sellers live in separate collections and use separate Redis keys,
 * so a buyer's reset link can never change a seller's password or the reverse.
 */
function resetSettings(account: RegistrationUserType) {
  if (account === 'seller') {
    return {
      tokenKey: (tokenHash: string) => `seller_password_reset:${tokenHash}`,
      ownerKey: (id: string) => `seller_password_reset_owner:${id}`,
      loginUrl: `${sellerUiUrl()}/login`,
      forgotPasswordUrl: `${sellerUiUrl()}/forgot-password`,
    };
  }

  return {
    tokenKey: (tokenHash: string) => `password_reset:${tokenHash}`,
    ownerKey: (id: string) => `password_reset_user:${id}`,
    loginUrl: `${userUiUrl()}/login`,
    forgotPasswordUrl: `${userUiUrl()}/forgot-password`,
  };
}

function resetAccounts(account: RegistrationUserType, prisma: PrismaClient) {
  if (account === 'seller') {
    const select = {
      id: true,
      name: true,
      email: true,
      password: true,
      shop: { select: { name: true } },
    } as const;
    const toAccount = (
      seller: {
        id: string;
        name: string;
        email: string;
        password: string;
        shop: { name: string } | null;
      } | null,
    ): ResettableAccount | null =>
      seller && { ...seller, shopName: seller.shop?.name ?? null };

    return {
      ...resetSettings(account),
      findByEmail: async (email: string) =>
        toAccount(
          await prisma.sellers.findUnique({ where: { email }, select }),
        ),
      findById: async (id: string) =>
        toAccount(await prisma.sellers.findUnique({ where: { id }, select })),
      updatePassword: (id: string, password: string) =>
        prisma.sellers.update({ where: { id }, data: { password } }),
    };
  }

  const toAccount = (
    user: {
      id: string;
      name: string;
      email: string;
      password: string | null;
    } | null,
  ): ResettableAccount | null => user && { ...user, shopName: null };

  return {
    ...resetSettings(account),
    findByEmail: async (email: string) => {
      const user = await prisma.users.findUnique({ where: { email } });
      return user?.role === 'user' ? toAccount(user) : null;
    },
    findById: async (id: string) =>
      toAccount(await prisma.users.findUnique({ where: { id } })),
    updatePassword: (id: string, password: string) =>
      prisma.users.update({ where: { id }, data: { password } }),
  };
}

/** Email a one-time reset link. Responds the same whether or not the email exists. */
export async function handleForgotPassword(
  req: Request,
  res: Response,
  next: NextFunction,
  userType: RegistrationUserType,
  prisma: PrismaClient,
): Promise<void> {
  try {
    const { email } = req.body as { email?: string };

    if (!email) {
      throw validationError('Email is required!');
    }

    if (!emailRegex.test(email)) {
      throw validationError('Invalid email format!');
    }

    const accounts = resetAccounts(userType, prisma);
    const account = await accounts.findByEmail(email);

    if (account) {
      await checkOtpRegistration(email, next);
      await trackOtp(email, next);

      const token = randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(token);
      const ownerKey = accounts.ownerKey(account.id);

      const previousHash = await redisClient.get(ownerKey);
      if (previousHash) {
        await redisClient.del(accounts.tokenKey(previousHash));
      }

      await redisClient.set(
        accounts.tokenKey(tokenHash),
        account.id,
        'EX',
        RESET_TOKEN_TTL_SECONDS,
      );
      await redisClient.set(ownerKey, tokenHash, 'EX', RESET_TOKEN_TTL_SECONDS);

      const resetLink = buildResetLink(userType, token);
      const expiresInMinutes = RESET_TOKEN_TTL_SECONDS / 60;

      if (userType === 'seller') {
        await sendEmail(
          email,
          'Reset your MlimaLink seller account password',
          'seller_forgot_password',
          {
            name: account.name,
            email: account.email,
            shopName: account.shopName,
            resetLink,
            expiresInMinutes,
          },
        );
      } else {
        await sendEmail(
          email,
          'Reset your MlimaLink password',
          'forgot_password',
          { name: account.name, resetLink, expiresInMinutes },
        );
      }

      await redisClient.set(
        `otp_cooldown:${email}`,
        'true',
        'EX',
        OTP_COOLDOWN_SECONDS,
      );
    }

    res.status(200).json({
      success: true,
      message:
        'If an account exists for this email, a password reset link has been sent.',
    });
  } catch (error) {
    next(error);
  }
}

/** Serve the page the reset link opens. */
export async function renderResetPasswordPage(
  req: Request,
  res: Response,
  next: NextFunction,
  account: RegistrationUserType = 'user',
): Promise<void> {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';
    const isSeller = account === 'seller';
    const settings = resetSettings(account);

    let tokenValid = false;
    if (token) {
      await ensureRedisConnected();
      tokenValid =
        (await redisClient.exists(settings.tokenKey(hashResetToken(token)))) ===
        1;
    }

    const templatePath = join(
      __dirname,
      'assets',
      'pages',
      'reset-password.ejs',
    );
    const html = ejs.render(await readFile(templatePath, 'utf8'), {
      token,
      tokenValid,
      seller: isSeller,
      eyebrow: isSeller
        ? 'MlimaLink Seller Centre · Password reset'
        : 'MlimaLink · Password reset',
      resetUrl: isSeller
        ? '/api/auth/reset-password/seller'
        : '/api/auth/reset-password',
      loginUrl: settings.loginUrl,
      forgotPasswordUrl: settings.forgotPasswordUrl,
    });
    res
      .status(tokenValid ? 200 : 410)
      .type('html')
      .send(html);
  } catch (error) {
    next(error);
  }
}

/** Validate the reset token and store the new password. */
export async function handleResetPassword(
  req: Request,
  res: Response,
  next: NextFunction,
  prisma: PrismaClient,
  account: RegistrationUserType = 'user',
): Promise<void> {
  try {
    const { token, password, confirmPassword } = req.body as {
      token?: string;
      password?: string;
      confirmPassword?: string;
    };

    if (!token || !password || !confirmPassword) {
      throw validationError(
        'Token, password, and confirm password are required!',
      );
    }

    if (password !== confirmPassword) {
      throw validationError('Passwords do not match!');
    }

    if (!passwordRegex.test(password)) {
      throw validationError(PASSWORD_RULES_MESSAGE);
    }

    await ensureRedisConnected();

    const accounts = resetAccounts(account, prisma);
    const tokenKey = accounts.tokenKey(hashResetToken(token));
    const ownerId = await redisClient.get(tokenKey);

    if (!ownerId) {
      throw validationError('Invalid or expired reset link!');
    }

    const owner = await accounts.findById(ownerId);

    if (!owner) {
      throw validationError('Invalid or expired reset link!');
    }

    if (owner.password && (await bcrypt.compare(password, owner.password))) {
      throw validationError(
        'New password must be different from your current password!',
      );
    }

    await accounts.updatePassword(ownerId, await hashPassword(password));

    await redisClient.del(tokenKey, accounts.ownerKey(ownerId));
    await endAllRefreshSessions(ownerId);

    // Sent in the background so a slow or failing mail server never blocks the reset.
    const notify =
      account === 'seller'
        ? sendSellerPasswordChangedEmail(owner)
        : sendPasswordChangedEmail(owner);
    void notify.catch((emailError: unknown) => {
      console.error(
        '[auth] Failed to send password-changed email:',
        emailError instanceof Error ? emailError.message : emailError,
      );
    });

    res.status(200).json({
      success: true,
      message: 'Password reset successfully. You can now log in.',
    });
  } catch (error) {
    next(error);
  }
}
