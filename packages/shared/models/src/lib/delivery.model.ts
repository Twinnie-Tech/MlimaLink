import type { PaymentOption } from './product.model.js';

/** Towns riders can serve and shoppers can have orders delivered to. */
export const DELIVERY_ZONES = [
  'Nairobi',
  'Kiambu',
  'Thika',
  'Machakos',
  'Kajiado',
  'Mombasa',
  'Kilifi',
  'Malindi',
  'Kisumu',
  'Nakuru',
  'Naivasha',
  'Eldoret',
  'Nyeri',
  'Nanyuki',
  'Meru',
  'Embu',
  'Kakamega',
  'Kisii',
  'Kericho',
  'Garissa',
] as const;

export type DeliveryZone = (typeof DELIVERY_ZONES)[number];

/** ISO 3166-1 alpha-2 code of the country every delivery zone is in. */
export const DELIVERY_COUNTRY = 'KE';

export type VehicleType = 'motorbike' | 'bicycle' | 'car' | 'van' | 'on_foot';

export const VEHICLE_TYPES: { id: VehicleType; label: string }[] = [
  { id: 'motorbike', label: 'Motorbike' },
  { id: 'bicycle', label: 'Bicycle' },
  { id: 'car', label: 'Car' },
  { id: 'van', label: 'Van or pickup' },
  { id: 'on_foot', label: 'On foot' },
];

/** Where the shopper wants the order brought. */
export interface DeliveryAddress {
  recipientName: string;
  /** e.g. "+254712345678" */
  phone: string;
  zone: DeliveryZone;
  /** Estate or neighbourhood, e.g. "Kilimani". */
  area: string;
  /** Street, building and house number. */
  street?: string;
  /** Landmarks or gate instructions for the rider. */
  notes?: string;
}

export type OrderStatus =
  'placed' | 'confirmed' | 'out_for_delivery' | 'delivered' | 'cancelled';

