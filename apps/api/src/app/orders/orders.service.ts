import { Injectable } from '@nestjs/common';
import { appError, notFound, validationError } from '@org/errors';
import type {
  AvailableRider,
  DeliverySettings,
  DeliveryStatus,
  DeliveryZone,
  Order,
  OrderStatus,
  VehicleType,
} from '@org/models';
import { formatPrice } from '@org/models/catalog';
import {
  ACTIVE_DELIVERY_STATUSES,
  DEFAULT_DELIVERY_FEE,
  canSellerMoveOrder,
  isDeliveryZone,
  orderStatusLabel,
} from '@org/models/delivery';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma.service';
import { isObjectId } from '../products/product-mapper';
import type { SellerShop } from '../seller.guard';
import type { SignedInUser } from '../user.guard';
import {
  ORDERS_PAGE,
  describeItem,
  restock,
  sellerOrdersUrl,
  shopperOrdersUrl,
} from './checkout.service';
import {
  riderContactSelect,
  toOrder,
  toOrderItem,
  type OrderRecord,
  type OrderViewer,
  type RiderRecord,
} from './order-mapper';

const MAX_LISTED = 200;
const MAX_RIDERS_LISTED = 50;

export const riderPortalUrl = () =>
  `${(process.env.USER_UI_URL ?? 'http://localhost:4200').replace(/\/+$/, '')}/rider`;

/** Orders with their delivery and rider details filled in. */
export async function withDeliveries(
  prisma: PrismaService,
  records: OrderRecord[],
  viewer: OrderViewer,
): Promise<Order[]> {
  if (records.length === 0) return [];
  const deliveries = await prisma.deliveries.findMany({
    where: { orderId: { in: records.map((record) => record.id) } },
  });
  const riderIds = [
    ...new Set(
      deliveries.flatMap((delivery) =>
        [delivery.riderId, delivery.offeredRiderId].filter((id): id is string =>
          Boolean(id),
        ),
      ),
    ),
  ];
  const riders: RiderRecord[] = riderIds.length
    ? await prisma.riders.findMany({
        where: { id: { in: riderIds } },
        select: riderContactSelect,
      })
    : [];
  const riderById = new Map(riders.map((rider) => [rider.id, rider]));
  const byOrder = new Map(
    deliveries.map((delivery) => [delivery.orderId, delivery]),
  );
  return records.map((record) =>
    toOrder(record, viewer, byOrder.get(record.id), riderById),
  );
}

