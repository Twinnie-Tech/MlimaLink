import { randomInt } from 'crypto';
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AppError, appError, validationError } from '@org/errors';
import type {
  CheckoutGroup,
  CheckoutInput,
  CheckoutItem,
  CheckoutQuote,
  DeliveryAddress,
  Order,
  OrderItem,
  PaymentOption,
} from '@org/models';
import {
  choiceImage,
  describeChoices,
  dueNowShare,
  findVariant,
  formatPrice,
  listingTerms,
  paymentLabel,
  paymentOptionsOf,
  unitPrice,
} from '@org/models/catalog';
import {
  PLATFORM_FEE_PERCENT,
  allocateDiscount,
  feeSplit,
  roundMoney,
} from '@org/models/checkout';
import { DEFAULT_DELIVERY_FEE } from '@org/models/delivery';
import { DiscountCodesService } from '../discount-codes/discount-codes.service';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma.service';
import { isObjectId, productImageUrl } from '../products/product-mapper';
import type { SignedInUser } from '../user.guard';
import { toOrder, type OrderRecord } from './order-mapper';
import { adjustStock, type StockChange } from './stock';

const ORDER_NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const sellerOrdersUrl = () =>
  `${(process.env.SELLER_UI_URL ?? 'http://localhost:4300').replace(/\/+$/, '')}/dashboard/orders`;
export const shopperOrdersUrl = () =>
  `${(process.env.USER_UI_URL ?? 'http://localhost:4200').replace(/\/+$/, '')}/dashboard/orders`;

/** "ML-7Q2K9D": short enough to read out over the phone. */
export const makeOrderNumber = () =>
  `ML-${Array.from(
    { length: 6 },
    () => ORDER_NUMBER_ALPHABET[randomInt(ORDER_NUMBER_ALPHABET.length)],
  ).join('')}`;

export const makeDeliveryCode = () =>
  randomInt(0, 10_000).toString().padStart(4, '0');

/** "2 × Sneakers (Size: 42) — $80.00" */
export const describeItem = (item: OrderItem) =>
  `${item.quantity} × ${item.name}${item.choices ? ` (${describeChoices(item.choices)})` : ''} — ${formatPrice(item.total - item.discount)}`;

type PricedGroup = CheckoutGroup & {
  sellerEmail: string;
  stock: { productId: string; change: StockChange }[];
};

type Priced = {
  groups: PricedGroup[];
  discountCode?: string;
  discountError?: string;
};

const sum = (values: number[]) =>
  roundMoney(values.reduce((total, value) => total + value, 0));