export const ORDER_STATUSES: { id: OrderStatus; label: string }[] = [
  { id: 'placed', label: 'New' },
  { id: 'confirmed', label: 'Confirmed' },
  { id: 'out_for_delivery', label: 'Out for delivery' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Cancelled' },
];

/** One product in an order, copied at checkout so the order reads the same if the listing changes. */
export interface OrderItem {
  productId: string;
  name: string;
  imageUrl: string;
  choices?: Record<string, string>;
  quantity: number;
  /** USD, one unit. */
  unitPrice: number;
  /** unitPrice × quantity. */
  total: number;
  /** Discount code saving on this line. */
  discount: number;
  paymentOption: PaymentOption;
}

/**
 * open: posted for any rider in the pickup zone. offered: sent to one rider.
 * declined: that rider said no, so the seller picks again. assigned: a rider is
 * heading to the shop. picked_up: the rider has the parcel.
 */
export type DeliveryStatus =
  | 'open'
  | 'offered'
  | 'declined'
  | 'assigned'
  | 'picked_up'
  | 'delivered'
  | 'cancelled';

export const DELIVERY_STATUSES: { id: DeliveryStatus; label: string }[] = [
  { id: 'open', label: 'Waiting for a rider' },
  { id: 'offered', label: 'Offered to a rider' },
  { id: 'declined', label: 'Rider declined' },
  { id: 'assigned', label: 'Rider heading to the shop' },
  { id: 'picked_up', label: 'On the way' },
  { id: 'delivered', label: 'Delivered' },
  { id: 'cancelled', label: 'Delivery cancelled' },
];

/** A delivery still in progress; an order has at most one of these at a time. */
export const ACTIVE_DELIVERY_STATUSES: DeliveryStatus[] = [
  'open',
  'offered',
  'assigned',
  'picked_up',
];

/** A rider's reported position. */
export interface GeoPoint {
  lat: number;
  lng: number;
  /** ISO date string. */
  at: string;
}

export interface DeliveryEvent {
  status: DeliveryStatus;
  /** ISO date string. */
  at: string;
  note?: string;
}

export interface RiderContact {
  id: string;
  name: string;
  phone: string;
  vehicle?: VehicleType;
}

export interface DeliverySummary {
  id: string;
  status: DeliveryStatus;
  /** What the rider is paid, USD. */
  fee: number;
  /** Set once a rider has accepted. */
  rider?: RiderContact;
  /** The rider it was offered to, while waiting for their answer. Seller view only. */
  offeredTo?: RiderContact;
  events: DeliveryEvent[];
  lastLocation?: GeoPoint;
  updatedAt: string;
}

export interface Order {
  id: string;
  /** Short reference shown to people, e.g. "ML-7Q2K9D". */
  number: string;
  shopId: string;
  shopName: string;
  buyerName: string;
  buyerEmail: string;
  address: DeliveryAddress;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  discountCode?: string;
  deliveryFee: number;
  /** subtotal − discount + deliveryFee */
  total: number;
  /** Due when ordering, including the delivery fee. */
  payNow: number;
  /** Collected when the order arrives. */
  onDelivery: number;
  /** MlimaLink's share of subtotal − discount; see PLATFORM_FEE_RATE. */
  platformFee: number;
  /** What the shop keeps: subtotal − discount − platformFee. */
  sellerEarnings: number;
  status: OrderStatus;
  /** The shopper gives this to the rider on arrival. Only in the shopper's own view. */
  deliveryCode?: string;
  delivery?: DeliverySummary;
  /** ISO date strings. */
  createdAt: string;
  updatedAt: string;
}

/** One cart line sent to check out; prices are looked up on the server. */
export interface CheckoutItem {
  productId: string;
  choices?: Record<string, string>;
  quantity: number;
  paymentOption: PaymentOption;
}

export interface CheckoutInput {
  items: CheckoutItem[];
  address: DeliveryAddress;
  discountCode?: string;
}

/** What one shop's part of the cart costs; checkout places one order per shop. */
export interface CheckoutGroup {
  shopId: string;
  shopName: string;
  items: OrderItem[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  payNow: number;
  onDelivery: number;
  platformFee: number;
  sellerEarnings: number;
}

export interface CheckoutQuote {
  groups: CheckoutGroup[];
  discountCode?: string;
  /** Why the code wasn't applied, when one was sent. */
  discountError?: string;
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  payNow: number;
  onDelivery: number;
  /** Included in total, not added to it. */
  platformFee: number;
  sellerEarnings: number;
}

/** Where a shop sends parcels from and what it charges shoppers for delivery. */
export interface DeliverySettings {
  /** Unset until the seller picks one; needed before requesting a rider. */
  zone?: DeliveryZone;
  /** USD per order. */
  fee: number;
}

export interface RiderProfileInput {
  vehicle: VehicleType;
  zones: DeliveryZone[];
  /** Whether the rider is taking jobs right now. */
  available: boolean;
}

export interface RiderProfile {
  id: string;
  name: string;
  email: string;
  phone: string;
  vehicle?: VehicleType;
  zones: DeliveryZone[];
  available: boolean;
  completedDeliveries: number;
}

/** A rider a seller can hand an order to. */
export interface AvailableRider {
  id: string;
  name: string;
  phone: string;
  vehicle?: VehicleType;
  zones: DeliveryZone[];
  completedDeliveries: number;
}

/**
 * A delivery as a rider sees it. The shopper's name, phone and street stay hidden
 * until the rider has taken the job.
 */
export interface RiderJob {
  id: string;
  orderNumber: string;
  status: DeliveryStatus;
  /** What the rider is paid, USD. */
  fee: number;
  /** True when a seller picked this rider for the job. */
  offeredToYou: boolean;
  pickup: {
    shopName: string;
    zone: DeliveryZone;
    address: string;
    phone?: string;
  };
  dropoff: {
    zone: DeliveryZone;
    area: string;
    street?: string;
    notes?: string;
    recipientName?: string;
    phone?: string;
  };
  items: { name: string; quantity: number; choices?: Record<string, string> }[];
  /** What the rider collects from the shopper on arrival, USD. */
  collectOnDelivery: number;
  events: DeliveryEvent[];
  lastLocation?: GeoPoint;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_DELIVERY_FEE = 3;
export const MAX_DELIVERY_FEE = 500;
export const MAX_CHECKOUT_LINES = 100;
export const DELIVERY_CODE_PATTERN = /^\d{4}$/;
/** Wrong delivery codes a rider may enter before the job is locked. */
export const MAX_DELIVERY_CODE_ATTEMPTS = 5;

const MAX_QUANTITY = 999;
const PAYMENT_OPTIONS: PaymentOption[] = [
  'full_upfront',
  'deposit',
  'cash_on_delivery',
];
const PHONE = /^\+?[0-9][0-9 ]{6,18}$/;
const CODE = /^[A-Z0-9]{4,16}$/;

/** Where an order can go at the seller's hand. Delivery moves it on from confirmed. */
const SELLER_ORDER_MOVES: Record<OrderStatus, OrderStatus[]> = {
  placed: ['confirmed', 'cancelled'],
  confirmed: ['cancelled'],
  out_for_delivery: [],
  delivered: [],
  cancelled: [],
};

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';

const label = <T extends string>(
  list: { id: T; label: string }[],
  id: T,
): string => list.find((entry) => entry.id === id)?.label ?? id;

export const isDeliveryZone = (value: unknown): value is DeliveryZone =>
  (DELIVERY_ZONES as readonly unknown[]).includes(value);

export const isVehicleType = (value: unknown): value is VehicleType =>
  VEHICLE_TYPES.some((vehicle) => vehicle.id === value);

export const orderStatusLabel = (status: OrderStatus) =>
  label(ORDER_STATUSES, status);

export const deliveryStatusLabel = (status: DeliveryStatus) =>
  label(DELIVERY_STATUSES, status);

export const vehicleLabel = (vehicle: VehicleType) =>
  label(VEHICLE_TYPES, vehicle);

export const canSellerMoveOrder = (from: OrderStatus, to: OrderStatus) =>
  SELLER_ORDER_MOVES[from].includes(to);

export const isActiveDelivery = (status: DeliveryStatus) =>
  ACTIVE_DELIVERY_STATUSES.includes(status);

/** A seller can ask for a rider once the order is confirmed and no delivery is under way. */
export const canRequestDelivery = (
  orderStatus: OrderStatus,
  deliveryStatus?: DeliveryStatus,
) =>
  orderStatus === 'confirmed' &&
  (deliveryStatus === undefined || !isActiveDelivery(deliveryStatus));

/** A Google Maps link to a reported position. */
export const mapsLink = ({ lat, lng }: Pick<GeoPoint, 'lat' | 'lng'>) =>
  `https://www.google.com/maps?q=${lat},${lng}`;

const isChoices = (value: unknown): value is Record<string, string> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((choice) => typeof choice === 'string');

/** Checks where the shopper wants the order brought. */
export function parseDeliveryAddress(
  value: unknown,
): { address: DeliveryAddress } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;

  const recipientName = text(input.recipientName);
  if (recipientName.length < 2 || recipientName.length > 80) {
    return { error: 'Enter the name of the person receiving the order.' };
  }
  const phone = text(input.phone);
  if (!PHONE.test(phone)) {
    return { error: 'Enter a phone number like +254712345678.' };
  }
  if (!isDeliveryZone(input.zone)) {
    return { error: 'Choose the town to deliver to.' };
  }
  const area = text(input.area);
  if (area.length < 2 || area.length > 80) {
    return { error: 'Enter the estate or area, e.g. Kilimani.' };
  }
  const street = text(input.street);
  if (street.length > 120) {
    return { error: 'Keep the street and building under 120 characters.' };
  }
  const notes = text(input.notes);
  if (notes.length > 300) {
    return { error: 'Keep directions for the rider under 300 characters.' };
  }

  return {
    address: {
      recipientName,
      phone: phone.replace(/\s+/g, ''),
      zone: input.zone,
      area,
      ...(street && { street }),
      ...(notes && { notes }),
    },
  };
}

/** Checks the cart lines sent to price or place an order. */
export function parseCheckoutItems(
  rawItems: unknown,
): { items: CheckoutItem[] } | { error: string } {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { error: 'Your cart is empty.' };
  }
  if (rawItems.length > MAX_CHECKOUT_LINES) {
    return {
      error: `Check out up to ${MAX_CHECKOUT_LINES} cart lines at a time.`,
    };
  }
  const items: CheckoutItem[] = [];
  for (const raw of rawItems) {
    const item = (raw ?? {}) as Record<string, unknown>;
    const { productId, quantity, choices, paymentOption } = item;
    if (
      typeof productId !== 'string' ||
      !productId ||
      !Number.isInteger(quantity) ||
      (quantity as number) < 1 ||
      (quantity as number) > MAX_QUANTITY ||
      (choices !== undefined && !isChoices(choices)) ||
      !PAYMENT_OPTIONS.includes(paymentOption as PaymentOption)
    ) {
      return { error: 'Some cart items couldn’t be read.' };
    }
    items.push({
      productId,
      quantity: quantity as number,
      paymentOption: paymentOption as PaymentOption,
      ...(choices !== undefined && { choices }),
    });
  }
  return { items };
}

/** A discount code as typed, tidied; an error when it can't be one. */
export function parseCheckoutCode(
  value: unknown,
): { discountCode?: string } | { error: string } {
  const discountCode = text(value).toUpperCase();
  if (discountCode && !CODE.test(discountCode)) {
    return { error: 'That discount code doesn’t look right.' };
  }
  return discountCode ? { discountCode } : {};
}

/** Checks what the shopper sends to place orders. */
export function parseCheckoutInput(
  value: unknown,
): { checkout: CheckoutInput } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;

  const items = parseCheckoutItems(input.items);
  if ('error' in items) return items;

  const parsed = parseDeliveryAddress(input.address);
  if ('error' in parsed) return parsed;

  const code = parseCheckoutCode(input.discountCode);
  if ('error' in code) return code;

  return {
    checkout: { items: items.items, address: parsed.address, ...code },
  };
}

