/** Checks discount codes with the shop API, reached through the gateway at /api/discount-codes. */

import type {
  ApiResponse,
  AppliedDiscount,
  DiscountCartItem,
} from '@org/models';

export class DiscountRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'DiscountRequestError';
  }
}

export async function applyDiscountCode(
  code: string,
  items: DiscountCartItem[],
): Promise<AppliedDiscount> {
  let response: Response;
  try {
    response = await fetch('/api/discount-codes/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, items }),
    });
  } catch {
    throw new DiscountRequestError(
      'Could not reach the server to check your code.',
      0,
    );
  }

  const data = (await response.json().catch(() => null)) as
    (Partial<ApiResponse<AppliedDiscount>> & { error?: string }) | null;

  if (!response.ok || !data?.success || !data.data) {
    const message =
      response.status === 429
        ? 'Too many tries. Wait a minute, then try your code again.'
        : (data?.error ??
          (response.status >= 500
            ? 'We couldn’t check your code right now. Please try again later.'
            : 'That code didn’t work.'));
    throw new DiscountRequestError(message, response.status);
  }

  return data.data;
}
