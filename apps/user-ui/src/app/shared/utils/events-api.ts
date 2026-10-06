import { sendKafkaEvent } from '../../../actions/track-user';

/** Shopper activity the api publishes to Kafka for analytics. */
export type ProductActivity = {
  action:
    | 'product_view'
    | 'add_to_wishlist'
    | 'remove_from_wishlist'
    | 'add_to_cart'
    | 'remove_from_cart';
  productId: string;
};
export type UserActivity =
  ProductActivity | { action: 'shop_visit'; shopId: string };

/** Sample listings have short ids that aren't in the database, so they aren't tracked. */
const OBJECT_ID = /^[a-f\d]{24}$/i;

/**
 * Reports what the signed-in shopper did through the `sendKafkaEvent` server action.
 * Fire-and-forget: tracking failures never reach the shopper. Only call it for
 * signed-in users; guests are ignored.
 */
export function trackUserActivity(activity: UserActivity): void {
  const id =
    activity.action === 'shop_visit' ? activity.shopId : activity.productId;
  if (!OBJECT_ID.test(id)) return;

  void sendKafkaEvent(activity).catch(() => undefined);
}
