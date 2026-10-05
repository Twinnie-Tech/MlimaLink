import type { Prisma } from '@prisma/client';
import type { ProductAction, UserEvent } from '@org/utils/events';
import { prisma } from '../prisma';

/** How many of a shopper's latest product actions user_analytics keeps. */
export const USER_ACTIONS_KEPT = 100;

/** Removing a product undoes its earlier add, so the history shows what's still wanted. */
const UNDOES: Partial<Record<ProductAction, ProductAction>> = {
  remove_from_wishlist: 'add_to_wishlist',
  remove_from_cart: 'add_to_cart',
};

/**
 * Records a product action in the shopper's history for recommendations: views and
 * adds are appended, removals delete the matching add.
 */
export async function updateUserAnalytics(event: UserEvent): Promise<void> {
  const { userId, action, productId, shopId } = event;
  if (!productId) return;
  const at = new Date(event.timestamp);

  const existing = await prisma.user_analytics.findUnique({
    where: { userId },
    select: { actions: true },
  });
  let actions = existing?.actions ?? [];
  const undone = UNDOES[action as ProductAction];
  if (undone) {
    actions = actions.filter(
      (entry) => !(entry.productId === productId && entry.action === undone),
    );
  } else {
    actions = [...actions, { action, productId, shopId: shopId ?? null, at }];
  }
  actions = actions.slice(-USER_ACTIONS_KEPT);
  const wishlistAdds = action === 'add_to_wishlist' ? 1 : 0;
  const cartAdds = action === 'add_to_cart' ? 1 : 0;

  await prisma.user_analytics.upsert({
    where: { userId },
    create: { userId, actions, wishlistAdds, cartAdds, lastActiveAt: at },
    update: {
      actions: { set: actions },
      wishlistAdds: { increment: wishlistAdds },
      cartAdds: { increment: cartAdds },
      lastActiveAt: at,
    },
  });
}

type ProductCounter = 'views' | 'cartAdds' | 'wishlistAdds' | 'purchases';

const COUNTER_UPS: Partial<Record<ProductAction, ProductCounter>> = {
  product_view: 'views',
  add_to_cart: 'cartAdds',
  add_to_wishlist: 'wishlistAdds',
  purchase: 'purchases',
};

const COUNTER_DOWNS: Partial<Record<ProductAction, ProductCounter>> = {
  remove_from_cart: 'cartAdds',
  remove_from_wishlist: 'wishlistAdds',
};

/** Updates the product's view, cart, wishlist and purchase counts. */
export async function updateProductAnalytics(event: UserEvent): Promise<void> {
  const { productId, shopId } = event;
  if (!productId) return;
  const action = event.action as ProductAction;

  const down = COUNTER_DOWNS[action];
  if (down) {
    // Never below zero, e.g. for items added before tracking started or while signed out.
    await prisma.product_analytics.updateMany({
      where: {
        productId,
        [down]: { gt: 0 },
      } as Prisma.product_analyticsWhereInput,
      data: { [down]: { decrement: 1 } },
    });
    return;
  }

  const up = COUNTER_UPS[action];
  if (!up) return;
  await prisma.product_analytics.upsert({
    where: { productId },
    create: { productId, ...(shopId ? { shopId } : {}), [up]: 1 },
    update: { ...(shopId ? { shopId } : {}), [up]: { increment: 1 } },
  });
}

/** Counts a visit to a shop's page. */
export async function updateShopAnalytics(event: UserEvent): Promise<void> {
  const { shopId } = event;
  if (!shopId) return;
  const at = new Date(event.timestamp);

  await prisma.shop_analytics.upsert({
    where: { shopId },
    create: { shopId, totalVisits: 1, lastVisitedAt: at },
    update: { totalVisits: { increment: 1 }, lastVisitedAt: at },
  });
}
