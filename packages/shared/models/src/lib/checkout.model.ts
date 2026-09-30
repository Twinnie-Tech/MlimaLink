export type DiscountType = 'percentage' | 'fixed';

/** A seller's discount code, as the seller dashboard sees it. */
export interface DiscountCode {
  id: string;
  /** Upper case, 4–16 letters or numbers. Unique across the marketplace. */
  code: string;
  type: DiscountType;
  /** Percent off (1–90) or an amount off in USD. */
  value: number;
  /** Least the shopper must spend on this shop's products for the code to work. */
  minSpend?: number;
  usageLimit?: number;
  usedCount: number;
  /** Last day the code works, "YYYY-MM-DD" (UTC). */
  expiresAt?: string;
  active: boolean;
  createdAt: string;
}

export type DiscountCodeInput = Pick<
  DiscountCode,
  'code' | 'type' | 'value' | 'minSpend' | 'usageLimit' | 'expiresAt'
>;

/** One cart line sent to check a code; prices are looked up on the server. */
export interface DiscountCartItem {
  productId: string;
  choices?: Record<string, string>;
  quantity: number;
}

/** What applying a code saves, and which cart lines it covers. */
export interface AppliedDiscount {
  code: string;
  shopName: string;
  type: DiscountType;
  value: number;
  /** Total off, never more than the covered lines cost. */
  amount: number;
  /** The covered lines by their index in the request, with what they cost. */
  lines: { index: number; total: number }[];
}

export const DISCOUNT_CODE_PATTERN = /^[A-Z0-9]{4,16}$/;
export const MAX_PERCENT_OFF = 90;
export const MAX_CART_QUANTITY = 999;
const MAX_AMOUNT = 10_000_000;
const MAX_USAGE_LIMIT = 1_000_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const roundMoney = (value: number) => Math.round(value * 100) / 100;

/** "YYYY-MM-DD" for the given moment, in UTC. */
export const isoDay = (now = new Date()) => now.toISOString().slice(0, 10);

/** What shoppers type, tidied: " harvest10 " → "HARVEST10". */
export const normaliseCode = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() : '';

const isAmount = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isFinite(value) &&
  value > 0 &&
  value <= MAX_AMOUNT;

const isRealDay = (value: string) =>
  ISO_DATE.test(value) &&
  new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

/** Checks a seller's new code. Returns it tidied, or a message saying what to fix. */
export function parseDiscountCodeInput(
  value: unknown,
  now = new Date(),
): { discount: DiscountCodeInput } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;

  const code = normaliseCode(input.code);
  if (!DISCOUNT_CODE_PATTERN.test(code)) {
    return { error: 'Use 4–16 letters or numbers for the code, no spaces.' };
  }

  const type = input.type;
  if (type !== 'percentage' && type !== 'fixed') {
    return { error: 'Choose a percentage or a fixed amount off.' };
  }

  const amount = input.value;
  if (type === 'percentage') {
    if (
      !Number.isInteger(amount) ||
      (amount as number) < 1 ||
      (amount as number) > MAX_PERCENT_OFF
    ) {
      return {
        error: `Percentage off must be a whole number from 1 to ${MAX_PERCENT_OFF}.`,
      };
    }
  } else if (!isAmount(amount)) {
    return { error: 'Amount off must be more than 0.' };
  }

  const discount: DiscountCodeInput = {
    code,
    type,
    value: type === 'fixed' ? roundMoney(amount as number) : (amount as number),
  };

  if (input.minSpend !== undefined && input.minSpend !== null) {
    if (!isAmount(input.minSpend)) {
      return { error: 'Minimum spend must be more than 0.' };
    }
    discount.minSpend = roundMoney(input.minSpend);
  }

  if (input.usageLimit !== undefined && input.usageLimit !== null) {
    const limit = input.usageLimit;
    if (
      !Number.isInteger(limit) ||
      (limit as number) < 1 ||
      (limit as number) > MAX_USAGE_LIMIT
    ) {
      return { error: 'Usage limit must be a whole number, 1 or more.' };
    }
    discount.usageLimit = limit as number;
  }

  if (input.expiresAt !== undefined && input.expiresAt !== null) {
    const day = input.expiresAt;
    if (typeof day !== 'string' || !isRealDay(day)) {
      return { error: 'Expiry must be a date.' };
    }
    if (day < isoDay(now)) {
      return { error: 'Expiry can’t be in the past.' };
    }
    discount.expiresAt = day;
  }

  return { discount };
}

