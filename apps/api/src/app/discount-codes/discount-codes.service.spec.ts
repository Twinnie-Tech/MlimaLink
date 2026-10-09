import { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma.service';
import { DiscountCodesService, parseCartItems } from './discount-codes.service';

const SHOP_ID = '66f000000000000000000001';
const CODE_ID = '66f0000000000000000000cc';
const SHOE_ID = '66f0000000000000000000aa';
const HAT_ID = '66f0000000000000000000bb';
const now = new Date('2026-09-30T09:00:00Z');

function codeRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: CODE_ID,
    code: 'HARVEST10',
    type: 'percentage',
    value: 10,
    minSpend: null,
    usageLimit: null,
    usedCount: 0,
    expiresAt: null,
    active: true,
    shopId: SHOP_ID,
    shop: { name: 'Mlima Boutique' },
    createdAt: new Date('2026-09-01T08:00:00Z'),
    updatedAt: new Date('2026-09-01T08:00:00Z'),
    ...overrides,
  };
}

const shoe = {
  id: SHOE_ID,
  name: 'Sneakers',
  price: 45,
  salePrice: 40,
  options: [
    {
      name: 'Size',
      values: [
        { label: '42', swatch: null, imageIndex: null },
        { label: '44', swatch: null, imageIndex: null },
      ],
    },
  ],
  variants: [
    { sku: null, choices: { Size: '42' }, price: null, stock: 3 },
    { sku: null, choices: { Size: '44' }, price: 50, stock: 3 },
  ],
};
const hat = {
  id: HAT_ID,
  name: 'Hat',
  price: 20,
  salePrice: null,
  options: [],
  variants: [],
};

