import type { CookieOptions, Response } from 'express';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Shared auth cookie settings: 7 days, httpOnly, secure, sameSite none. */
export const authCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'none',
  maxAge: SEVEN_DAYS_MS,
};

export function setCookie(
  res: Response,
  name: string,
  value: string,
  options: CookieOptions = authCookieOptions,
): void {
  res.cookie(name, value, {
    ...authCookieOptions,
    ...options,
  });
}