/** Why a code can't be used right now, for the shopper; undefined when it can. */
export function discountUnavailable(
  code: Pick<DiscountCode, 'active' | 'expiresAt' | 'usageLimit' | 'usedCount'>,
  now = new Date(),
): string | undefined {
  if (!code.active) return 'This code isn’t active right now.';
  if (code.expiresAt && code.expiresAt < isoDay(now)) {
    return 'This code has expired.';
  }
  if (code.usageLimit !== undefined && code.usedCount >= code.usageLimit) {
    return 'This code has been used up.';
  }
  return undefined;
}

/** Whether a code is live, paused, expired or used up, for the seller's list. */
export function discountStatus(
  code: Pick<DiscountCode, 'active' | 'expiresAt' | 'usageLimit' | 'usedCount'>,
  now = new Date(),
): 'active' | 'paused' | 'expired' | 'used up' {
  if (code.expiresAt && code.expiresAt < isoDay(now)) return 'expired';
  if (code.usageLimit !== undefined && code.usedCount >= code.usageLimit) {
    return 'used up';
  }
  return code.active ? 'active' : 'paused';
}

/** "10% off" or "$5.00 off". */
export function describeDiscount(
  code: Pick<DiscountCode, 'type' | 'value'>,
): string {
  return code.type === 'percentage'
    ? `${code.value}% off`
    : `${usd.format(code.value)} off`;
}

/**
 * What the code takes off the covered lines' subtotal. Zero when the minimum spend
 * isn't met; a fixed amount never takes off more than the lines cost.
 */
export function discountAmount(
  code: Pick<DiscountCode, 'type' | 'value' | 'minSpend'>,
  eligibleSubtotal: number,
): number {
  if (eligibleSubtotal <= 0) return 0;
  if (code.minSpend !== undefined && eligibleSubtotal < code.minSpend) return 0;
  const off =
    code.type === 'percentage'
      ? (eligibleSubtotal * code.value) / 100
      : code.value;
  return roundMoney(Math.min(off, eligibleSubtotal));
}

/** Splits a discount across lines in proportion to what they cost; the parts add up exactly. */
export function allocateDiscount(amount: number, totals: number[]): number[] {
  const sum = totals.reduce((acc, total) => acc + total, 0);
  if (amount <= 0 || sum <= 0) return totals.map(() => 0);
  let left = roundMoney(amount);
  return totals.map((total, index) => {
    if (index === totals.length - 1) return left;
    const part = roundMoney((amount * total) / sum);
    left = roundMoney(left - part);
    return part;
  });
}

/** Totals for the order summary. `share` is how much of each line is paid when ordering. */
export function paymentSplit(
  lines: { total: number; share: number; discount?: number }[],
): {
  subtotal: number;
  discount: number;
  total: number;
  payNow: number;
  onDelivery: number;
} {
  let subtotal = 0;
  let discount = 0;
  let payNow = 0;
  for (const line of lines) {
    const off = line.discount ?? 0;
    subtotal += line.total;
    discount += off;
    payNow += roundMoney((line.total - off) * line.share);
  }
  const total = roundMoney(subtotal - discount);
  payNow = roundMoney(payNow);
  return {
    subtotal: roundMoney(subtotal),
    discount: roundMoney(discount),
    total,
    payNow,
    onDelivery: roundMoney(total - payNow),
  };
}