@Injectable()
export class CheckoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly discountCodes: DiscountCodesService,
    private readonly mail: MailService,
  ) {}

  /** What the cart costs, split by shop, with each shop's delivery fee. A bad code is reported, not thrown. */
  async quote(
    items: CheckoutItem[],
    discountCode?: string,
  ): Promise<CheckoutQuote> {
    const { groups, ...discount } = await this.price(
      items,
      discountCode,
      false,
    );
    const shown: CheckoutGroup[] = groups.map((group) => ({
      shopId: group.shopId,
      shopName: group.shopName,
      items: group.items,
      subtotal: group.subtotal,
      discount: group.discount,
      deliveryFee: group.deliveryFee,
      total: group.total,
      payNow: group.payNow,
      onDelivery: group.onDelivery,
      platformFee: group.platformFee,
      sellerEarnings: group.sellerEarnings,
    }));
    return {
      groups: shown,
      ...discount,
      subtotal: sum(shown.map((group) => group.subtotal)),
      discount: sum(shown.map((group) => group.discount)),
      deliveryFee: sum(shown.map((group) => group.deliveryFee)),
      total: sum(shown.map((group) => group.total)),
      payNow: sum(shown.map((group) => group.payNow)),
      onDelivery: sum(shown.map((group) => group.onDelivery)),
      platformFee: sum(shown.map((group) => group.platformFee)),
      sellerEarnings: sum(shown.map((group) => group.sellerEarnings)),
    };
  }

  /** Places one order per shop, holding the stock and counting the discount code's use. */
  async place(user: SignedInUser, checkout: CheckoutInput): Promise<Order[]> {
    const priced = await this.price(
      checkout.items,
      checkout.discountCode,
      true,
    );

    const changes = new Map<string, StockChange[]>();
    for (const group of priced.groups) {
      for (const { productId, change } of group.stock) {
        changes.set(productId, [
          ...(changes.get(productId) ?? []),
          { ...change, delta: -change.delta },
        ]);
      }
    }
    const held: [string, StockChange[]][] = [];
    for (const [productId, taken] of changes) {
      if (!(await adjustStock(this.prisma, productId, taken, true))) {
        await this.release(held);
        throw appError(
          'Stock changed while you were checking out. Check your cart and try again.',
          409,
          { productId },
          'STOCK_CHANGED',
        );
      }
      held.push([productId, taken]);
    }

    if (priced.discountCode && !(await this.countUse(priced.discountCode))) {
      await this.release(held);
      throw appError(
        'That discount code has just been used up. Remove it and try again.',
        409,
        { code: priced.discountCode },
        'DISCOUNT_USED_UP',
      );
    }

    const created: OrderRecord[] = [];
    try {
      for (const group of priced.groups) {
        created.push(
          await this.createOrder(
            user,
            checkout.address,
            group,
            group.discount > 0 ? priced.discountCode : undefined,
          ),
        );
      }
    } catch (error) {
      if (created.length) {
        await this.prisma.orders.deleteMany({
          where: { id: { in: created.map((order) => order.id) } },
        });
      }
      await this.release(held);
      throw error;
    }

    await Promise.all([
      ...created.map((order, index) =>
        this.mail.send({
          to: priced.groups[index].sellerEmail,
          subject: `New order ${order.number} — ${formatPrice(order.total)}`,
          paragraphs: [
            `${order.buyerName} placed an order with ${order.shopName}.`,
            priced.groups[index].items.map(describeItem).join('\n'),
            `Deliver to: ${order.address.area}, ${order.address.zone}`,
            `Paid when ordering: ${formatPrice(order.payNow)} (including ${formatPrice(order.deliveryFee)} delivery)\nDue on delivery: ${formatPrice(order.onDelivery)}`,
            `MlimaLink fee (${PLATFORM_FEE_PERCENT}%): ${formatPrice(priced.groups[index].platformFee)}\nYou receive: ${formatPrice(priced.groups[index].sellerEarnings)}`,
            'Confirm the order, then ask a rider to collect it from your Orders page.',
          ],
          link: { label: 'Open your orders', url: sellerOrdersUrl() },
        }),
      ),
      this.mail.send({
        to: user.email,
        subject:
          created.length === 1
            ? `Order ${created[0].number} placed`
            : `${created.length} orders placed`,
        paragraphs: [
          `Hi ${user.name}, thanks for your order.`,
          ...created.map(
            (order) =>
              `${order.number} from ${order.shopName}: ${formatPrice(order.total)} (including ${formatPrice(order.deliveryFee)} delivery). Delivery code: ${order.deliveryCode}`,
          ),
          'Each shop will confirm your order and let you know how to pay the amount due now.',
          'When a rider brings your order, give them its delivery code. Keep it private until then.',
        ],
        link: { label: 'Track your orders', url: shopperOrdersUrl() },
      }),
    ]);

    return created.map((order) => toOrder(order, 'buyer'));
  }

  private async price(
    items: CheckoutItem[],
    rawCode: string | undefined,
    strict: boolean,
  ): Promise<Priced> {
    if (items.some((item) => !isObjectId(item.productId))) {
      throw validationError(
        'Some items in your cart are samples and can’t be ordered. Remove them to check out.',
      );
    }
    const ids = [...new Set(items.map((item) => item.productId))];
    const products = await this.prisma.products.findMany({
      where: { id: { in: ids } },
      include: {
        shop: {
          select: {
            id: true,
            name: true,
            deliveryFee: true,
            seller: { select: { email: true } },
          },
        },
      },
    });
    const byId = new Map(products.map((product) => [product.id, product]));

    const wanted = new Map<string, number>();
    const lines = items.map((item) => {
      const product = byId.get(item.productId);
      if (!product) {
        throw appError(
          'Something in your cart is no longer for sale. Remove it and try again.',
          409,
          { productId: item.productId },
          'CART_ITEM_GONE',
        );
      }
      const name = product.title;
      const terms = listingTerms(product);
      if (terms.contactSeller || terms.service) {
        throw validationError(
          `${name} is arranged with the seller directly, so it can’t be checked out. Remove it from your cart.`,
        );
      }

      const priced = {
        price: product.price,
        salePrice: product.salePrice ?? undefined,
        options: product.options.map((option) => ({
          name: option.name,
          values: option.values.map((value) => ({
            label: value.label,
            ...(value.imageIndex != null && { imageIndex: value.imageIndex }),
          })),
        })),
        variants: product.variants.map((variant) => ({
          choices: variant.choices as Record<string, string>,
          stock: variant.stock,
          ...(variant.price != null && { price: variant.price }),
        })),
      };
      const hasOptions = priced.options.length > 0;
      const variant = hasOptions
        ? findVariant(priced, item.choices ?? {})
        : undefined;
      if (hasOptions && !variant) {
        throw validationError(
          `Choose the options for ${name} again; that combination isn’t sold any more.`,
        );
      }
      const label = variant
        ? `${name} (${describeChoices(variant.choices)})`
        : name;

      const accepted = paymentOptionsOf({
        paymentOptions: product.paymentOptions as PaymentOption[],
      });
      if (!accepted.includes(item.paymentOption)) {
        throw validationError(
          `${name} can’t be paid for by ${paymentLabel(item.paymentOption).toLowerCase()}. Choose another way to pay in your cart.`,
        );
      }

      const key = `${product.id}|${JSON.stringify(variant?.choices ?? {})}`;
      const quantity = (wanted.get(key) ?? 0) + item.quantity;
      wanted.set(key, quantity);
      const available = variant ? variant.stock : product.stock;
      if (quantity > available) {
        throw appError(
          available > 0
            ? `Only ${available} of ${label} left. Lower the quantity to continue.`
            : `${label} is sold out. Remove it to continue.`,
          409,
          { productId: product.id, available },
          'OUT_OF_STOCK',
        );
      }

      const images = product.images.map((source, index) =>
        source.startsWith('data:')
          ? productImageUrl(product.id, index)
          : source,
      );
      const unit = unitPrice(priced, variant);
      const orderItem: OrderItem = {
        productId: product.id,
        name,
        imageUrl: choiceImage(
          { imageUrl: images[0] ?? '', images, options: priced.options },
          variant?.choices ?? {},
        ),
        ...(variant && { choices: variant.choices }),
        quantity: item.quantity,
        unitPrice: unit,
        total: roundMoney(unit * item.quantity),
        discount: 0,
        paymentOption: item.paymentOption,
      };
      return { product, item: orderItem };
    });

    let discountCode: string | undefined;
    let discountError: string | undefined;
    if (rawCode) {
      try {
        const applied = await this.discountCodes.apply(
          rawCode,
          items.map(({ productId, quantity, choices }) => ({
            productId,
            quantity,
            ...(choices && { choices }),
          })),
        );
        const parts = allocateDiscount(
          applied.amount,
          applied.lines.map((line) => line.total),
        );
        applied.lines.forEach((line, index) => {
          lines[line.index].item.discount = parts[index];
        });
        discountCode = applied.code;
      } catch (error) {
        if (strict || !(error instanceof AppError)) throw error;
        discountError = error.message;
      }
    }

    const groups = new Map<string, PricedGroup>();
    for (const { product, item } of lines) {
      const { shop } = product;
      const group = groups.get(shop.id) ?? {
        shopId: shop.id,
        shopName: shop.name,
        sellerEmail: shop.seller.email,
        items: [],
        stock: [],
        subtotal: 0,
        discount: 0,
        deliveryFee: shop.deliveryFee ?? DEFAULT_DELIVERY_FEE,
        total: 0,
        payNow: 0,
        onDelivery: 0,
        platformFee: 0,
        sellerEarnings: 0,
      };
      group.items.push(item);
      group.stock.push({
        productId: item.productId,
        change: {
          ...(item.choices && { choices: item.choices }),
          delta: item.quantity,
        },
      });
      groups.set(shop.id, group);
    }

    for (const group of groups.values()) {
      group.subtotal = sum(group.items.map((item) => item.total));
      group.discount = sum(group.items.map((item) => item.discount));
      group.total = roundMoney(
        group.subtotal - group.discount + group.deliveryFee,
      );
      group.payNow = roundMoney(
        sum(
          group.items.map((item) =>
            roundMoney(
              (item.total - item.discount) * dueNowShare(item.paymentOption),
            ),
          ),
        ) + group.deliveryFee,
      );
      group.onDelivery = roundMoney(group.total - group.payNow);
      Object.assign(group, feeSplit(group.subtotal, group.discount));
    }

    return {
      groups: [...groups.values()],
      ...(discountCode && { discountCode }),
      ...(discountError && { discountError }),
    };
  }

  private async createOrder(
    user: SignedInUser,
    address: DeliveryAddress,
    group: PricedGroup,
    discountCode: string | undefined,
  ): Promise<OrderRecord> {
    const data = {
      shopId: group.shopId,
      shopName: group.shopName,
      userId: user.id,
      buyerName: user.name,
      buyerEmail: user.email,
      address,
      items: group.items,
      subtotal: group.subtotal,
      discount: group.discount,
      discountCode,
      deliveryFee: group.deliveryFee,
      total: group.total,
      payNow: group.payNow,
      onDelivery: group.onDelivery,
      platformFee: group.platformFee,
      sellerEarnings: group.sellerEarnings,
      deliveryCode: makeDeliveryCode(),
    };
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.orders.create({
          data: { ...data, number: makeOrderNumber() },
        });
      } catch (error) {
        const numberTaken =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002';
        if (!numberTaken || attempt >= 4) throw error;
      }
    }
  }

  private async release(held: [string, StockChange[]][]): Promise<void> {
    await Promise.all(
      held.map(([productId, taken]) =>
        adjustStock(
          this.prisma,
          productId,
          taken.map((change) => ({ ...change, delta: -change.delta })),
          false,
        ),
      ),
    );
  }

  /** Adds one use to the code, unless it has just run out. */
  private async countUse(code: string): Promise<boolean> {
    for (let attempt = 0; attempt < 3; attempt++) {
      const record = await this.prisma.discount_codes.findUnique({
        where: { code },
        select: { id: true, usedCount: true, usageLimit: true },
      });
      if (!record) return false;
      if (record.usageLimit != null && record.usedCount >= record.usageLimit) {
        return false;
      }
      const { count } = await this.prisma.discount_codes.updateMany({
        where: { id: record.id, usedCount: record.usedCount },
        data: { usedCount: { increment: 1 } },
      });
      if (count > 0) return true;
    }
    return false;
  }
}

/** Puts an order's units back on sale after it's cancelled. */
export async function restock(
  prisma: PrismaService,
  order: Pick<OrderRecord, 'items'>,
): Promise<void> {
  const changes = new Map<string, StockChange[]>();
  for (const item of order.items) {
    changes.set(item.productId, [
      ...(changes.get(item.productId) ?? []),
      {
        ...(item.choices != null && {
          choices: item.choices as Record<string, string>,
        }),
        delta: item.quantity,
      },
    ]);
  }
  await Promise.all(
    [...changes].map(([productId, back]) =>
      adjustStock(prisma, productId, back, false),
    ),
  );
}
