'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { PaymentOption, Product, ProductVariant } from '@org/models';
import {
  formatPrice,
  listingTerms,
  paymentOptionsOf,
  priceRange,
  unitPrice,
} from '@org/models/catalog';
import { normaliseCode } from '@org/models/checkout';
import type { ProductActivity } from '../utils/events-api';

export const SHOP_STORAGE_KEY = 'mlimalink-shop';

/** The colour, size, etc. the shopper picked for a cart line. */
export interface CartVariant {
  sku?: string;
  choices: Record<string, string>;
  price?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  variant?: CartVariant;
  /** How the shopper will pay for this line; see `cartPaymentOption`. */
  paymentOption?: PaymentOption;
}

/** Tells apart lines of the same product, e.g. Black / 42 and White / 42. Plain products use their id. */
export function cartLineId({
  product,
  variant,
}: Pick<CartItem, 'product' | 'variant'>): string {
  if (!variant) return product.id;
  const choices = Object.entries(variant.choices)
    .map(([name, value]) => `${name}=${value}`)
    .sort();
  return `${product.id}?${choices.join('&')}`;
}

export function cartItemPrice({ product, variant }: CartItem): number {
  return unitPrice(product, variant);
}

/** The shopper's pick when the seller still accepts it, else the seller's first option. */
export function cartPaymentOption({
  product,
  paymentOption,
}: Pick<CartItem, 'product' | 'paymentOption'>): PaymentOption {
  const accepted = paymentOptionsOf(product);
  return paymentOption && accepted.includes(paymentOption)
    ? paymentOption
    : accepted[0];
}

const toCartVariant = ({
  sku,
  choices,
  price,
}: ProductVariant): CartVariant => ({
  choices,
  ...(sku ? { sku } : {}),
  ...(price !== undefined ? { price } : {}),
});

export interface ShopStore {
  /** False until saved state has been read from localStorage. */
  ready: boolean;
  wishlist: Product[];
  cart: CartItem[];
  cartCount: number;
  cartSubtotal: number;
  isWishlisted: (productId: string) => boolean;
  toggleWishlist: (product: Product) => void;
  removeFromWishlist: (productId: string) => void;
  /** Pass the chosen variant for products with options; each variant gets its own line. */
  addToCart: (
    product: Product,
    variant?: ProductVariant,
    quantity?: number,
  ) => void;
  /** Takes a `cartLineId`, which is the product id for products without options. */
  updateCartQuantity: (lineId: string, quantity: number) => void;
  setCartPaymentOption: (lineId: string, option: PaymentOption) => void;
  removeFromCart: (lineId: string) => void;
  /** Empties the cart and forgets the discount code, e.g. after checkout. */
  clearCart: () => void;
  /** The code the shopper entered, kept with the cart; checked again whenever the cart changes. */
  discountCode: string | null;
  setDiscountCode: (code: string | null) => void;
}

const ShopStoreContext = createContext<ShopStore | null>(null);

