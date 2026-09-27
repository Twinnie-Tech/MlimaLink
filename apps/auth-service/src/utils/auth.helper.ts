import { createHash, randomBytes, randomInt } from 'crypto';
import { readFile } from 'fs/promises';
import { join } from 'path';
import type { NextFunction, Request, Response } from 'express';
import type { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import ejs from 'ejs';
import { validationError } from '@org/errors';
import { ensureRedisConnected, redisClient } from './redis.client';
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
): Promise<string> {
  await ensureRedisConnected();

  const otp = randomInt(1000, 9999).toString();

  await sendEmail(email, 'Verify your email', template, { name, otp });
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

function buildResetLink(token: string): string {
  const base =
    process.env.RESET_PASSWORD_URL ??
    `http://localhost:${process.env.AUTH_PORT ?? 3334}/api/auth/reset-password`;
  return `${base}?token=${encodeURIComponent(token)}`;
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

    const user = await prisma.users.findUnique({ where: { email } });

    if (user && user.role === userType) {
      await checkOtpRegistration(email, next);
      await trackOtp(email, next);

      const token = randomBytes(32).toString('hex');
      const tokenHash = hashResetToken(token);
      const userTokenKey = `password_reset_user:${user.id}`;

      const previousHash = await redisClient.get(userTokenKey);
      if (previousHash) {
        await redisClient.del(`password_reset:${previousHash}`);
      }

      await redisClient.set(
        `password_reset:${tokenHash}`,
        user.id,
        'EX',
        RESET_TOKEN_TTL_SECONDS,
      );
      await redisClient.set(
        userTokenKey,
        tokenHash,
        'EX',
        RESET_TOKEN_TTL_SECONDS,
      );

      await sendEmail(
        email,
        'Reset your MlimaLink password',
        'forgot_password',
        {
          name: user.name,
          resetLink: buildResetLink(token),
          expiresInMinutes: RESET_TOKEN_TTL_SECONDS / 60,
        },
      );

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
): Promise<void> {
  try {
    const token = typeof req.query.token === 'string' ? req.query.token : '';

    let tokenValid = false;
    if (token) {
      await ensureRedisConnected();
      tokenValid =
        (await redisClient.exists(
          `password_reset:${hashResetToken(token)}`,
        )) === 1;
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
      loginUrl: `${userUiUrl()}/login`,
      forgotPasswordUrl: `${userUiUrl()}/forgot-password`,
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

    const tokenKey = `password_reset:${hashResetToken(token)}`;
    const userId = await redisClient.get(tokenKey);

    if (!userId) {
      throw validationError('Invalid or expired reset link!');
    }

    const user = await prisma.users.findUnique({ where: { id: userId } });

    if (!user) {
      throw validationError('Invalid or expired reset link!');
    }

    if (user.password && (await bcrypt.compare(password, user.password))) {
      throw validationError(
        'New password must be different from your current password!',
      );
    }

    await prisma.users.update({
      where: { id: userId },
      data: { password: await hashPassword(password) },
    });

    await redisClient.del(tokenKey, `password_reset_user:${userId}`);

    // Sent in the background so a slow or failing mail server never blocks the reset.
    void sendPasswordChangedEmail(user).catch((emailError: unknown) => {
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
