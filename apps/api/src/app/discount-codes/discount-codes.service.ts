import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { appError, notFound, validationError } from '@org/errors';
import type {
  AppliedDiscount,
  DiscountCartItem,
  DiscountCode,
  DiscountCodeInput,
  DiscountType,
} from '@org/models';
import {
  DISCOUNT_CODE_PATTERN,
  MAX_CART_QUANTITY,
  discountAmount,
  discountScope,
  discountUnavailable,
  normaliseCode,
  roundMoney,
} from '@org/models/checkout';
import { findVariant, formatPrice, unitPrice } from '@org/models/catalog';
import { PrismaService } from '../prisma.service';
import { isObjectId } from '../products/product-mapper';

const MAX_CART_LINES = 100;
const NAMES_SHOWN = 3;

/** "Sneakers, Hat and Scarf" or "Sneakers, Hat, Scarf and 4 more". */
function listNames(names: string[]) {
  if (names.length <= NAMES_SHOWN) {
    return names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  }
  return `${names.slice(0, NAMES_SHOWN).join(', ')} and ${names.length - NAMES_SHOWN} more`;
}

type DiscountRecord = Prisma.discount_codesGetPayload<object>;

export function toDiscountCode(record: DiscountRecord): DiscountCode {
  return {
    id: record.id,
    code: record.code,
    type: record.type as DiscountType,
    value: record.value,
    ...(record.minSpend != null && { minSpend: record.minSpend }),
    ...(record.usageLimit != null && { usageLimit: record.usageLimit }),
    usedCount: record.usedCount,
    ...(record.expiresAt != null && { expiresAt: record.expiresAt }),
    ...(record.productIds?.length && { productIds: record.productIds }),
    active: record.active,
    createdAt: record.createdAt.toISOString(),
  };
}

const isChoices = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((choice) => typeof choice === 'string');

/** The cart lines sent to check a code, or a 400 when they're malformed. */
export function parseCartItems(value: unknown): DiscountCartItem[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw validationError('Add something to your cart before using a code.');
  }
  if (value.length > MAX_CART_LINES) {
    throw validationError(`A cart can hold up to ${MAX_CART_LINES} lines.`);
  }
  return value.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const { productId, quantity, choices } = item;
    if (
      typeof productId !== 'string' ||
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > MAX_CART_QUANTITY ||
      (choices !== undefined && !isChoices(choices))
    ) {
      throw validationError('Some cart items couldn’t be read.');
    }
    return {
      productId,
      quantity: quantity as number,
      ...(choices !== undefined && { choices }),
    };
  });
}

@Injectable()
export class DiscountCodesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(shopId: string): Promise<DiscountCode[]> {
    const records = await this.prisma.discount_codes.findMany({
      where: { shopId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(toDiscountCode);
  }

  async create(
    shopId: string,
    input: DiscountCodeInput,
  ): Promise<DiscountCode> {
    if (input.productIds) {
      const owned = await this.prisma.products.count({
        where: { id: { in: input.productIds }, shopId },
      });
      if (owned !== input.productIds.length) {
        throw validationError(
          'Some of the chosen products aren’t in your shop any more. Refresh and choose again.',
        );
      }
    }
    try {
      const record = await this.prisma.discount_codes.create({
        data: { ...input, shopId },
      });
      return toDiscountCode(record);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw appError(
          'That code is already taken. Try another.',
          409,
          { code: input.code },
          'DISCOUNT_CODE_TAKEN',
        );
      }
      throw error;
    }
  }

  async setActive(
    shopId: string,
    id: string,
    active: boolean,
  ): Promise<DiscountCode> {
    const { count } = isObjectId(id)
      ? await this.prisma.discount_codes.updateMany({
          where: { id, shopId },
          data: { active },
        })
      : { count: 0 };
    const record =
      count > 0
        ? await this.prisma.discount_codes.findUnique({ where: { id } })
        : null;
    if (!record) throw notFound('Discount code', { id });
    return toDiscountCode(record);
  }

  async remove(shopId: string, id: string): Promise<void> {
    const { count } = isObjectId(id)
      ? await this.prisma.discount_codes.deleteMany({ where: { id, shopId } })
      : { count: 0 };
    if (count === 0) throw notFound('Discount code', { id });
  }

  /**
   * Works out what a code saves on a cart. Prices come from the database, so the
   * shopper's copy of the cart can't change the amount.
   */
  async apply(
    rawCode: unknown,
    items: DiscountCartItem[],
    now = new Date(),
  ): Promise<AppliedDiscount> {
    const code = normaliseCode(rawCode);
    if (!code) throw validationError('Enter a discount code.');

    const record = DISCOUNT_CODE_PATTERN.test(code)
      ? await this.prisma.discount_codes.findUnique({
          where: { code },
          include: { shop: { select: { name: true } } },
        })
      : null;
    if (!record) {
      throw appError(
        'We couldn’t find that code.',
        404,
        { code },
        'DISCOUNT_NOT_FOUND',
      );
    }

    const discount = toDiscountCode(record);
    const unavailable = discountUnavailable(discount, now);
    if (unavailable) throw validationError(unavailable);

    const shopName = record.shop.name;
    const limitedTo = record.productIds ?? [];
    const limited = limitedTo.length > 0;
    const select = {
      id: true,
      name: true,
      price: true,
      salePrice: true,
      options: true,
      variants: true,
    } as const;
    // A limited code looks up all of its products so the shopper can be told which ones it's for.
    const ids = limited
      ? limitedTo
      : [...new Set(items.map((item) => item.productId))].filter(isObjectId);
    const products = ids.length
      ? await this.prisma.products.findMany({
          where: { id: { in: ids }, shopId: record.shopId },
          select,
        })
      : [];
    const byId = new Map(products.map((product) => [product.id, product]));
    const productNames = limited
      ? products.map((product) => product.name)
      : undefined;
    const scope = discountScope({ shopName, productNames });

    const lines = items.flatMap((item, index) => {
      const product = byId.get(item.productId);
      if (!product) return [];
      const priced = {
        price: product.price,
        salePrice: product.salePrice ?? undefined,
        options: product.options.map((option) => ({
          name: option.name,
          values: option.values.map(({ label }) => ({ label })),
        })),
        variants: product.variants.map((variant) => ({
          choices: variant.choices as Record<string, string>,
          stock: variant.stock,
          price: variant.price ?? undefined,
        })),
      };
      const variant = priced.options.length
        ? findVariant(priced, item.choices ?? {})
        : undefined;
      if (priced.options.length && !variant) return [];
      return [
        {
          index,
          total: roundMoney(unitPrice(priced, variant) * item.quantity),
        },
      ];
    });

    if (lines.length === 0) {
      if (!productNames) {
        throw validationError(
          `This code is for products from ${shopName}. Add some to your cart to use it.`,
        );
      }
      throw validationError(
        productNames.length === 0
          ? `The products this code was for are no longer sold by ${shopName}.`
          : `This code is only for ${listNames(productNames)} from ${shopName}. Add ${productNames.length === 1 ? 'it' : 'one of them'} to your cart to use it.`,
      );
    }

    const subtotal = roundMoney(
      lines.reduce((sum, line) => sum + line.total, 0),
    );
    const amount = discountAmount(discount, subtotal);
    if (amount === 0) {
      throw validationError(
        `Spend ${formatPrice(discount.minSpend ?? 0)} on ${scope} to use this code. You have ${formatPrice(subtotal)} so far.`,
      );
    }

    return {
      code: discount.code,
      shopName,
      type: discount.type,
      value: discount.value,
      amount,
      lines,
      ...(productNames && { productNames }),
    };
  }
}