/** Deliveries done per rider. */
export async function completedCounts(
  prisma: PrismaService,
  riderIds: string[],
): Promise<Map<string, number>> {
  if (riderIds.length === 0) return new Map();
  const groups = await prisma.deliveries.groupBy({
    by: ['riderId'],
    where: { riderId: { in: riderIds }, status: 'delivered' },
    _count: { _all: true },
  });
  return new Map(
    groups.map((group) => [group.riderId ?? '', group._count._all]),
  );
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  async listForUser(userId: string): Promise<Order[]> {
    const records = await this.prisma.orders.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED,
    });
    return withDeliveries(this.prisma, records, 'buyer');
  }

  async getForUser(userId: string, id: string): Promise<Order> {
    const record = isObjectId(id)
      ? await this.prisma.orders.findFirst({ where: { id, userId } })
      : null;
    if (!record) throw notFound('Order', { id });
    const [order] = await withDeliveries(this.prisma, [record], 'buyer');
    return order;
  }

  /** Shoppers can cancel until the shop confirms. */
  async cancelForUser(user: SignedInUser, id: string): Promise<Order> {
    const record = isObjectId(id)
      ? await this.prisma.orders.findFirst({ where: { id, userId: user.id } })
      : null;
    if (!record) throw notFound('Order', { id });
    if (record.status !== 'placed') {
      throw validationError(
        `${record.shopName} has already ${record.status === 'cancelled' ? 'cancelled' : 'confirmed'} this order. Contact them if you need to change it.`,
      );
    }
    const updated = await this.move(record, 'cancelled');
    await restock(this.prisma, record);

    const seller = await this.sellerEmail(record.shopId);
    if (seller) {
      await this.mail.send({
        to: seller,
        subject: `Order ${record.number} was cancelled by the shopper`,
        paragraphs: [
          `${record.buyerName} cancelled order ${record.number} before you confirmed it. The items are back in stock.`,
          record.items.map(toOrderItem).map(describeItem).join('\n'),
        ],
        link: { label: 'Open your orders', url: sellerOrdersUrl() },
      });
    }
    await Promise.all([
      this.notifications.notifyShop(record.shopId, {
        creatorId: user.id,
        title: `Order ${record.number} was cancelled by the shopper`,
        message: `${record.buyerName} cancelled it before you confirmed it. The items are back in stock.`,
        redirectLink: ORDERS_PAGE,
      }),
      this.notifications.notifyAdmins({
        creatorId: user.id,
        title: `Order ${record.number} cancelled`,
        message: `${record.buyerName} cancelled their order from ${record.shopName} before it was confirmed.`,
        redirectLink: ORDERS_PAGE,
      }),
    ]);

    const [order] = await withDeliveries(this.prisma, [updated], 'buyer');
    return order;
  }

  async listForShop(shop: SellerShop): Promise<Order[]> {
    const records = await this.prisma.orders.findMany({
      where: { shopId: shop.id },
      orderBy: { createdAt: 'desc' },
      take: MAX_LISTED,
    });
    return withDeliveries(this.prisma, records, 'seller');
  }

  /** Confirms or cancels an order and tells the shopper. Cancelling withdraws any delivery not yet picked up. */
  async updateForShop(
    shop: SellerShop,
    id: string,
    status: OrderStatus,
    note?: string,
    sellerId?: string,
  ): Promise<Order> {
    const record = isObjectId(id)
      ? await this.prisma.orders.findFirst({ where: { id, shopId: shop.id } })
      : null;
    if (!record) throw notFound('Order', { id });

    const from = record.status as OrderStatus;
    if (!canSellerMoveOrder(from, status)) {
      throw validationError(
        `This order is ${orderStatusLabel(from).toLowerCase()}, so it can’t be marked ${orderStatusLabel(status).toLowerCase()}.`,
      );
    }

    let riderToTell: { name: string; email: string } | null = null;
    if (status === 'cancelled') {
      const delivery = await this.prisma.deliveries.findUnique({
        where: { orderId: record.id },
      });
      if (delivery?.status === 'picked_up') {
        throw validationError(
          'The rider already has this order, so it can’t be cancelled now.',
        );
      }
      if (
        delivery &&
        ACTIVE_DELIVERY_STATUSES.includes(delivery.status as DeliveryStatus)
      ) {
        const { count } = await this.prisma.deliveries.updateMany({
          where: { id: delivery.id, status: delivery.status },
          data: {
            status: 'cancelled',
            offeredRiderId: null,
            events: {
              push: {
                status: 'cancelled',
                at: new Date(),
                note: `${shop.name} cancelled the order`,
              },
            },
          },
        });
        if (count === 0) throw this.changed(id);
        const riderId = delivery.riderId ?? delivery.offeredRiderId;
        riderToTell = riderId
          ? await this.prisma.riders.findUnique({
              where: { id: riderId },
              select: { name: true, email: true },
            })
          : null;
      }
    }

    const updated = await this.move(record, status);
    if (status === 'cancelled') await restock(this.prisma, record);

    await this.mail.send({
      to: record.buyerEmail,
      subject:
        status === 'confirmed'
          ? `${shop.name} confirmed order ${record.number}`
          : `${shop.name} cancelled order ${record.number}`,
      paragraphs: [
        status === 'confirmed'
          ? `Hi ${record.buyerName}, ${shop.name} has confirmed your order and is getting it ready. We’ll email you when a rider is on the way.`
          : `Hi ${record.buyerName}, ${shop.name} can’t fulfil order ${record.number}, so it has been cancelled.`,
        ...(note ? [`Their message: ${note}`] : []),
        ...(status === 'confirmed' && record.payNow > 0
          ? [
              `Amount due now: ${formatPrice(record.payNow)}. ${shop.name} will let you know how to pay it.`,
            ]
          : []),
      ],
      link: { label: 'View your orders', url: shopperOrdersUrl() },
    });
    if (riderToTell) {
      await this.mail.send({
        to: riderToTell.email,
        subject: `Delivery for order ${record.number} was cancelled`,
        paragraphs: [
          `Hi ${riderToTell.name}, ${shop.name} cancelled order ${record.number}, so there’s nothing to collect.`,
        ],
        link: { label: 'See your jobs', url: riderPortalUrl() },
      });
    }
    const theirMessage = note ? ` Their message: ${note}` : '';
    await Promise.all([
      this.notifications.notify([
        {
          receiverId: record.userId,
          creatorId: sellerId,
          title:
            status === 'confirmed'
              ? `${shop.name} confirmed order ${record.number}`
              : `${shop.name} cancelled order ${record.number}`,
          message:
            (status === 'confirmed'
              ? 'They’re getting it ready. We’ll let you know when a rider is on the way.'
              : 'They can’t fulfil it, so it has been cancelled.') +
            theirMessage,
          redirectLink: ORDERS_PAGE,
        },
      ]),
      status === 'cancelled' &&
        this.notifications.notifyAdmins({
          creatorId: sellerId,
          title: `Order ${record.number} cancelled`,
          message: `${shop.name} cancelled ${record.buyerName}’s order.${theirMessage}`,
          redirectLink: ORDERS_PAGE,
        }),
    ]);

    const [order] = await withDeliveries(this.prisma, [updated], 'seller');
    return order;
  }

  async deliverySettings(shop: SellerShop): Promise<DeliverySettings> {
    const record = await this.prisma.shops.findUnique({
      where: { id: shop.id },
      select: { deliveryZone: true, deliveryFee: true },
    });
    return {
      ...(isDeliveryZone(record?.deliveryZone) && {
        zone: record.deliveryZone,
      }),
      fee: record?.deliveryFee ?? DEFAULT_DELIVERY_FEE,
    };
  }

  async saveDeliverySettings(
    shop: SellerShop,
    settings: Required<DeliverySettings>,
  ): Promise<DeliverySettings> {
    await this.prisma.shops.update({
      where: { id: shop.id },
      data: { deliveryZone: settings.zone, deliveryFee: settings.fee },
    });
    return settings;
  }

  /** Riders taking jobs in the shop's pickup town, busiest first. */
  async availableRiders(shop: SellerShop): Promise<AvailableRider[]> {
    const { zone } = await this.deliverySettings(shop);
    if (!zone) {
      throw validationError(
        'Choose the town riders collect from in Delivery settings first.',
      );
    }
    const riders = await this.prisma.riders.findMany({
      where: { available: true, zones: { has: zone }, vehicle: { not: null } },
      select: {
        id: true,
        name: true,
        phone_number: true,
        vehicle: true,
        zones: true,
      },
      orderBy: { updatedAt: 'desc' },
      take: MAX_RIDERS_LISTED,
    });
    const done = await completedCounts(
      this.prisma,
      riders.map((rider) => rider.id),
    );
    return riders
      .map((rider) => ({
        id: rider.id,
        name: rider.name,
        phone: rider.phone_number,
        ...(rider.vehicle && { vehicle: rider.vehicle as VehicleType }),
        zones: rider.zones.filter(isDeliveryZone) as DeliveryZone[],
        completedDeliveries: done.get(rider.id) ?? 0,
      }))
      .sort((a, b) => b.completedDeliveries - a.completedDeliveries);
  }

  private async move(
    record: OrderRecord,
    status: OrderStatus,
  ): Promise<OrderRecord> {
    const { count } = await this.prisma.orders.updateMany({
      where: { id: record.id, status: record.status },
      data: { status },
    });
    const updated =
      count > 0
        ? await this.prisma.orders.findUnique({ where: { id: record.id } })
        : null;
    if (!updated) throw this.changed(record.id);
    return updated;
  }

  private changed(id: string) {
    return appError(
      'This order changed while you were looking at it. Refresh and try again.',
      409,
      { id },
      'ORDER_CHANGED',
    );
  }

  private async sellerEmail(shopId: string): Promise<string | undefined> {
    const shop = await this.prisma.shops.findUnique({
      where: { id: shopId },
      select: { seller: { select: { email: true } } },
    });
    return shop?.seller.email;
  }
}
