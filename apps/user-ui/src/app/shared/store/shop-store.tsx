'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { Product } from '@org/models';

export const SHOP_STORAGE_KEY = 'mlimalink-shop';

export interface CartItem {
  product: Product;
  quantity: number;
}

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
  addToCart: (product: Product, quantity?: number) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
}

const ShopStoreContext = createContext<ShopStore | null>(null);

export function ShopStoreProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [wishlist, setWishlist] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);

  // Read after mount so server and first client render match.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SHOP_STORAGE_KEY) ?? '{}');
      if (Array.isArray(saved.wishlist)) setWishlist(saved.wishlist);
      if (Array.isArray(saved.cart)) setCart(saved.cart);
    } catch {
      localStorage.removeItem(SHOP_STORAGE_KEY);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    localStorage.setItem(SHOP_STORAGE_KEY, JSON.stringify({ wishlist, cart }));
  }, [ready, wishlist, cart]);

  const isWishlisted = useCallback(
    (productId: string) => wishlist.some((p) => p.id === productId),
    [wishlist],
  );

  const toggleWishlist = useCallback((product: Product) => {
    setWishlist((current) =>
      current.some((p) => p.id === product.id)
        ? current.filter((p) => p.id !== product.id)
        : [...current, product],
    );
  }, []);

  const removeFromWishlist = useCallback((productId: string) => {
    setWishlist((current) => current.filter((p) => p.id !== productId));
  }, []);

  const addToCart = useCallback((product: Product, quantity = 1) => {
    setCart((current) => {
      const existing = current.find((item) => item.product.id === product.id);
      if (existing) {
        return current.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item,
        );
      }
      return [...current, { product, quantity }];
    });
  }, []);

  const updateCartQuantity = useCallback(
    (productId: string, quantity: number) => {
      setCart((current) =>
        current.map((item) =>
          item.product.id === productId
            ? { ...item, quantity: Math.max(1, quantity) }
            : item,
        ),
      );
    },
    [],
  );

  const removeFromCart = useCallback((productId: string) => {
    setCart((current) =>
      current.filter((item) => item.product.id !== productId),
    );
  }, []);

  const value = useMemo<ShopStore>(
    () => ({
      ready,
      wishlist,
      cart,
      cartCount: cart.reduce((sum, item) => sum + item.quantity, 0),
      cartSubtotal: cart.reduce(
        (sum, item) => sum + item.product.price * item.quantity,
        0,
      ),
      isWishlisted,
      toggleWishlist,
      removeFromWishlist,
      addToCart,
      updateCartQuantity,
      removeFromCart,
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
      removeFromCart,
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

export function formatPrice(amount: number) {
  return `$${amount.toFixed(2)}`;
}
