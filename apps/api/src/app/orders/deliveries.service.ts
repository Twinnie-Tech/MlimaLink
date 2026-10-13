import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { appError, notFound, validationError } from '@org/errors';
import type {
  DeliveryStatus,
  DeliveryZone,
  Order,
  OrderStatus,
  RiderJob,
  RiderProfile,
  RiderProfileInput,
  VehicleType,
} from '@org/models';
import { formatPrice } from '@org/models/catalog';
import {
  DELIVERY_CODE_PATTERN,
  MAX_DELIVERY_CODE_ATTEMPTS,
  canRequestDelivery,
  isDeliveryZone,
  vehicleLabel,
} from '@org/models/delivery';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PrismaService } from '../prisma.service';
import { isObjectId } from '../products/product-mapper';
import type { SignedInRider } from '../rider.guard';
import type { SellerShop } from '../seller.guard';
import {
  ORDERS_PAGE,
  sellerOrdersUrl,
  shopperOrdersUrl,
} from './checkout.service';
import {
  toRiderJob,
  type DeliveryRecord,
  type OrderRecord,
} from './order-mapper';
import {
  completedCounts,
  riderPortalUrl,
  withDeliveries,
} from './orders.service';

/** Jobs a rider can carry at once, so nobody hoards the board. */
export const MAX_ACTIVE_JOBS = 5;
/** How long deliveries stay locked after too many wrong codes. */
export const CODE_LOCK_MINUTES = 15;
/** Riders emailed when a job is posted to everyone in a town. */
const MAX_RIDERS_NOTIFIED = 20;
const MAX_JOBS_LISTED = 50;
const MAX_DELIVERIES_LISTED = 100;

type Point = { lat: number; lng: number };