export function ShopStoreProvider({
  children,
  onActivity,
}: {
  children: React.ReactNode;
  /** Told when the shopper adds a product to, or removes one from, the wishlist or cart. */
  onActivity?: (activity: ProductActivity) => void;
}) {
  const [ready, setReady] = useState(false);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [discountCode, setDiscountCodeState] = useState<string | null>(null);

  // Read after mount so server and first client render match.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY) ?? '{}');
      if (Array.isArray(saved.wishlist)) setWishlist(saved.wishlist);
      if (Array.isArray(saved.cart)) setCart(saved.cart);
      if (typeof saved.discountCode === 'string') {
        setDiscountCodeState(saved.discountCode);
      }
    } catch {
      localStorage.removeItem(SHOP_STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(
      SHOP_STORAGE_KEY,
      JSON.stringify({ wishlist, cart, discountCode }),
    );
  }, [ready, wishlist, cart, discountCode]);

  const isWishlisted = useCallback(
    (productId: string) => wishlist.some((p) => p.id === productId),
    [wishlist],
  );

  const toggleWishlist = useCallback(
    (product: Product) => {
      const adding = !wishlist.some((p) => p.id === product.id);
      setWishlist((current) =>
        current.some((p) => p.id === product.id)
          ? current.filter((p) => p.id !== product.id)
          : [...current, product],
      );
      onActivity?.({
        action: adding ? 'add_to_wishlist' : 'remove_from_wishlist',
        productId: product.id,
      });
    },
    [wishlist, onActivity],
  );

  const removeFromWishlist = useCallback(
    (productId: string) => {
      if (!wishlist.some((p) => p.id === productId)) return;
      setWishlist((current) => current.filter((p) => p.id !== productId));
      onActivity?.({ action: 'remove_from_wishlist', productId });
    },
    [wishlist, onActivity],
  );

  const addToCart = useCallback(
    (product: Product, variant?: ProductVariant, quantity = 1) => {
      const line: CartItem = variant
        ? { product, quantity, variant: toCartVariant(variant) }
        : { product, quantity };
      const lineId = cartLineId(line);
      setCart((current) => {
        const existing = current.find((item) => cartLineId(item) === lineId);
        if (existing) {
          return current.map((item) =>
            item === existing
              ? { ...item, quantity: item.quantity + quantity }
              : item,
          );
        }
        return [...current, line];
      });
      onActivity?.({ action: 'add_to_cart', productId: product.id });
    },
    [onActivity],
  );

  const updateCartQuantity = useCallback((lineId: string, quantity: number) => {
    setCart((current) =>
      current.map((item) =>
        cartLineId(item) === lineId
          ? { ...item, quantity: Math.max(1, quantity) }
          : item,
      ),
    );
  }, []);

  const setCartPaymentOption = useCallback(
    (lineId: string, paymentOption: PaymentOption) => {
      setCart((current) =>
        current.map((item) =>
          cartLineId(item) === lineId ? { ...item, paymentOption } : item,
        ),
      );
    },
    [],
  );

  const removeFromCart = useCallback(
    (lineId: string) => {
      const removed = cart.find((item) => cartLineId(item) === lineId);
      setCart((current) =>
        current.filter((item) => cartLineId(item) !== lineId),
      );
      // Another colour or size of the same product can still be in the cart.
      const productId = removed?.product.id;
      if (
        productId &&
        !cart.some((item) => item !== removed && item.product.id === productId)
      ) {
        onActivity?.({ action: 'remove_from_cart', productId });
      }
    },
    [cart, onActivity],
  );

  const clearCart = useCallback(() => {
    setCart([]);
    setDiscountCodeState(null);
  }, []);

  const setDiscountCode = useCallback((code: string | null) => {
    setDiscountCodeState(code === null ? null : normaliseCode(code) || null);
  }, []);

  const value = useMemo<ShopStore>(
    () => ({
      ready,
      wishlist,
      cart,
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartSubtotal: cart.reduce(
        (sum, item) => sum + cartItemPrice(item) * item.quantity,
        0,
      ),
      isWishlisted,
      toggleWishlist,
      removeFromWishlist,
      addToCart,
      updateCartQuantity,
      setCartPaymentOption,
      removeFromCart,
      clearCart,
      discountCode,
      setDiscountCode,
    }),
    [
      ready,
      wishlist,
      cart,
      isWishlisted,
      toggleWishlist,
      removeFromWishlist,
      addToCart,
      updateCartQuantity,
      setCartPaymentOption,
      removeFromCart,
      clearCart,
      discountCode,
      setDiscountCode,
    ],
  );

  return (
    <ShopStoreContext.Provider value={value}>
      {children}
    </ShopStoreContext.Provider>
  );
}

export function useShopStore() {
  const store = useContext(ShopStoreContext);
  if (!store) {
    throw new Error('useShopStore must be used inside <ShopStoreProvider>');
  }
  return store;
}

export { formatPrice };

/** "$45.00", "From $45.00" when the variants cost different amounts or it's a service's starting price, plus " / month" for rentals. */
export function formatProductPrice(product: Product) {
  const { min, max } = priceRange(product);
  const { pricePeriod, service } = listingTerms(product);
  return `${min === max && !service ? '' : 'From '}${formatPrice(min)}${pricePeriod ? ` / ${pricePeriod}` : ''}`;
}
