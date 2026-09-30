import { AppError } from '@org/errors';
import type { CheckoutItem, DeliveryAddress } from '@org/models';
import type { DiscountCodesService } from '../discount-codes/discount-codes.service';
import type { MailService } from '../mail/mail.service';
import type { PrismaService } from '../prisma.service';
import {
  CheckoutService,
  makeDeliveryCode,
  makeOrderNumber,
} from './checkout.service';

const SHOES = 'a'.repeat(24);
const TEA = 'b'.repeat(24);
const SHOP_A = 'c'.repeat(24);
const SHOP_B = 'd'.repeat(24);
const user = { id: 'e'.repeat(24), name: 'Amina', email: 'amina@example.com' };
const address: DeliveryAddress = {
  recipientName: 'Amina',
  phone: '+254712345678',
  zone: 'Nairobi',
  area: 'Kilimani',
};

const shoes = (overrides: Record<string, unknown> = {}) => ({
  id: SHOES,
  title: 'Leather sneakers',
  category: 'Fashion',
  subCategory: 'Shoes',
  price: 50,
  salePrice: null,
  images: ['https://ik.imagekit.io/demo/shoes.jpg'],
  options: [{ name: 'Size', values: [{ label: '42', imageIndex: null }] }],
  variants: [{ sku: null, choices: { Size: '42' }, price: null, stock: 3 }],
  stock: 3,
  paymentOptions: ['full_upfront', 'deposit'],
  shopId: SHOP_A,
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  shop: {
    id: SHOP_A,
    name: 'Kicks KE',
    deliveryFee: 5,
    seller: { email: 'kicks@example.com' },
  },
  ...overrides,
});

const tea = (overrides: Record<string, unknown> = {}) => ({
  id: TEA,
  title: 'Kericho tea',
  category: 'Beverages',
  subCategory: 'Tea',
  price: 4,
  salePrice: 3,
  images: ['https://ik.imagekit.io/demo/tea.jpg'],
  options: [],
  variants: [],
  stock: 20,
  paymentOptions: [],
  shopId: SHOP_B,
  updatedAt: new Date('2026-09-01T00:00:00Z'),
  shop: {
    id: SHOP_B,
    name: 'Chai Point',
    deliveryFee: null,
    seller: { email: 'chai@example.com' },
  },
  ...overrides,
});

const cart: CheckoutItem[] = [
  {
    productId: SHOES,
    quantity: 2,
    choices: { Size: '42' },
    paymentOption: 'deposit',
  },
  { productId: TEA, quantity: 5, paymentOption: 'full_upfront' },
];

