import {
  allocateDiscount,
  describeDiscount,
  discountAmount,
  discountScope,
  discountStatus,
  discountUnavailable,
  normaliseCode,
  parseDiscountCodeInput,
  paymentSplit,
} from './checkout.model.js';

const now = new Date('2026-09-30T09:00:00Z');
const errorOf = (input: unknown) => {
  const result = parseDiscountCodeInput(input, now);
  return 'error' in result ? result.error : null;
};

describe('parseDiscountCodeInput', () => {
  it('tidies a valid code', () => {
    expect(
      parseDiscountCodeInput(
        {
          code: ' harvest10 ',
          type: 'fixed',
          value: 5.005,
          minSpend: 20,
          usageLimit: 50,
          expiresAt: '2026-10-31',
        },
        now,
      ),
    ).toEqual({
      discount: {
        code: 'HARVEST10',
        type: 'fixed',
        value: 5.01,
        minSpend: 20,
        usageLimit: 50,
        expiresAt: '2026-10-31',
      },
    });
  });

  it('explains what to fix', () => {
    const base = { code: 'SAVE10', type: 'percentage', value: 10 };
    expect(errorOf({ ...base, code: 'NO SPACES' })).toMatch(/4–16 letters/);
    expect(errorOf({ ...base, type: 'free' })).toMatch(/percentage or a fixed/);
    expect(errorOf({ ...base, value: 95 })).toMatch(/1 to 90/);
    expect(errorOf({ ...base, value: 12.5 })).toMatch(/whole number/);
    expect(errorOf({ ...base, type: 'fixed', value: 0 })).toMatch(
      /more than 0/,
    );
    expect(errorOf({ ...base, usageLimit: 0 })).toMatch(/Usage limit/);
    expect(errorOf({ ...base, expiresAt: '2026-09-29' })).toMatch(/past/);
    expect(errorOf({ ...base, expiresAt: '2026-02-30' })).toMatch(
      /must be a date/,
    );
    expect(errorOf({ ...base, expiresAt: '2026-09-30' })).toBeNull();
  });
});

describe('codes limited to chosen products', () => {
  const base = { code: 'SHOES15', type: 'percentage', value: 15 };
  const SHOE = '66f0000000000000000000aa';
  const HAT = '66f0000000000000000000bb';

  it('keeps each chosen product once', () => {
    expect(
      parseDiscountCodeInput({ ...base, productIds: [SHOE, HAT, SHOE] }, now),
    ).toEqual({ discount: { ...base, productIds: [SHOE, HAT] } });
  });

  it('treats an empty choice as the whole shop', () => {
    expect(parseDiscountCodeInput({ ...base, productIds: [] }, now)).toEqual({
      discount: base,
    });
  });

  it('rejects ids that are not products', () => {
    expect(errorOf({ ...base, productIds: ['3'] })).toMatch(/couldn’t be read/);
    expect(errorOf({ ...base, productIds: SHOE })).toMatch(/couldn’t be read/);
  });

  it('says what an applied code covers', () => {
    const shopName = 'Mlima Boutique';
    expect(discountScope({ shopName })).toBe('Mlima Boutique products');
    expect(discountScope({ shopName, productNames: ['Hat'] })).toBe('Hat');
    expect(discountScope({ shopName, productNames: ['Sneakers', 'Hat'] })).toBe(
      'Sneakers and Hat',
    );
    expect(
      discountScope({ shopName, productNames: ['Sneakers', 'Hat', 'Scarf'] }),
    ).toBe('selected Mlima Boutique products');
  });
});

describe('using a code', () => {
  const live = { active: true, usedCount: 0 };

  it('says why a code cannot be used', () => {
    expect(discountUnavailable(live, now)).toBeUndefined();
    expect(discountUnavailable({ ...live, active: false }, now)).toMatch(
      /isn’t active/,
    );
    expect(
      discountUnavailable({ ...live, expiresAt: '2026-09-29' }, now),
    ).toMatch(/expired/);
    expect(
      discountUnavailable({ ...live, expiresAt: '2026-09-30' }, now),
    ).toBeUndefined();
    expect(
      discountUnavailable({ ...live, usageLimit: 3, usedCount: 3 }, now),
    ).toMatch(/used up/);
  });

  it('labels codes for the seller', () => {
    expect(discountStatus(live, now)).toBe('active');
    expect(discountStatus({ ...live, active: false }, now)).toBe('paused');
    expect(
      discountStatus({ ...live, active: false, expiresAt: '2026-01-01' }, now),
    ).toBe('expired');
    expect(discountStatus({ ...live, usageLimit: 1, usedCount: 1 }, now)).toBe(
      'used up',
    );
    expect(describeDiscount({ type: 'percentage', value: 15 })).toBe('15% off');
    expect(describeDiscount({ type: 'fixed', value: 1500 })).toBe(
      '$1,500.00 off',
    );
  });

  it('works out the amount off', () => {
    expect(discountAmount({ type: 'percentage', value: 10 }, 199.99)).toBe(20);
    expect(discountAmount({ type: 'fixed', value: 50 }, 30)).toBe(30);
    expect(
      discountAmount({ type: 'fixed', value: 5, minSpend: 40 }, 39.99),
    ).toBe(0);
    expect(discountAmount({ type: 'fixed', value: 5, minSpend: 40 }, 40)).toBe(
      5,
    );
    expect(normaliseCode(' save10 ')).toBe('SAVE10');
  });
});

describe('order totals', () => {
  it('spreads a discount across lines so the parts add up', () => {
    const parts = allocateDiscount(10, [30, 30, 30]);
    expect(parts).toEqual([3.33, 3.33, 3.34]);
    expect(allocateDiscount(0, [10])).toEqual([0]);
  });

  it('splits what is paid now and on delivery', () => {
    expect(
      paymentSplit([
        { total: 100, share: 1, discount: 10 },
        { total: 60, share: 0.5 },
        { total: 40, share: 0 },
      ]),
    ).toEqual({
      subtotal: 200,
      discount: 10,
      total: 190,
      payNow: 120,
      onDelivery: 70,
    });
  });
});