describe('DiscountCodesService', () => {
  const discount_codes = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const products = { findMany: vi.fn(), count: vi.fn() };
  const service = new DiscountCodesService({
    discount_codes,
    products,
  } as unknown as PrismaService);

  beforeEach(() => {
    Object.values(discount_codes).forEach((mock) => mock.mockReset());
    Object.values(products).forEach((mock) => mock.mockReset());
    discount_codes.findUnique.mockResolvedValue(codeRecord());
    products.findMany.mockResolvedValue([shoe, hat]);
  });

  describe('apply', () => {
    it('prices the cart from the database and covers only the shop’s products', async () => {
      const applied = await service.apply(
        ' harvest10 ',
        [
          { productId: SHOE_ID, choices: { Size: '44' }, quantity: 2 },
          { productId: '3', quantity: 1 },
          { productId: HAT_ID, quantity: 1 },
        ],
        now,
      );

      expect(applied).toEqual({
        code: 'HARVEST10',
        shopName: 'Mlima Boutique',
        type: 'percentage',
        value: 10,
        amount: 12,
        lines: [
          { index: 0, total: 100 },
          { index: 2, total: 20 },
        ],
      });
      expect(discount_codes.findUnique.mock.calls[0][0].where).toEqual({
        code: 'HARVEST10',
      });
      expect(products.findMany.mock.calls[0][0].where).toEqual({
        id: { in: [SHOE_ID, HAT_ID] },
        shopId: SHOP_ID,
      });
    });

    it('uses the sale price when the variant has no price of its own', async () => {
      const applied = await service.apply(
        'HARVEST10',
        [{ productId: SHOE_ID, choices: { Size: '42' }, quantity: 1 }],
        now,
      );
      expect(applied.lines).toEqual([{ index: 0, total: 40 }]);
      expect(applied.amount).toBe(4);
    });

    it('explains why a code can’t be used', async () => {
      const cart = [{ productId: HAT_ID, quantity: 1 }];

      discount_codes.findUnique.mockResolvedValue(null);
      await expect(service.apply('NOPE1234', cart, now)).rejects.toMatchObject({
        statusCode: 404,
        message: 'We couldn’t find that code.',
      });

      discount_codes.findUnique.mockResolvedValue(
        codeRecord({ expiresAt: '2026-09-29' }),
      );
      await expect(service.apply('HARVEST10', cart, now)).rejects.toMatchObject(
        { statusCode: 400, message: 'This code has expired.' },
      );

      discount_codes.findUnique.mockResolvedValue(
        codeRecord({ usageLimit: 5, usedCount: 5 }),
      );
      await expect(service.apply('HARVEST10', cart, now)).rejects.toMatchObject(
        { message: 'This code has been used up.' },
      );

      discount_codes.findUnique.mockResolvedValue(
        codeRecord({ type: 'fixed', value: 5, minSpend: 50 }),
      );
      await expect(service.apply('HARVEST10', cart, now)).rejects.toMatchObject(
        {
          message:
            'Spend $50.00 on Mlima Boutique products to use this code. You have $20.00 so far.',
        },
      );

      discount_codes.findUnique.mockResolvedValue(codeRecord());
      products.findMany.mockResolvedValue([]);
      await expect(service.apply('HARVEST10', cart, now)).rejects.toMatchObject(
        {
          message:
            'This code is for products from Mlima Boutique. Add some to your cart to use it.',
        },
      );
    });

    describe('a code limited to chosen products', () => {
      beforeEach(() => {
        discount_codes.findUnique.mockResolvedValue(
          codeRecord({ productIds: [HAT_ID] }),
        );
        products.findMany.mockResolvedValue([hat]);
      });

      it('takes money off only those products', async () => {
        const applied = await service.apply(
          'HARVEST10',
          [
            { productId: SHOE_ID, choices: { Size: '44' }, quantity: 2 },
            { productId: HAT_ID, quantity: 3 },
          ],
          now,
        );

        expect(applied).toMatchObject({
          amount: 6,
          lines: [{ index: 1, total: 60 }],
          productNames: ['Hat'],
        });
        expect(products.findMany.mock.calls[0][0].where).toEqual({
          id: { in: [HAT_ID] },
          shopId: SHOP_ID,
        });
      });

      it('names the products when none of them are in the cart', async () => {
        await expect(
          service.apply(
            'HARVEST10',
            [{ productId: SHOE_ID, choices: { Size: '44' }, quantity: 1 }],
            now,
          ),
        ).rejects.toMatchObject({
          statusCode: 400,
          message:
            'This code is only for Hat from Mlima Boutique. Add it to your cart to use it.',
        });
      });

      it('counts the minimum spend on those products alone', async () => {
        discount_codes.findUnique.mockResolvedValue(
          codeRecord({ productIds: [HAT_ID], minSpend: 50 }),
        );
        await expect(
          service.apply(
            'HARVEST10',
            [
              { productId: SHOE_ID, choices: { Size: '44' }, quantity: 2 },
              { productId: HAT_ID, quantity: 1 },
            ],
            now,
          ),
        ).rejects.toMatchObject({
          message:
            'Spend $50.00 on Hat to use this code. You have $20.00 so far.',
        });
      });

      it('explains when its products are gone', async () => {
        products.findMany.mockResolvedValue([]);
        await expect(
          service.apply('HARVEST10', [{ productId: HAT_ID, quantity: 1 }], now),
        ).rejects.toMatchObject({
          message:
            'The products this code was for are no longer sold by Mlima Boutique.',
        });
      });
    });

    it('skips lines whose options no longer match a variant', async () => {
      products.findMany.mockResolvedValue([shoe]);
      await expect(
        service.apply(
          'HARVEST10',
          [{ productId: SHOE_ID, choices: { Size: '39' }, quantity: 1 }],
          now,
        ),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  it('rejects malformed carts', () => {
    expect(() => parseCartItems([])).toThrow(/Add something/);
    expect(() => parseCartItems([{ productId: HAT_ID, quantity: 0 }])).toThrow(
      /couldn’t be read/,
    );
    expect(() =>
      parseCartItems([
        { productId: HAT_ID, quantity: 1, choices: { Size: 4 } },
      ]),
    ).toThrow(/couldn’t be read/);
    expect(parseCartItems([{ productId: HAT_ID, quantity: 2 }])).toEqual([
      { productId: HAT_ID, quantity: 2 },
    ]);
  });

  it('turns a duplicate code into a friendly 409', async () => {
    discount_codes.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await expect(
      service.create(SHOP_ID, {
        code: 'HARVEST10',
        type: 'percentage',
        value: 10,
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      message: 'That code is already taken. Try another.',
    });
  });

  it('only limits a code to products from the seller’s own shop', async () => {
    products.count.mockResolvedValue(1);
    await expect(
      service.create(SHOP_ID, {
        code: 'SHOES15',
        type: 'percentage',
        value: 15,
        productIds: [SHOE_ID, HAT_ID],
      }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(products.count).toHaveBeenCalledWith({
      where: { id: { in: [SHOE_ID, HAT_ID] }, shopId: SHOP_ID },
    });
    expect(discount_codes.create).not.toHaveBeenCalled();

    products.count.mockResolvedValue(2);
    discount_codes.create.mockResolvedValue(
      codeRecord({ code: 'SHOES15', productIds: [SHOE_ID, HAT_ID] }),
    );
    const created = await service.create(SHOP_ID, {
      code: 'SHOES15',
      type: 'percentage',
      value: 15,
      productIds: [SHOE_ID, HAT_ID],
    });
    expect(created.productIds).toEqual([SHOE_ID, HAT_ID]);
  });

  it('only changes and deletes the shop’s own codes', async () => {
    discount_codes.updateMany.mockResolvedValue({ count: 1 });
    discount_codes.findUnique.mockResolvedValue(codeRecord({ active: false }));
    const paused = await service.setActive(SHOP_ID, CODE_ID, false);
    expect(paused).toMatchObject({ code: 'HARVEST10', active: false });
    expect(paused.minSpend).toBeUndefined();
    expect(discount_codes.updateMany).toHaveBeenCalledWith({
      where: { id: CODE_ID, shopId: SHOP_ID },
      data: { active: false },
    });

    discount_codes.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.setActive(SHOP_ID, CODE_ID, true),
    ).rejects.toMatchObject({ statusCode: 404 });

    discount_codes.deleteMany.mockResolvedValue({ count: 0 });
    await expect(service.remove(SHOP_ID, CODE_ID)).rejects.toMatchObject({
      statusCode: 404,
    });
    await expect(service.remove(SHOP_ID, 'nope')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});
