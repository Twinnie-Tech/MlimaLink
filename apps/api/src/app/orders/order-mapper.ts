import type { Prisma } from '@prisma/client';
import type {
  DeliveryAddress,
  DeliveryStatus,
  DeliverySummary,
  DeliveryZone,
  Order,
  OrderItem,
  OrderStatus,
  PaymentOption,
  RiderContact,
  RiderJob,
  VehicleType,
} from '@org/models';

export type OrderRecord = Prisma.ordersGetPayload<object>;
export type DeliveryRecord = Prisma.deliveriesGetPayload<object>;
export type RiderRecord = {
  id: string;
  name: string;
  phone_number: string;
  vehicle: string | null;
};

export const riderContactSelect = {
  id: true,
  name: true,
  phone_number: true,
  vehicle: true,
} as const;

/** Who is looking: each sees a little less of the others' details. */
export type OrderViewer = 'buyer' | 'seller';

/** The rider's position is only worth showing while they're carrying the order. */
const TRACKED: DeliveryStatus[] = ['assigned', 'picked_up'];

export const riderContact = (rider: RiderRecord): RiderContact => ({
  id: rider.id,
  name: rider.name,
  phone: rider.phone_number,
  ...(rider.vehicle && { vehicle: rider.vehicle as VehicleType }),
});

export function toAddress(record: OrderRecord['address']): DeliveryAddress {
  return {
    recipientName: record.recipientName,
    phone: record.phone,
    zone: record.zone as DeliveryZone,
    area: record.area,
    ...(record.street != null && { street: record.street }),
    ...(record.notes != null && { notes: record.notes }),
  };
}

export function toOrderItem(item: OrderRecord['items'][number]): OrderItem {
  return {
    productId: item.productId,
    name: item.name,
    imageUrl: item.imageUrl,
    ...(item.choices != null && {
      choices: item.choices as Record<string, string>,
    }),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    total: item.total,
    discount: item.discount,
    paymentOption: item.paymentOption as PaymentOption,
  };
}

export function toDeliverySummary(
  record: DeliveryRecord,
  riders: Map<string, RiderRecord>,
  viewer: OrderViewer,
): DeliverySummary {
  const status = record.status as DeliveryStatus;
  const rider = record.riderId ? riders.get(record.riderId) : undefined;
  const offered =
    viewer === 'seller' && record.offeredRiderId
      ? riders.get(record.offeredRiderId)
      : undefined;
  return {
    id: record.id,
    status,
    fee: record.fee,
    ...(rider && { rider: riderContact(rider) }),
    ...(offered && { offeredTo: riderContact(offered) }),
    events: record.events.map((event) => ({
      status: event.status as DeliveryStatus,
      at: event.at.toISOString(),
      ...(event.note != null && { note: event.note }),
    })),
    ...(record.lastLocation &&
      TRACKED.includes(status) && {
        lastLocation: {
          lat: record.lastLocation.lat,
          lng: record.lastLocation.lng,
          at: record.lastLocation.at.toISOString(),
        },
      }),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export function toOrder(
  record: OrderRecord,
  viewer: OrderViewer,
  delivery?: DeliveryRecord | null,
  riders: Map<string, RiderRecord> = new Map(),
): Order {
  return {
    id: record.id,
    number: record.number,
    shopId: record.shopId,
    shopName: record.shopName,
    buyerName: record.buyerName,
    buyerEmail: record.buyerEmail,
    address: toAddress(record.address),
    items: record.items.map(toOrderItem),
    subtotal: record.subtotal,
    discount: record.discount,
    ...(record.discountCode != null && { discountCode: record.discountCode }),
    deliveryFee: record.deliveryFee,
    total: record.total,
    payNow: record.payNow,
    onDelivery: record.onDelivery,
    status: record.status as OrderStatus,
    ...(viewer === 'buyer' && { deliveryCode: record.deliveryCode }),
    ...(delivery && {
      delivery: toDeliverySummary(delivery, riders, viewer),
    }),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export type PickupShop = {
  id: string;
  name: string;
  address: string;
  seller: { phone_number: string };
};

/** A delivery for a rider. The shopper's contact details only show once the job is theirs. */
export function toRiderJob(
  delivery: DeliveryRecord,
  order: OrderRecord,
  shop: PickupShop | undefined,
  riderId: string,
): RiderJob {
  const mine = delivery.riderId === riderId;
  const address = toAddress(order.address);
  const summary = toDeliverySummary(delivery, new Map(), 'buyer');
  return {
    id: delivery.id,
    orderNumber: order.number,
    status: summary.status,
    fee: delivery.fee,
    offeredToYou: delivery.offeredRiderId === riderId,
    pickup: {
      shopName: shop?.name ?? order.shopName,
      zone: delivery.pickupZone as DeliveryZone,
      address: shop?.address ?? '',
      ...(mine && shop && { phone: shop.seller.phone_number }),
    },
    dropoff: {
      zone: address.zone,
      area: address.area,
      ...(address.notes && { notes: address.notes }),
      ...(mine && {
        recipientName: address.recipientName,
        phone: address.phone,
        ...(address.street && { street: address.street }),
      }),
    },
    items: order.items.map((item) => ({
      name: item.name,
      quantity: item.quantity,
      ...(item.choices != null && {
        choices: item.choices as Record<string, string>,
      }),
    })),
    collectOnDelivery: order.onDelivery,
    events: summary.events,
    ...(summary.lastLocation && { lastLocation: summary.lastLocation }),
    createdAt: delivery.createdAt.toISOString(),
    updatedAt: delivery.updatedAt.toISOString(),
  };
}