@Injectable()
export class DeliveriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Offers the order to one rider, or posts it for every rider in the shop's town. */
  async request(
    shop: SellerShop,
    orderId: string,
    riderId?: string,
  ): Promise<Order> {
    const order = isObjectId(orderId)
      ? await this.prisma.orders.findFirst({
          where: { id: orderId, shopId: shop.id },
        })
      : null;
    if (!order) throw notFound('Order', { id: orderId });

    const existing = await this.prisma.deliveries.findUnique({
      where: { orderId: order.id },
    });
    if (
      !canRequestDelivery(
        order.status as OrderStatus,
        existing?.status as DeliveryStatus | undefined,
      )
    ) {
      if (order.status !== 'confirmed') {
        throw validationError('Confirm the order before asking for a rider.');
      }
      throw appError(
        'A rider is already being arranged for this order.',
        409,
        { orderId: order.id },
        'DELIVERY_ACTIVE',
      );
    }

    const settings = await this.prisma.shops.findUnique({
      where: { id: shop.id },
      select: { deliveryZone: true, address: true },
    });
    const zone = settings?.deliveryZone;
    if (!isDeliveryZone(zone)) {
      throw validationError(
        'Choose the town riders collect from in Delivery settings first.',
      );
    }

    let rider: { id: string; name: string; email: string } | null = null;
    if (riderId) {
      rider = isObjectId(riderId)
        ? await this.prisma.riders.findFirst({
            where: {
              id: riderId,
              available: true,
              zones: { has: zone },
              vehicle: { not: null },
            },
            select: { id: true, name: true, email: true },
          })
        : null;
      if (!rider) {
        throw validationError(
          `That rider isn’t taking jobs in ${zone} right now. Pick another or post the job to all riders.`,
        );
      }
    }

    const status: DeliveryStatus = rider ? 'offered' : 'open';
    const event = {
      status,
      at: new Date(),
      note: rider ? `Offered to ${rider.name}` : `Posted to riders in ${zone}`,
    };
    const data = {
      status,
      offeredRiderId: rider?.id ?? null,
      riderId: null,
      fee: order.deliveryFee,
      pickupZone: zone,
      dropoffZone: order.address.zone,
      codeAttempts: 0,
      codeLockedUntil: null,
    };

    if (existing) {
      const { count } = await this.prisma.deliveries.updateMany({
        where: { id: existing.id, status: existing.status },
        data: { ...data, events: { push: event } },
      });
      if (count === 0) throw this.changed(existing.id);
    } else {
      try {
        await this.prisma.deliveries.create({
          data: {
            ...data,
            orderId: order.id,
            shopId: shop.id,
            events: [event],
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw this.changed(order.id);
        }
        throw error;
      }
    }

    const summary = [
      `Collect from: ${shop.name}, ${settings?.address ?? zone}`,
      `Deliver to: ${order.address.area}, ${order.address.zone}`,
      `You earn: ${formatPrice(order.deliveryFee)}`,
    ].join('\n');
    if (rider) {
      await this.mail.send({
        to: rider.email,
        subject: `${shop.name} wants you to deliver order ${order.number}`,
        paragraphs: [
          `Hi ${rider.name}, ${shop.name} picked you to deliver an order.`,
          summary,
          'Accept or decline it from your rider dashboard.',
        ],
        link: { label: 'Open your jobs', url: riderPortalUrl() },
      });
    } else {
      const nearby = await this.prisma.riders.findMany({
        where: {
          available: true,
          zones: { has: zone },
          vehicle: { not: null },
        },
        select: { email: true, name: true },
        take: MAX_RIDERS_NOTIFIED,
      });
      await Promise.all(
        nearby.map((entry) =>
          this.mail.send({
            to: entry.email,
            subject: `New delivery job in ${zone}`,
            paragraphs: [
              `Hi ${entry.name}, there’s a new delivery job in ${zone}. The first rider to accept gets it.`,
              summary,
            ],
            link: { label: 'See the job', url: riderPortalUrl() },
          }),
        ),
      );
    }

    return this.orderView(order);
  }

  /** Withdraws a request nobody has accepted yet. */
  async cancelRequest(shop: SellerShop, orderId: string): Promise<Order> {
    const order = isObjectId(orderId)
      ? await this.prisma.orders.findFirst({
          where: { id: orderId, shopId: shop.id },
        })
      : null;
    if (!order) throw notFound('Order', { id: orderId });

    const { count } = await this.prisma.deliveries.updateMany({
      where: { orderId: order.id, status: { in: ['open', 'offered'] } },
      data: {
        status: 'cancelled',
        offeredRiderId: null,
        events: {
          push: {
            status: 'cancelled',
            at: new Date(),
            note: `${shop.name} withdrew the request`,
          },
        },
      },
    });
    if (count === 0) {
      throw appError(
        'There’s no waiting request to withdraw. A rider may have just accepted it.',
        409,
        { orderId: order.id },
        'DELIVERY_NOT_WAITING',
      );
    }
    return this.orderView(order);
  }

  async profile(rider: SignedInRider): Promise<RiderProfile> {
    const done = await completedCounts(this.prisma, [rider.id]);
    return {
      id: rider.id,
      name: rider.name,
      email: rider.email,
      phone: rider.phone_number,
      ...(rider.vehicle && { vehicle: rider.vehicle as VehicleType }),
      zones: rider.zones.filter(isDeliveryZone) as DeliveryZone[],
      available: rider.available,
      completedDeliveries: done.get(rider.id) ?? 0,
    };
  }

  async saveProfile(
    rider: SignedInRider,
    input: RiderProfileInput,
  ): Promise<RiderProfile> {
    const saved = await this.prisma.riders.update({
      where: { id: rider.id },
      data: input,
      select: { vehicle: true, zones: true, available: true },
    });
    return this.profile({ ...rider, ...saved });
  }

  /** Offers made to this rider, plus open jobs in their towns while they're taking jobs. */
  async jobs(rider: SignedInRider): Promise<RiderJob[]> {
    const records = await this.prisma.deliveries.findMany({
      where: {
        OR: [
          { status: 'offered', offeredRiderId: rider.id },
          ...(rider.available && rider.zones.length
            ? [{ status: 'open', pickupZone: { in: rider.zones } }]
            : []),
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: MAX_JOBS_LISTED,
    });
    return this.jobViews(records, rider.id);
  }

  async myDeliveries(rider: SignedInRider): Promise<RiderJob[]> {
    const records = await this.prisma.deliveries.findMany({
      where: { riderId: rider.id },
      orderBy: { updatedAt: 'desc' },
      take: MAX_DELIVERIES_LISTED,
    });
    return this.jobViews(records, rider.id);
  }

  /** First rider to accept an open job gets it; an offer can only be accepted by its rider. */
  async accept(rider: SignedInRider, id: string): Promise<RiderJob> {
    if (!rider.vehicle || rider.zones.length === 0) {
      throw validationError(
        'Add your vehicle and the towns you deliver in before taking jobs.',
      );
    }
    if (!rider.available) {
      throw validationError('Switch on “Taking jobs” before accepting one.');
    }
    const active = await this.prisma.deliveries.count({
      where: { riderId: rider.id, status: { in: ['assigned', 'picked_up'] } },
    });
    if (active >= MAX_ACTIVE_JOBS) {
      throw validationError(
        `You’re carrying ${active} jobs already. Deliver some before taking more.`,
      );
    }

    const { count } = isObjectId(id)
      ? await this.prisma.deliveries.updateMany({
          where: {
            id,
            OR: [
              { status: 'open', pickupZone: { in: rider.zones } },
              { status: 'offered', offeredRiderId: rider.id },
            ],
          },
          data: {
            status: 'assigned',
            riderId: rider.id,
            offeredRiderId: null,
            events: {
              push: {
                status: 'assigned',
                at: new Date(),
                note: `${rider.name} accepted`,
              },
            },
          },
        })
      : { count: 0 };
    if (count === 0) {
      throw appError(
        'Another rider took this job, or it was withdrawn.',
        409,
        { id },
        'JOB_TAKEN',
      );
    }

    const { delivery, order } = await this.load(id);
    const vehicle = rider.vehicle
      ? ` (${vehicleLabel(rider.vehicle as VehicleType).toLowerCase()})`
      : '';
    const seller = await this.sellerEmail(order.shopId);
    await Promise.all([
      seller &&
        this.mail.send({
          to: seller,
          subject: `${rider.name} will collect order ${order.number}`,
          paragraphs: [
            `${rider.name}${vehicle} accepted the delivery for order ${order.number} and is on the way to collect it.`,
            `Rider’s phone: ${rider.phone_number}`,
          ],
          link: { label: 'Open your orders', url: sellerOrdersUrl() },
        }),
      this.mail.send({
        to: order.buyerEmail,
        subject: `A rider is collecting order ${order.number}`,
        paragraphs: [
          `Hi ${order.buyerName}, ${rider.name}${vehicle} is collecting your order from ${order.shopName}.`,
          `Rider’s phone: ${rider.phone_number}`,
        ],
        link: { label: 'Track your order', url: shopperOrdersUrl() },
      }),
    ]);

    return this.jobView(delivery, order, rider.id);
  }

  async decline(rider: SignedInRider, id: string): Promise<void> {
    const { count } = isObjectId(id)
      ? await this.prisma.deliveries.updateMany({
          where: { id, status: 'offered', offeredRiderId: rider.id },
          data: {
            status: 'declined',
            offeredRiderId: null,
            events: {
              push: {
                status: 'declined',
                at: new Date(),
                note: `${rider.name} declined`,
              },
            },
          },
        })
      : { count: 0 };
    if (count === 0) {
      throw appError(
        'This offer is no longer open.',
        409,
        { id },
        'OFFER_CLOSED',
      );
    }

    const { order } = await this.load(id);
    const seller = await this.sellerEmail(order.shopId);
    if (seller) {
      await this.mail.send({
        to: seller,
        subject: `${rider.name} can’t deliver order ${order.number}`,
        paragraphs: [
          `${rider.name} declined the delivery for order ${order.number}. Pick another rider or post the job to every rider in your town.`,
        ],
        link: { label: 'Find another rider', url: sellerOrdersUrl() },
      });
    }
  }

  async pickUp(
    rider: SignedInRider,
    id: string,
    point?: Point,
  ): Promise<RiderJob> {
    const at = new Date();
    const { count } = isObjectId(id)
      ? await this.prisma.deliveries.updateMany({
          where: { id, riderId: rider.id, status: 'assigned' },
          data: {
            status: 'picked_up',
            events: { push: { status: 'picked_up', at, ...point } },
            ...(point && { lastLocation: { set: { ...point, at } } }),
          },
        })
      : { count: 0 };
    if (count === 0) {
      throw validationError(
        'Only a job you’ve accepted and not yet picked up can be marked as picked up.',
      );
    }

    const { delivery, order } = await this.load(id);
    await this.prisma.orders.updateMany({
      where: { id: order.id, status: 'confirmed' },
      data: { status: 'out_for_delivery' },
    });
    await this.mail.send({
      to: order.buyerEmail,
      subject: `Order ${order.number} is on the way`,
      paragraphs: [
        `Hi ${order.buyerName}, ${rider.name} has collected your order from ${order.shopName} and is on the way.`,
        `Your delivery code is ${order.deliveryCode}. Give it to the rider only once you have your order.`,
        ...(order.onDelivery > 0
          ? [`Have ${formatPrice(order.onDelivery)} ready to pay on delivery.`]
          : []),
        `Rider’s phone: ${rider.phone_number}`,
      ],
      link: { label: 'Track your order', url: shopperOrdersUrl() },
    });
    await this.notifications.notify([
      {
        receiverId: order.userId,
        creatorId: rider.id,
        title: `Order ${order.number} is on the way`,
        message: `${rider.name} has collected it from ${order.shopName}. Give them your delivery code only once you have your order.`,
        redirectLink: ORDERS_PAGE,
      },
    ]);

    return this.jobView(
      delivery,
      { ...order, status: 'out_for_delivery' },
      rider.id,
    );
  }

  /** Completes the delivery once the rider enters the shopper's code. */
  async deliver(
    rider: SignedInRider,
    id: string,
    code: string,
    point?: Point,
    now = new Date(),
  ): Promise<RiderJob> {
    const delivery = isObjectId(id)
      ? await this.prisma.deliveries.findFirst({
          where: { id, riderId: rider.id },
        })
      : null;
    if (!delivery) throw notFound('Delivery', { id });
    if (delivery.status !== 'picked_up') {
      throw validationError(
        delivery.status === 'delivered'
          ? 'This order has already been delivered.'
          : 'Mark the order as picked up first.',
      );
    }
    if (delivery.codeLockedUntil && delivery.codeLockedUntil > now) {
      throw this.locked(delivery.codeLockedUntil, now);
    }

    const order = await this.prisma.orders.findUnique({
      where: { id: delivery.orderId },
    });
    if (!order) throw notFound('Order', { id: delivery.orderId });

    if (!DELIVERY_CODE_PATTERN.test(code) || code !== order.deliveryCode) {
      const attempts = delivery.codeAttempts + 1;
      if (attempts >= MAX_DELIVERY_CODE_ATTEMPTS) {
        const until = new Date(now.getTime() + CODE_LOCK_MINUTES * 60_000);
        await this.prisma.deliveries.update({
          where: { id },
          data: { codeAttempts: 0, codeLockedUntil: until },
        });
        throw this.locked(until, now);
      }
      await this.prisma.deliveries.update({
        where: { id },
        data: { codeAttempts: attempts },
      });
      const left = MAX_DELIVERY_CODE_ATTEMPTS - attempts;
      throw validationError(
        `That code doesn’t match. ${left} ${left === 1 ? 'try' : 'tries'} left.`,
      );
    }

    const { count } = await this.prisma.deliveries.updateMany({
      where: { id, riderId: rider.id, status: 'picked_up' },
      data: {
        status: 'delivered',
        codeAttempts: 0,
        codeLockedUntil: null,
        events: { push: { status: 'delivered', at: now, ...point } },
        ...(point && { lastLocation: { set: { ...point, at: now } } }),
      },
    });
    if (count === 0) throw this.changed(id);
    await this.prisma.orders.updateMany({
      where: {
        id: order.id,
        status: { in: ['confirmed', 'out_for_delivery'] },
      },
      data: { status: 'delivered' },
    });

    const seller = await this.sellerEmail(order.shopId);
    await Promise.all([
      seller &&
        this.mail.send({
          to: seller,
          subject: `Order ${order.number} was delivered`,
          paragraphs: [
            `${rider.name} delivered order ${order.number} to ${order.buyerName}.`,
            ...(order.onDelivery > 0
              ? [
                  `${formatPrice(order.onDelivery)} was due from the shopper on delivery.`,
                ]
              : []),
          ],
          link: { label: 'Open your orders', url: sellerOrdersUrl() },
        }),
      this.mail.send({
        to: order.buyerEmail,
        subject: `Order ${order.number} was delivered`,
        paragraphs: [
          `Hi ${order.buyerName}, your order from ${order.shopName} has been delivered. Enjoy!`,
        ],
        link: { label: 'View your orders', url: shopperOrdersUrl() },
      }),
      this.notifications.notify([
        {
          receiverId: order.userId,
          creatorId: rider.id,
          title: `Order ${order.number} was delivered`,
          message: `Your order from ${order.shopName} has been delivered. Enjoy!`,
          redirectLink: ORDERS_PAGE,
        },
      ]),
      this.notifications.notifyShop(order.shopId, {
        creatorId: rider.id,
        title: `Order ${order.number} was delivered`,
        message: `${rider.name} delivered it to ${order.buyerName}.`,
        redirectLink: ORDERS_PAGE,
      }),
    ]);

    const { delivery: updated } = await this.load(id);
    return this.jobView(updated, { ...order, status: 'delivered' }, rider.id);
  }

  /** Stores where the rider is, for the shopper and seller to follow. */
  async shareLocation(
    rider: SignedInRider,
    id: string,
    point: Point,
  ): Promise<void> {
    const { count } = isObjectId(id)
      ? await this.prisma.deliveries.updateMany({
          where: {
            id,
            riderId: rider.id,
            status: { in: ['assigned', 'picked_up'] },
          },
          data: { lastLocation: { set: { ...point, at: new Date() } } },
        })
      : { count: 0 };
    if (count === 0) {
      throw validationError(
        'You can only share your location on a delivery you’re carrying.',
      );
    }
  }

  private async orderView(order: OrderRecord): Promise<Order> {
    const [view] = await withDeliveries(this.prisma, [order], 'seller');
    return view;
  }

  private async load(
    id: string,
  ): Promise<{ delivery: DeliveryRecord; order: OrderRecord }> {
    const delivery = await this.prisma.deliveries.findUnique({
      where: { id },
    });
    const order = delivery
      ? await this.prisma.orders.findUnique({ where: { id: delivery.orderId } })
      : null;
    if (!delivery || !order) throw notFound('Delivery', { id });
    return { delivery, order };
  }

  private async jobView(
    delivery: DeliveryRecord,
    order: OrderRecord,
    riderId: string,
  ): Promise<RiderJob> {
    const [job] = await this.jobViews([delivery], riderId, [order]);
    return job;
  }

  private async jobViews(
    deliveries: DeliveryRecord[],
    riderId: string,
    known: OrderRecord[] = [],
  ): Promise<RiderJob[]> {
    if (deliveries.length === 0) return [];
    const missing = deliveries
      .map((delivery) => delivery.orderId)
      .filter((orderId) => !known.some((order) => order.id === orderId));
    const orders = [
      ...known,
      ...(missing.length
        ? await this.prisma.orders.findMany({
            where: { id: { in: missing } },
          })
        : []),
    ];
    const shops = await this.prisma.shops.findMany({
      where: { id: { in: [...new Set(deliveries.map((d) => d.shopId))] } },
      select: {
        id: true,
        name: true,
        address: true,
        seller: { select: { phone_number: true } },
      },
    });
    const orderById = new Map(orders.map((order) => [order.id, order]));
    const shopById = new Map(shops.map((shop) => [shop.id, shop]));
    return deliveries.flatMap((delivery) => {
      const order = orderById.get(delivery.orderId);
      return order
        ? [toRiderJob(delivery, order, shopById.get(delivery.shopId), riderId)]
        : [];
    });
  }

  private locked(until: Date, now: Date) {
    const minutes = Math.max(
      1,
      Math.ceil((until.getTime() - now.getTime()) / 60_000),
    );
    return appError(
      `Too many wrong codes. Ask the shopper to check the code on their MlimaLink orders page and try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      423,
      { until: until.toISOString() },
      'DELIVERY_CODE_LOCKED',
    );
  }

  private changed(id: string) {
    return appError(
      'This delivery changed while you were looking at it. Refresh and try again.',
      409,
      { id },
      'DELIVERY_CHANGED',
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