export const ORDER_NOTE_MAX = 500;

/** Checks a seller confirming or cancelling an order. */
export function parseOrderUpdate(
  value: unknown,
): { status: 'confirmed' | 'cancelled'; note?: string } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;
  const status = input.status;
  if (status !== 'confirmed' && status !== 'cancelled') {
    return { error: 'Choose confirm or cancel.' };
  }
  const note = text(input.note);
  if (note.length > ORDER_NOTE_MAX) {
    return { error: `Keep your message under ${ORDER_NOTE_MAX} characters.` };
  }
  return note ? { status, note } : { status };
}

/** Checks a shop's pickup zone and delivery fee. */
export function parseDeliverySettings(
  value: unknown,
): { settings: Required<DeliverySettings> } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;
  if (!isDeliveryZone(input.zone)) {
    return { error: 'Choose the town riders collect orders from.' };
  }
  const fee = input.fee;
  if (
    typeof fee !== 'number' ||
    !Number.isFinite(fee) ||
    fee < 0 ||
    fee > MAX_DELIVERY_FEE
  ) {
    return {
      error: `Delivery fee must be between 0 and ${MAX_DELIVERY_FEE}.`,
    };
  }
  return {
    settings: { zone: input.zone, fee: Math.round(fee * 100) / 100 },
  };
}

/** Checks a rider's vehicle, zones and availability. */
export function parseRiderProfileInput(
  value: unknown,
): { profile: RiderProfileInput } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;
  if (!isVehicleType(input.vehicle)) {
    return { error: 'Choose how you get around.' };
  }
  const zones = input.zones;
  if (
    !Array.isArray(zones) ||
    zones.length === 0 ||
    !zones.every(isDeliveryZone)
  ) {
    return { error: 'Choose at least one town you deliver in.' };
  }
  return {
    profile: {
      vehicle: input.vehicle,
      zones: [...new Set(zones)],
      available: input.available === true,
    },
  };
}

/** Checks a position a rider's phone reports. */
export function parseLocation(
  value: unknown,
): { lat: number; lng: number } | { error: string } {
  const input = (value ?? {}) as Record<string, unknown>;
  const { lat, lng } = input;
  if (
    typeof lat !== 'number' ||
    typeof lng !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    Math.abs(lat) > 90 ||
    Math.abs(lng) > 180
  ) {
    return { error: 'That location couldn’t be read.' };
  }
  return { lat, lng };
}
