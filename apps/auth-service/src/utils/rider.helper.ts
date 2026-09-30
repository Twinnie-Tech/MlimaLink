import type { Prisma } from '@prisma/client';
import { validationError } from '@org/errors';
import { validateRegistrationData, type RegistrationData } from './auth.helper';

/** International format: "+" then country code and number, 8 to 15 digits in total. */
const phoneRegex = /^\+[1-9]\d{7,14}$/;

/** Public rider fields returned to clients (never the password hash). */
export const safeRiderSelect = {
  id: true,
  name: true,
  email: true,
  phone_number: true,
  vehicle: true,
  zones: true,
  available: true,
  createdAt: true,
} satisfies Prisma.ridersSelect;

export type SafeRider = Prisma.ridersGetPayload<{
  select: typeof safeRiderSelect;
}>;

export function validateRiderRegistration(data: RegistrationData): void {
  validateRegistrationData(data, 'rider');

  if (!phoneRegex.test(data.phone_number ?? '')) {
    throw validationError(
      'Enter a valid phone number with its country code, e.g. +254712345678!',
    );
  }
}
