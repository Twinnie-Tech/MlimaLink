import {
  randomBytes,
  randomInt,
  scrypt as scryptCallback,
} from 'crypto';
import { promisify } from 'util';
import type { NextFunction } from 'express';
import { validationError } from '@org/errors';
import { ensureRedisConnected, redisClient } from './redis.client';
import { sendEmail } from './send-email';

const scrypt = promisify(scryptCallback);

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_TTL_SECONDS = 60 * 60 * 24; // 24 hours
const OTP_COOLDOWN_SECONDS = 60;

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
}

/** Blocks OTP send when lock / spam / cooldown keys are present. */
export async function checkOtpRegistration(
  email: string,
  next: NextFunction,
): Promise<void> {
  await ensureRedisConnected();

  if (await redisClient.get(`otp_lock:${email}`)) {
    return next(
      validationError(
        'Account locked due to multiple failed attempts! Try again after 30 minutes.',
      ),
    );
  }

  if (await redisClient.get(`otp_spam_lock:${email}`)) {
    return next(
      validationError(
        'Too many OTP requests! Please wait 1 hour before requesting again.',
      ),
    );
  }

  if (await redisClient.get(`otp_cooldown:${email}`)) {
    return next(
      validationError('Please wait 1 minute before requesting a new OTP!'),
    );
  }
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

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = (await scrypt(password, salt, 64)) as Buffer;
  return `${salt}:${derivedKey.toString('hex')}`;
}
