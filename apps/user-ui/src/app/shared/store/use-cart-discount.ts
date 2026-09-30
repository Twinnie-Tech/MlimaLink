'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AppliedDiscount, DiscountCartItem } from '@org/models';
import { allocateDiscount } from '@org/models/checkout';
import { applyDiscountCode } from '../utils/discount-api';
import { type CartItem, useShopStore } from './shop-store';

/** Waits for quantity clicks to settle so each burst costs one check. */
const RECHECK_DELAY_MS = 400;

type Check = {
  /** The code and cart the result belongs to. */
  key: string;
  applied?: AppliedDiscount;
  error?: string;
};

const toDiscountItem = ({
  product,
  variant,
  quantity,
}: CartItem): DiscountCartItem => ({
  productId: product.id,
  quantity,
  ...(variant && { choices: variant.choices }),
});

/**
 * The shopper's discount code checked against the current cart. Prices come from
 * the server, so a code is only applied once the server has confirmed it.
 */
export function useCartDiscount() {
  const { ready, cart, discountCode, setDiscountCode } = useShopStore();
  const [check, setCheck] = useState<Check | null>(null);
  const [attempt, setAttempt] = useState(0);

  const items = useMemo(() => cart.map(toDiscountItem), [cart]);
  const key = JSON.stringify([discountCode, items, attempt]);

  useEffect(() => {
    if (!ready || !discountCode || items.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      applyDiscountCode(discountCode, items).then(
        (applied) => !cancelled && setCheck({ key, applied }),
        (error: unknown) =>
          !cancelled &&
          setCheck({
            key,
            error:
              error instanceof Error ? error.message : 'That code didn’t work.',
          }),
      );
    }, RECHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [ready, key, discountCode, items]);

  const current = discountCode && check?.key === key ? check : undefined;
  const applied = current?.applied;

  /** Discount on each cart line, in cart order. */
  const lineDiscounts = useMemo(() => {
    const perLine = cart.map(() => 0);
    if (!applied) return perLine;
    const parts = allocateDiscount(
      applied.amount,
      applied.lines.map((line) => line.total),
    );
    applied.lines.forEach((line, i) => {
      if (line.index < perLine.length) perLine[line.index] = parts[i];
    });
    return perLine;
  }, [applied, cart]);

  const apply = useCallback(
    (code: string) => {
      setCheck(null);
      setAttempt((count) => count + 1);
      setDiscountCode(code);
    },
    [setDiscountCode],
  );
  const remove = useCallback(() => {
    setCheck(null);
    setDiscountCode(null);
  }, [setDiscountCode]);

  return {
    code: discountCode,
    applied,
    error: current?.error,
    checking: Boolean(discountCode && items.length > 0 && !current),
    lineDiscounts,
    apply,
    remove,
  };
}
