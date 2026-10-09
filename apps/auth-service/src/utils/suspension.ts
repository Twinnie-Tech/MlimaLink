import { forbidden } from '@org/errors';

export const SUSPENDED_MESSAGE =
  'This account has been suspended. Please contact MlimaLink support.';

/** Throws a 403 for accounts an admin has suspended. */
export function assertNotSuspended(account: { suspended?: boolean }): void {
  if (account.suspended) {
    throw forbidden(SUSPENDED_MESSAGE);
  }
}
