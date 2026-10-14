/** One thing a shopper did with a product, as kafka-service stores it in user_analytics. */
export interface UserAction {
  userId: string;
  productId: string;
  shopId: string | null;
  /** "product_view", "add_to_wishlist", "add_to_cart" or "purchase". */
  action: string;
  at: Date;
}

/** A shopper–product pair the model learns from. */
export interface Interaction {
  userId: string;
  productId: string;
  actionType: string;
}

/** The least a product needs to be recommended; callers can pass richer products through. */
export interface RecommendableProduct {
  id: string;
}

/**
 * Turns shopper actions into interactions for training. Actions on products that are no
 * longer listed are dropped, since they can't be recommended.
 */
export function preprocessData<P extends RecommendableProduct>(
  userActions: UserAction[],
  products: P[],
): { interactions: Interaction[]; products: P[] } {
  const listed = new Set(products.map((product) => product.id));
  const interactions: Interaction[] = [];

  userActions.forEach((action) => {
    if (!listed.has(action.productId)) return;
    interactions.push({
      userId: action.userId,
      productId: action.productId,
      actionType: action.action,
    });
  });

  return { interactions, products };
}
