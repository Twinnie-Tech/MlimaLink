import { getProducer } from '../kafka/index.js';

/** Topic shopper activity is published to; kafka-service turns it into analytics. */
export const USER_EVENTS_TOPIC = 'user_events';

/** Actions on a product. They need a productId and count towards the shopper's analytics. */
export const PRODUCT_ACTIONS = [
  'product_view',
  'add_to_wishlist',
  'remove_from_wishlist',
  'add_to_cart',
  'remove_from_cart',
  'purchase',
] as const;

export const USER_EVENT_ACTIONS = ['shop_visit', ...PRODUCT_ACTIONS] as const;

export type ProductAction = (typeof PRODUCT_ACTIONS)[number];
export type UserEventAction = (typeof USER_EVENT_ACTIONS)[number];

/** Published by the api itself when an order is placed, so clients can't claim them. */
export type ServerOnlyAction = 'purchase';
export type ClientEventAction = Exclude<UserEventAction, ServerOnlyAction>;

export const CLIENT_EVENT_ACTIONS = USER_EVENT_ACTIONS.filter(
  (action): action is ClientEventAction => action !== 'purchase',
);

export interface UserEvent {
  userId: string;
  action: UserEventAction;
  /** Set for product actions. */
  productId?: string;
  /** The shop visited, or the shop selling the product. */
  shopId?: string;
  /** ISO date string. */
  timestamp: string;
}

/** What a client reports; the server adds who did it and when. */
export type UserEventInput = Pick<UserEvent, 'productId' | 'shopId'> & {
  action: ClientEventAction;
};

const OBJECT_ID = /^[a-f\d]{24}$/i;

const isObjectId = (value: unknown): value is string =>
  typeof value === 'string' && OBJECT_ID.test(value);

export function isUserEventAction(value: unknown): value is UserEventAction {
  return USER_EVENT_ACTIONS.includes(value as UserEventAction);
}

export function isProductAction(value: unknown): value is ProductAction {
  return PRODUCT_ACTIONS.includes(value as ProductAction);
}

type EventFields = Pick<UserEvent, 'action' | 'productId' | 'shopId'>;

function parseEventFields(
  body: unknown,
  allowed: readonly UserEventAction[],
): { event: EventFields } | { error: string } {
  const input = (body ?? {}) as Record<string, unknown>;
  const { action, productId, shopId } = input;
  if (!allowed.includes(action as UserEventAction)) {
    return { error: `action must be one of ${allowed.join(', ')}.` };
  }
  const known = action as UserEventAction;
  if (productId !== undefined && !isObjectId(productId)) {
    return { error: 'productId must be a product id.' };
  }
  if (shopId !== undefined && !isObjectId(shopId)) {
    return { error: 'shopId must be a shop id.' };
  }
  if (known === 'shop_visit' && !shopId) {
    return { error: 'A shop visit needs a shopId.' };
  }
  if (isProductAction(known) && !productId) {
    return { error: `${known} needs a productId.` };
  }
  return {
    event: {
      action: known,
      ...(productId ? { productId } : {}),
      ...(shopId ? { shopId } : {}),
    },
  };
}

/**
 * Checks a client's { action, productId?, shopId? }: shop visits need a shopId, product
 * actions a productId, and purchases can't be reported this way.
 */
export function parseUserEventInput(
  body: unknown,
): { event: UserEventInput } | { error: string } {
  return parseEventFields(body, CLIENT_EVENT_ACTIONS) as
    { event: UserEventInput } | { error: string };
}

/** Reads a message from the user_events topic; null when it isn't a valid event. */
export function parseUserEvent(raw: string | undefined): UserEvent | null {
  if (!raw) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = parseEventFields(data, USER_EVENT_ACTIONS);
  if ('error' in parsed) return null;
  const { userId, timestamp } = data as Record<string, unknown>;
  if (!isObjectId(userId)) return null;
  if (typeof timestamp !== 'string' || Number.isNaN(Date.parse(timestamp))) {
    return null;
  }
  return { userId, ...parsed.event, timestamp };
}

/**
 * Publishes events to the user_events topic in one request, keyed by user so each
 * shopper's events stay in order. Never throws: tracking must not break what the
 * shopper was doing.
 */
export async function sendUserEvents(events: UserEvent[]): Promise<boolean> {
  if (events.length === 0) return true;
  try {
    const connected = await getProducer();
    await connected.send({
      topic: USER_EVENTS_TOPIC,
      messages: events.map((event) => ({
        key: event.userId,
        value: JSON.stringify(event),
      })),
    });
    return true;
  } catch (error) {
    console.error(
      `Couldn't send user event to Kafka: ${error instanceof Error ? error.message : error}`,
    );
    return false;
  }
}

export function sendUserEvent(event: UserEvent): Promise<boolean> {
  return sendUserEvents([event]);
}