describe('CheckoutService', () => {
  const prisma = {
    products: { findMany: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
    discount_codes: { findUnique: vi.fn(), updateMany: vi.fn() },
    orders: { create: vi.fn(), deleteMany: vi.fn() },
  };
  const discountCodes = { apply: vi.fn() };
  const mail = { send: vi.fn() };
  const service = new CheckoutService(
    prisma as unknown as PrismaService,
    discountCodes as unknown as DiscountCodesService,
    mail as unknown as MailService,
  );

  beforeEach(() => {
    vi.resetAllMocks();
    mail.send.mockResolvedValue(true);
    prisma.products.findMany.mockResolvedValue([shoes(), tea()]);
    prisma.products.findUnique.mockImplementation(async ({ where }) =>
      where.id === SHOES ? shoes() : tea(),
    );
    prisma.products.updateMany.mockResolvedValue({ count: 1 });
    prisma.orders.create.mockImplementation(async ({ data }) => ({
      id: `order-${data.shopId}`,
      ...data,
      status: 'placed',
      discountCode: data.discountCode ?? null,
      address: { street: null, notes: null, ...data.address },
      items: data.items.map((item: Record<string, unknown>) => ({
        choices: null,
        ...item,
      })),
      createdAt: new Date('2026-09-30T10:00:00Z'),
      updatedAt: new Date('2026-09-30T10:00:00Z'),
    }));
  });

  describe('quote', () => {
    it('splits the cart by shop and adds each shop’s delivery fee', async () => {
      const quote = await service.quote(cart);

      expect(quote.groups).toHaveLength(2);
      const [kicks, chai] = quote.groups;
      expect(kicks).toMatchObject({
        shopName: 'Kicks KE',
        subtotal: 100,
        deliveryFee: 5,
        total: 105,
        // Half of the shoes now, plus the delivery fee.
        payNow: 55,
        onDelivery: 50,
      });
      expect(chai).toMatchObject({
        shopName: 'Chai Point',
        subtotal: 15,
        deliveryFee: 3,
        total: 18,
        payNow: 18,
        onDelivery: 0,
      });
      expect(quote).toMatchObject({
        subtotal: 115,
        deliveryFee: 8,
        total: 123,
        payNow: 73,
        onDelivery: 50,
      });
      expect(kicks.items[0]).toMatchObject({
        name: 'Leather sneakers',
        choices: { Size: '42' },
        unitPrice: 50,
        imageUrl: 'https://ik.imagekit.io/demo/shoes.jpg',
      });
    });

    it('applies a discount to its own shop only', async () => {
      discountCodes.apply.mockResolvedValue({
        code: 'KICKS10',
        amount: 10,
        lines: [{ index: 0, total: 100 }],
      });

      const quote = await service.quote(cart, 'KICKS10');

      expect(quote.discountCode).toBe('KICKS10');
      expect(quote.groups[0]).toMatchObject({
        discount: 10,
        total: 95,
        payNow: 50,
      });
      expect(quote.groups[1].discount).toBe(0);
    });

    it('reports a code that doesn’t work instead of failing', async () => {
      discountCodes.apply.mockRejectedValue(
        new AppError('This code has expired.', 400),
      );

      const quote = await service.quote(cart, 'OLDCODE');

      expect(quote.discountError).toBe('This code has expired.');
      expect(quote.discount).toBe(0);
    });

    it('refuses sample products', async () => {
      await expect(
        service.quote([
          { productId: '1', quantity: 1, paymentOption: 'full_upfront' },
        ]),
      ).rejects.toMatchObject({ statusCode: 400 });
    });

    it('refuses listings arranged with the seller', async () => {
      prisma.products.findMany.mockResolvedValue([
        tea({ category: 'Services', subCategory: 'Software & IT' }),
      ]);

      await expect(service.quote([cart[1]])).rejects.toMatchObject({
        statusCode: 400,
        message: expect.stringContaining('arranged with the seller'),
      });
    });

    it('refuses more than is in stock, counting repeated lines together', async () => {
      await expect(
        service.quote([cart[0], { ...cart[0], quantity: 2 }]),
      ).rejects.toMatchObject({
        statusCode: 409,
        message:
          'Only 3 of Leather sneakers (Size: 42) left. Lower the quantity to continue.',
      });
    });

    it('refuses a way to pay the product doesn’t accept', async () => {
      await expect(
        service.quote([{ ...cart[1], paymentOption: 'cash_on_delivery' }]),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('place', () => {
    it('holds the stock, creates one order per shop and emails everyone', async () => {
      const orders = await service.place(user, { items: cart, address });

      const shoeUpdate = prisma.products.updateMany.mock.calls.find(
        ([args]) => args.where.id === SHOES,
      )?.[0];
      expect(shoeUpdate.data.stock).toBe(1);
      expect(shoeUpdate.data.variants.set[0].stock).toBe(1);
      expect(shoeUpdate.where.updatedAt).toEqual(shoes().updatedAt);

      expect(prisma.orders.create).toHaveBeenCalledTimes(2);
      expect(orders.map((order) => order.shopName)).toEqual([
        'Kicks KE',
        'Chai Point',
      ]);
      expect(orders[0].number).toMatch(/^ML-[A-Z2-9]{6}$/);
      expect(orders[0].deliveryCode).toMatch(/^\d{4}$/);
      expect(orders[0].total).toBe(105);

      const recipients = mail.send.mock.calls.map(([message]) => message.to);
      expect(recipients).toEqual(
        expect.arrayContaining([
          'kicks@example.com',
          'chai@example.com',
          'amina@example.com',
        ]),
      );
    });

    it('puts stock back and stops when someone else bought it first', async () => {
      prisma.products.updateMany.mockImplementation(async ({ where }) => ({
        count: where.id === TEA ? 0 : 1,
      }));

      await expect(
        service.place(user, { items: cart, address }),
      ).rejects.toMatchObject({ statusCode: 409, code: 'STOCK_CHANGED' });

      const shoeWrites = prisma.products.updateMany.mock.calls.filter(
        ([args]) => args.where.id === SHOES,
      );
      // Taken, then given back.
      expect(shoeWrites).toHaveLength(2);
      expect(shoeWrites[1][0].data.stock).toBe(5);
      expect(prisma.orders.create).not.toHaveBeenCalled();
    });

    it('counts a use of the discount code', async () => {
      discountCodes.apply.mockResolvedValue({
        code: 'KICKS10',
        amount: 10,
        lines: [{ index: 0, total: 100 }],
      });
      prisma.discount_codes.findUnique.mockResolvedValue({
        id: 'code1',
        usedCount: 4,
        usageLimit: 10,
      });
      prisma.discount_codes.updateMany.mockResolvedValue({ count: 1 });

      const orders = await service.place(user, {
        items: cart,
        address,
        discountCode: 'KICKS10',
      });

      expect(prisma.discount_codes.updateMany).toHaveBeenCalledWith({
        where: { id: 'code1', usedCount: 4 },
        data: { usedCount: { increment: 1 } },
      });
      expect(orders[0].discountCode).toBe('KICKS10');
      expect(orders[1].discountCode).toBeUndefined();
    });

    it('stops when the code has just been used up', async () => {
      discountCodes.apply.mockResolvedValue({
        code: 'KICKS10',
        amount: 10,
        lines: [{ index: 0, total: 100 }],
      });
      prisma.discount_codes.findUnique.mockResolvedValue({
        id: 'code1',
        usedCount: 10,
        usageLimit: 10,
      });

      await expect(
        service.place(user, { items: cart, address, discountCode: 'KICKS10' }),
      ).rejects.toMatchObject({ code: 'DISCOUNT_USED_UP' });
      expect(prisma.orders.create).not.toHaveBeenCalled();
    });
  });

  it('makes readable order numbers and 4-digit codes', () => {
    expect(makeOrderNumber()).toMatch(/^ML-[A-Z2-9]{6}$/);
    expect(makeDeliveryCode()).toMatch(/^\d{4}$/);
  });
});
